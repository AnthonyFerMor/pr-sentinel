// ============================================================
// RUN-REVIEW.TS — Orquestación reutilizable del agente de review
// ------------------------------------------------------------
// Núcleo compartido por:
//   - /api/review        (SSE manual desde la UI)
//   - /api/webhooks/github (PR opened/synchronize)
//   - /api/cron          (revisión programada de PRs abiertos)
//
// Emite StreamEvents vía callback `onEvent` (no-op si no se pasa),
// así el mismo código sirve para streaming y para invocaciones headless.
// ============================================================

import { parsePRUrl } from './parser';
import {
  fetchPRMetadata,
  fetchPRFiles,
  postReviewComment,
  findLatestReviewComment,
  updateReviewComment,
} from './github';
import { processDiff, getChunkingSummary } from './chunking';
import { analyzeChunk, scoutHotspots, getPrimaryModelName } from './gemini';
import { formatReviewAsMarkdown, Hotspot } from './prompt';
import { resolveActiveSkills } from './skills';
import { ReviewResult, StreamEvent, PRInfo } from './types';

const TWO_PASS_ENABLED = process.env.TWO_PASS_ENABLED?.trim().toLowerCase() === 'true';
const TWO_PASS_THRESHOLD = Number.parseInt(process.env.TWO_PASS_THRESHOLD ?? '12000', 10);

export type ReviewMode = 'full' | 'lite';

export interface RunReviewOptions {
  /** Skill ids a activar. Si se omite, usa los default. */
  skills?: string[];
  /** Sink de eventos de progreso. Por defecto no-op. */
  onEvent?: (event: StreamEvent) => void;
  /**
   * Reply mode: si ya existe un comentario de PR Sentinel, lo actualiza (PATCH)
   * en vez de postear uno nuevo. Útil para webhooks/cron que re-revisan el mismo PR.
   */
  updateExisting?: boolean;
  /**
   * Idempotencia: si el último review ya cubre el head SHA actual, no re-revisa.
   * Pensado para cron/webhook (evita gastar tokens en lo ya revisado).
   */
  skipIfReviewed?: boolean;
  /** Presupuesto de tiempo en ms para el análisis (deja margen al timeout serverless). */
  softDeadlineMs?: number;
  /** Per-user Gemini API key (from encrypted cookie). Falls back to env var. */
  geminiApiKey?: string;
  /** Per-user GitHub token (from OAuth session). Falls back to env var. */
  githubToken?: string;
  /** Review mode: 'full' (default) or 'lite' (reduced token usage). */
  mode?: ReviewMode;
}

export interface RunReviewOutcome {
  review: ReviewResult | null;
  /** true si se saltó por idempotencia (ya revisado a este head SHA). */
  skipped: boolean;
  commentUrl?: string;
  commentError?: string;
}

const riskRank: Record<ReviewResult['overallRiskLevel'], number> = {
  clean: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function tryParseJsonObject(input: string): unknown {
  const text = input.trim();
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const unfenced = fenceMatch ? fenceMatch[1].trim() : text;

  try {
    return JSON.parse(unfenced);
  } catch {
    const firstBrace = unfenced.indexOf('{');
    const lastBrace = unfenced.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(unfenced.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Invalid JSON returned by model');
  }
}

function normalizeChunkReview(parsed: unknown): Omit<ReviewResult, 'metadata'> {
  const obj = (parsed ?? {}) as Partial<Omit<ReviewResult, 'metadata'>>;

  const categories = obj.categories ?? {
    bugs: [],
    security: [],
    performance: [],
    codeQuality: [],
    suggestions: [],
  };

  return {
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    overallRiskLevel:
      obj.overallRiskLevel && obj.overallRiskLevel in riskRank
        ? obj.overallRiskLevel
        : 'medium',
    categories: {
      bugs: Array.isArray(categories.bugs) ? categories.bugs : [],
      security: Array.isArray(categories.security) ? categories.security : [],
      performance: Array.isArray(categories.performance) ? categories.performance : [],
      codeQuality: Array.isArray(categories.codeQuality) ? categories.codeQuality : [],
      suggestions: Array.isArray(categories.suggestions) ? categories.suggestions : [],
    },
    positiveAspects: Array.isArray(obj.positiveAspects) ? obj.positiveAspects : [],
  };
}

function mergeChunkReviews(
  base: Omit<ReviewResult, 'metadata'> | null,
  next: Omit<ReviewResult, 'metadata'>
): Omit<ReviewResult, 'metadata'> {
  if (!base) return next;

  const overallRiskLevel =
    riskRank[next.overallRiskLevel] > riskRank[base.overallRiskLevel]
      ? next.overallRiskLevel
      : base.overallRiskLevel;

  const positiveAspects = Array.from(
    new Set([...(base.positiveAspects ?? []), ...(next.positiveAspects ?? [])])
  );

  return {
    summary: base.summary || next.summary,
    overallRiskLevel,
    categories: {
      bugs: [...base.categories.bugs, ...next.categories.bugs],
      security: [...base.categories.security, ...next.categories.security],
      performance: [...base.categories.performance, ...next.categories.performance],
      codeQuality: [...base.categories.codeQuality, ...next.categories.codeQuality],
      suggestions: [...base.categories.suggestions, ...next.categories.suggestions],
    },
    positiveAspects,
  };
}

/** Postea o actualiza el comentario del review en GitHub, respetando reply mode. */
async function publishReview(
  prInfo: PRInfo,
  review: ReviewResult,
  emit: (event: StreamEvent) => void,
  updateExisting: boolean,
  githubToken?: string,
): Promise<{ commentUrl?: string; commentError?: string }> {
  const markdown = formatReviewAsMarkdown(review);

  try {
    if (updateExisting) {
      const existing = await findLatestReviewComment(prInfo, githubToken);
      if (existing) {
        emit({ type: 'status', message: '✏️ Updating existing PR Sentinel comment...' });
        const { commentUrl } = await updateReviewComment(prInfo, existing.commentId, markdown, githubToken);
        review.metadata.commentUrl = commentUrl;
        emit({ type: 'status', message: `✅ Review updated: ${commentUrl}` });
        return { commentUrl };
      }
    }

    emit({ type: 'status', message: '📝 Posting review to GitHub...' });
    const { commentUrl } = await postReviewComment(prInfo, markdown, githubToken);
    review.metadata.commentUrl = commentUrl;
    emit({ type: 'status', message: `✅ Review posted: ${commentUrl}` });
    return { commentUrl };
  } catch (ghError) {
    const msg = ghError instanceof Error ? ghError.message : 'Unknown error';
    review.metadata.commentError = msg;
    emit({
      type: 'error',
      message: `GitHub comment failed. Check token permissions for ${prInfo.owner}/${prInfo.repo}. GitHub said: ${msg}`,
    });
    return { commentError: msg };
  }
}

/**
 * Ejecuta el review completo de un PR de principio a fin.
 * Lanza si el parseo/análisis falla irrecuperablemente; los errores de
 * GitHub al postear se devuelven en `commentError` (review igual se retorna).
 */
export async function runReview(
  prUrl: string,
  options: RunReviewOptions = {}
): Promise<RunReviewOutcome> {
  const startTime = Date.now();
  const emit = options.onEvent ?? (() => {});
  const updateExisting = options.updateExisting ?? false;
  const isLite = options.mode === 'lite';
  const liteSkills = ['security', 'bugs'];
  const activeSkills = isLite
    ? resolveActiveSkills(liteSkills)
    : resolveActiveSkills(options.skills);
  const thinkingBudgetOverride = isLite ? 1024 : undefined;
  const maxChunksOverride = isLite ? 2 : undefined;
  const { geminiApiKey, githubToken } = options;

  if (isLite) {
    emit({ type: 'status', message: '⚡ Lite mode: reduced thinking budget, fewer chunks, security + bugs only.' });
  }

  // 1. Parse URL
  emit({ type: 'status', message: '🔗 Parsing PR URL...' });
  const prInfo = parsePRUrl(prUrl);
  emit({ type: 'status', message: `📋 PR #${prInfo.pullNumber} in ${prInfo.owner}/${prInfo.repo}` });

  // 2. Fetch metadata
  emit({ type: 'status', message: '📥 Fetching PR metadata...' });
  const metadata = await fetchPRMetadata(prInfo, githubToken);
  emit({ type: 'metadata', data: metadata });
  emit({ type: 'status', message: `✅ "${metadata.title}" by ${metadata.author}` });

  // Fetch the previous review comment once — used for idempotency check AND context.
  const previousComment = await findLatestReviewComment(prInfo, githubToken);

  if (options.skipIfReviewed && previousComment?.marker.headSha === metadata.headSha) {
    emit({
      type: 'status',
      message: `⏭️ Already reviewed at head ${metadata.headSha.slice(0, 8)}. Skipping.`,
    });
    return { review: null, skipped: true, commentUrl: previousComment.htmlUrl };
  }

  const previousReviewBody = previousComment?.body;

  // 3. Fetch files
  emit({ type: 'status', message: '📂 Fetching changed files...' });
  const files = await fetchPRFiles(prInfo, githubToken);
  emit({
    type: 'status',
    message: `📂 ${files.length} files changed (+${metadata.additions}, -${metadata.deletions})`,
  });

  // 4. Process diff
  emit({ type: 'status', message: '🔧 Processing diff...' });
  const processedDiff = processDiff(files, activeSkills.map((s) => s.id));
  emit({ type: 'status', message: getChunkingSummary(processedDiff) });

  if (processedDiff.skippedFiles.length > 0) {
    emit({
      type: 'status',
      message: `⏭️ Skipped ${processedDiff.skippedFiles.length} files (binary/lock/generated)`,
    });
  }

  // 4b. Sin archivos analizables → review "clean" sin invocar al modelo.
  if (processedDiff.files.length === 0) {
    emit({
      type: 'status',
      message: 'No analyzable source files remained after filtering. Posting a clean skipped-files review.',
    });

    const review: ReviewResult = {
      summary:
        'This PR only changes files that PR Sentinel skips by policy, such as binary assets, generated files, or lock files. No analyzable source diff was available, so no code issues were detected.',
      overallRiskLevel: 'clean',
      categories: { bugs: [], security: [], performance: [], codeQuality: [], suggestions: [] },
      positiveAspects: [
        'PR Sentinel avoided sending binary, generated, or lock-file noise to the model.',
      ],
      metadata: {
        modelUsed: `${getPrimaryModelName()} (not invoked: no analyzable diff)`,
        cacheHit: false,
        cachedTokens: 0,
        totalTokens: 0,
        processingTimeMs: 0,
        chunksProcessed: 0,
        chunksPlanned: 0,
        partial: false,
        reviewedHeadSha: metadata.headSha,
        sourcePrUrl: prInfo.url,
      },
    };

    const published = await publishReview(prInfo, review, emit, updateExisting, githubToken);
    emit({ type: 'complete', data: review });
    return { review, skipped: false, ...published };
  }

  // 5. Analyze with Gemini
  emit({
    type: 'status',
    message: `🧩 Skills: ${activeSkills.map((s) => `${s.icon} ${s.name}`).join(', ')}`,
  });

  // Optional first-pass scan: locate hotspots to focus the deep review.
  // Skipped in lite mode to save tokens.
  let focusAreas: Hotspot[] = [];
  if (!isLite && TWO_PASS_ENABLED && processedDiff.totalTokensEstimate > TWO_PASS_THRESHOLD) {
    emit({ type: 'status', message: '🔍 First-pass scan: locating hotspots...' });
    focusAreas = await scoutHotspots(metadata, processedDiff.files, activeSkills, geminiApiKey);
    emit({
      type: 'status',
      message:
        focusAreas.length > 0
          ? `🎯 Scan flagged ${focusAreas.length} hotspot(s) for deep review.`
          : '🔍 Scan found no obvious hotspots; doing a full deep review.',
    });
  }

  emit({ type: 'status', message: `🤖 Starting AI analysis with ${getPrimaryModelName()}...` });

  let cacheInfo = { cacheHit: false, cachedTokens: 0, totalTokens: 0 };
  let merged: Omit<ReviewResult, 'metadata'> | null = null;
  let partial = false;
  // In lite mode, cap chunks to reduce token usage.
  const effectiveChunks = maxChunksOverride
    ? processedDiff.chunks.slice(0, maxChunksOverride)
    : processedDiff.chunks;
  const plannedChunks = effectiveChunks.length;
  const softDeadlineMs = options.softDeadlineMs ?? 55 * 1000;
  let processedChunks = 0;
  const modelsUsed = new Set<string>();

  for (const chunk of effectiveChunks) {
    if (Date.now() - startTime > softDeadlineMs) {
      partial = true;
      emit({
        type: 'status',
        message: `⏱️ Time budget reached. Returning partial review after ${chunk.id - 1}/${plannedChunks} chunks.`,
      });
      break;
    }
    if (processedDiff.requiresChunking) {
      emit({
        type: 'status',
        message: `📦 Processing chunk ${chunk.id}/${processedDiff.chunks.length} (${chunk.files.length} files)`,
      });
    }

    const { stream: geminiStream, getCacheInfo, getModelUsed } = await analyzeChunk(
      metadata,
      chunk.files,
      processedDiff.requiresChunking
        ? { chunkId: chunk.id, totalChunks: processedDiff.chunks.length }
        : undefined,
      {
        onStatus: (message) => emit({ type: 'status', message }),
        skills: activeSkills,
        allFiles: processedDiff.files,
        focusAreas,
        previousReviewBody,
        userApiKey: geminiApiKey,
        thinkingBudgetOverride,
      }
    );

    let chunkRaw = '';
    for await (const geminiChunk of geminiStream) {
      chunkRaw += geminiChunk.text;
      emit({ type: 'chunk', content: geminiChunk.text });
    }

    try {
      const parsed = tryParseJsonObject(chunkRaw);
      merged = mergeChunkReviews(merged, normalizeChunkReview(parsed));
      processedChunks += 1;
    } catch {
      emit({
        type: 'error',
        message: `Failed to parse AI response for chunk ${chunk.id}. Raw length: ${chunkRaw.length}`,
      });
      continue;
    }

    const chunkCacheInfo = await getCacheInfo();
    cacheInfo = {
      cacheHit: cacheInfo.cacheHit && chunkCacheInfo.cacheHit,
      cachedTokens: cacheInfo.cachedTokens + chunkCacheInfo.cachedTokens,
      totalTokens: cacheInfo.totalTokens + chunkCacheInfo.totalTokens,
    };
    modelsUsed.add(getModelUsed());

    emit({
      type: 'cache_info',
      cached: chunkCacheInfo.cacheHit,
      cachedTokens: chunkCacheInfo.cachedTokens,
      totalTokens: chunkCacheInfo.totalTokens,
    });
  }

  // 6. Build final result
  const processingTime = Date.now() - startTime;
  if (!merged) {
    throw new Error('No valid review response from AI model. All chunks failed to parse.');
  }

  const review: ReviewResult = {
    ...merged,
    metadata: {
      modelUsed: Array.from(modelsUsed).join(', ') || getPrimaryModelName(),
      ...cacheInfo,
      processingTimeMs: processingTime,
      chunksProcessed: processedChunks,
      chunksPlanned: plannedChunks,
      partial,
      reviewedHeadSha: metadata.headSha,
      sourcePrUrl: prInfo.url,
    },
  };

  if (review.metadata.partial) {
    const suffix = ` (Partial review: analyzed ${processedChunks}/${plannedChunks} chunks due to time budget.)`;
    review.summary = review.summary ? review.summary + suffix : suffix.trim();
  }

  // 7. Publish to GitHub (mandatory deliverable)
  const published = await publishReview(prInfo, review, emit, updateExisting, githubToken);

  // 8. Post re-verification summary when updating an existing review
  if (updateExisting && published.commentUrl && previousReviewBody) {
    try {
      const totalFindings =
        review.categories.security.length +
        review.categories.bugs.length +
        review.categories.performance.length +
        review.categories.codeQuality.length +
        review.categories.suggestions.length;

      const critCount = review.categories.security.filter((f) => f.severity === 'critical').length +
        review.categories.bugs.filter((f) => f.severity === 'critical').length;
      const highCount = review.categories.security.filter((f) => f.severity === 'high').length +
        review.categories.bugs.filter((f) => f.severity === 'high').length;

      const severity = critCount > 0 ? `${critCount} critical` : highCount > 0 ? `${highCount} high` : 'none critical/high';

      const summary = [
        '## 🔄 Re-verification Summary\n',
        `PR Sentinel re-analyzed this PR after new commits (head: \`${metadata.headSha.slice(0, 8)}\`). The main review comment above has been **updated** with the latest analysis.\n`,
        `**Current findings**: ${totalFindings} total (${severity})`,
        `- 🔒 Security: ${review.categories.security.length}`,
        `- 🐛 Bugs: ${review.categories.bugs.length}`,
        `- ⚡ Performance: ${review.categories.performance.length}`,
        `- 🧹 Code quality: ${review.categories.codeQuality.length}`,
        `- 💡 Suggestions: ${review.categories.suggestions.length}`,
        '',
        '---\n*🤖 PR Sentinel — automated re-verification*',
      ].join('\n');

      await postReviewComment(prInfo, summary, githubToken);
      emit({ type: 'status', message: '📊 Re-verification summary posted.' });
    } catch (err) {
      // Non-fatal: the main review was already posted/updated successfully.
      console.error('[run-review] Failed to post re-verification summary:', err);
    }
  }

  emit({ type: 'complete', data: review });

  return { review, skipped: false, ...published };
}
