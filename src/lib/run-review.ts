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
  postInlineReview,
  findLatestReviewComment,
  findLatestSentinelReview,
  updateReviewComment,
} from './github';
import { processDiff, getChunkingSummary } from './chunking';
import { analyzeChunk, scoutHotspots, getPrimaryModelName } from './gemini';
import { formatReview, formatInlineComment, formatInlineReviewBody, Hotspot } from './prompt';
import { buildValidLineMap, partitionFindings } from './patch-lines';
import { resolveActiveSkills, Skill } from './skills';
import { diffReviews } from './review-diff';
import type { ProcessedDiff, ReviewFinding } from './types';
import { calculateRiskScore } from './risk-score';
import { recordReview, pushRecentReview } from './storage';
import { ReviewResult, StreamEvent, PRInfo, DiffFile, PRMetadata } from './types';

// Máximo de comentarios inline en una sola review request (la API tiene un
// límite suave y comentarios muy abundantes generan ruido). Si hay más, los
// excedentes caen al cuerpo principal.
const MAX_INLINE_COMMENTS = 30;

const TWO_PASS_ENABLED = process.env.TWO_PASS_ENABLED?.trim().toLowerCase() === 'true';
const TWO_PASS_THRESHOLD = Number.parseInt(process.env.TWO_PASS_THRESHOLD ?? '12000', 10);

export type ReviewMode = 'full' | 'lite';
export type ReviewStyle = 'full' | 'lite' | 'caveman';

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
  /** Output format for the GitHub comment. 'caveman' = ultra-terse, ~70% fewer output tokens. Default = 'full'. */
  reviewStyle?: ReviewStyle;
  /**
   * Si true, postea cada finding como inline comment anclado a su línea del
   * diff (review API de GitHub). Si false, postea un único comentario al final.
   * Default = true: más útil para el desarrollador.
   */
  inlineMode?: boolean;
  /** User ID para trackear stats en KV. Opcional. */
  userId?: string;
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

/**
 * Postea el review en GitHub. Soporta dos modos:
 *
 *  - **inline** (default): usa la Pull Request Review API para anclar cada
 *    finding a la línea exacta del diff. Findings sin línea válida caen al
 *    cuerpo principal del review para que nada se pierda.
 *
 *  - **comment** (legacy / `inlineMode=false` o `updateExisting=true`):
 *    postea o actualiza un único comentario al final del PR. Útil para el
 *    flujo de "reply mode" porque inline reviews no se pueden editar.
 *
 * Si el modo inline falla por cualquier razón (422 en alguna línea, falta de
 * permisos, etc.), hace fallback al modo comentario para que el review siempre
 * termine publicándose.
 */
async function publishReview(
  prInfo: PRInfo,
  review: ReviewResult,
  emit: (event: StreamEvent) => void,
  updateExisting: boolean,
  githubToken?: string,
  reviewStyle?: ReviewStyle,
  options?: {
    inlineMode?: boolean;
    diffFiles?: DiffFile[];
    headSha?: string;
    prSize?: { additions?: number; deletions?: number; filesChanged?: number };
  },
): Promise<{ commentUrl?: string; commentError?: string }> {
  const inlineMode = options?.inlineMode ?? false;
  const diffFiles = options?.diffFiles;
  const headSha = options?.headSha;

  // Inline mode requiere headSha + diff files. Si falta algo o si estamos en
  // reply mode (updateExisting), caemos al modo comentario.
  const canUseInline =
    inlineMode &&
    !updateExisting &&
    !!headSha &&
    !!diffFiles &&
    diffFiles.length > 0;

  if (canUseInline) {
    try {
      const validLines = buildValidLineMap(diffFiles!);
      const partition = partitionFindings(review.categories, validLines);

      // Respeta el cap de comentarios inline. Excedentes → leftover.
      const sortedInline = [...partition.inline].sort((a, b) => severityWeight(b.finding.severity) - severityWeight(a.finding.severity));
      const inlineKept = sortedInline.slice(0, MAX_INLINE_COMMENTS);
      const inlineOverflow = sortedInline.slice(MAX_INLINE_COMMENTS);
      const leftover = [...partition.leftover, ...inlineOverflow.map((i) => ({ finding: i.finding, category: i.category }))];

      const body = formatInlineReviewBody(review, inlineKept.length, leftover, options?.prSize);
      const comments = inlineKept.map((entry) => ({
        path: entry.finding.file,
        line: entry.line,
        startLine: entry.startLine,
        body: formatInlineComment(entry.finding, entry.category),
      }));

      emit({
        type: 'status',
        message: `📝 Posting inline review (${comments.length} inline + ${leftover.length} general)...`,
      });

      const { reviewUrl } = await postInlineReview(
        prInfo,
        { headSha: headSha!, body, comments },
        githubToken,
      );
      review.metadata.commentUrl = reviewUrl;
      emit({ type: 'status', message: `✅ Inline review posted: ${reviewUrl}` });
      return { commentUrl: reviewUrl };
    } catch (inlineErr) {
      const msg = inlineErr instanceof Error ? inlineErr.message : 'Unknown error';
      console.warn(`[publishReview] Inline mode failed, falling back to comment mode: ${msg}`);
      emit({
        type: 'status',
        message: `⚠️ Inline review failed (${msg.slice(0, 80)}). Falling back to single comment.`,
      });
      // Continúa al fallback de comentario abajo.
    }
  }

  // Modo comentario tradicional (legacy o fallback).
  const markdown = formatReview(review, reviewStyle);

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

function severityWeight(severity: string): number {
  switch (severity) {
    case 'critical': return 5;
    case 'high': return 4;
    case 'medium': return 3;
    case 'low': return 2;
    case 'info': return 1;
    default: return 0;
  }
}

// ── Budget planning (never-fail core) ──────────────────────────────────────
// A single Gemini chunk on a serverless function with a hard wall-clock limit
// (Vercel hobby = 60s) can blow the budget and get the whole function killed
// mid-stream. To guarantee we ALWAYS return a (possibly partial) review, we:
//   1. Size how many chunks can realistically finish within the deadline.
//   2. Lower the thinking budget when we're forced to truncate a large PR.
// Observed: a small full-mode review takes ~50s; lite is faster (~26s).
const FULL_CHUNK_MS = Number.parseInt(process.env.FULL_CHUNK_MS ?? '48000', 10);
const LITE_CHUNK_MS = Number.parseInt(process.env.LITE_CHUNK_MS ?? '26000', 10);

// When a PR is too big to fit, we re-chunk into SMALLER pieces so the single
// chunk we analyze reliably finishes within the deadline (guaranteeing a real
// partial review instead of nothing).
const RECHUNK_TOKENS = Number.parseInt(process.env.RECHUNK_TOKENS ?? '16000', 10);
// Any single chunk larger than this is considered too slow to finish reliably,
// so we re-chunk even if the chunk COUNT already fits.
const SAFE_CHUNK_TOKENS = Number.parseInt(process.env.SAFE_CHUNK_TOKENS ?? '20000', 10);

interface BudgetPlan {
  maxChunks: number;
  thinkingBudget: number | undefined; // undefined = model default
  skills: Skill[];
  /** If set, re-chunk the diff with this smaller per-chunk token cap. */
  rechunkTokens?: number;
  note?: string;
}

function computeBudgetPlan(opts: {
  processedDiff: ProcessedDiff;
  mode: ReviewMode;
  softDeadlineMs: number;
  requestedSkills: Skill[];
}): BudgetPlan {
  const { processedDiff, mode, softDeadlineMs, requestedSkills } = opts;
  const isLite = mode === 'lite';
  const perChunkMs = isLite ? LITE_CHUNK_MS : FULL_CHUNK_MS;
  const totalChunks = Math.max(1, processedDiff.chunks.length);

  // How many chunks can we realistically finish within the deadline? Always >= 1.
  const fitChunks = Math.max(1, Math.floor(softDeadlineMs / perChunkMs));
  const liteCap = isLite ? 2 : Number.POSITIVE_INFINITY;
  let maxChunks = Math.min(totalChunks, fitChunks, liteCap);

  let thinkingBudget: number | undefined = isLite ? 1024 : undefined;

  // Largest chunk we'd actually analyze (token-wise). A chunk this big may not
  // finish in time even if the COUNT fits — so size matters too.
  const analyzedChunks = processedDiff.chunks.slice(0, maxChunks);
  const largestChunkTokens = analyzedChunks.reduce((m, c) => Math.max(m, c.tokenEstimate), 0);

  // Truncate when the PR has more chunks than fit, OR any analyzed chunk is too
  // big to finish reliably within the per-chunk budget.
  const truncating = maxChunks < totalChunks || largestChunkTokens > SAFE_CHUNK_TOKENS;
  let rechunkTokens: number | undefined;
  if (truncating) {
    // Re-chunk into small pieces and analyze just ONE so it reliably completes
    // and returns a real partial review. Drop reasoning cost too.
    rechunkTokens = RECHUNK_TOKENS;
    maxChunks = 1;
    thinkingBudget = isLite ? 1024 : 2048;
  }

  let note: string | undefined;
  if (truncating) {
    note = `📐 Large PR detected: analyzing the highest-priority slice (~${RECHUNK_TOKENS.toLocaleString()} tokens) to return a focused review within the time budget. Re-run or use Lite mode for more coverage.`;
  } else if (isLite) {
    note = '⚡ Lite mode: reduced thinking budget, fewer chunks, security + bugs only.';
  }

  return { maxChunks, thinkingBudget, skills: requestedSkills, rechunkTokens, note };
}

/**
 * Consume a Gemini text stream but never block past `deadlineAt`. If the
 * deadline hits mid-stream we stop reading, tear down the underlying request,
 * and report `timedOut` so the caller can return a graceful partial result
 * instead of letting Vercel kill the whole function.
 */
async function consumeStreamWithDeadline(
  stream: AsyncIterable<{ text: string }>,
  deadlineAt: number,
  onText: (text: string) => void,
): Promise<{ raw: string; timedOut: boolean }> {
  const iterator = stream[Symbol.asyncIterator]();
  let raw = '';
  let timedOut = false;
  try {
    while (true) {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) {
        timedOut = true;
        break;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutP = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), remaining);
      });
      const result = await Promise.race([iterator.next(), timeoutP]);
      if (timer) clearTimeout(timer);
      if (result === 'timeout') {
        timedOut = true;
        break;
      }
      if (result.done) break;
      raw += result.value.text;
      onText(result.value.text);
    }
  } finally {
    // Best-effort teardown of the underlying Gemini stream.
    try {
      await iterator.return?.();
    } catch {
      /* ignore */
    }
  }
  return { raw, timedOut };
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
  const mode: ReviewMode = options.mode === 'lite' ? 'lite' : 'full';
  const isLite = mode === 'lite';
  const liteSkills = ['security', 'bugs'];
  // Skills the user requested — used for diff prioritization and analysis.
  // The budget plan (computed after processDiff) may keep or trim these.
  const requestedSkills = isLite
    ? resolveActiveSkills(liteSkills)
    : resolveActiveSkills(options.skills);
  const softDeadlineMs = options.softDeadlineMs ?? 55 * 1000;
  const { geminiApiKey, githubToken } = options;

  // 1. Parse URL
  emit({ type: 'status', message: '🔗 Parsing PR URL...' });
  const prInfo = parsePRUrl(prUrl);
  emit({ type: 'status', message: `📋 PR #${prInfo.pullNumber} in ${prInfo.owner}/${prInfo.repo}` });

  // 2. Fetch metadata
  emit({ type: 'status', message: '📥 Fetching PR metadata...' });
  const metadata = await fetchPRMetadata(prInfo, githubToken);
  emit({ type: 'metadata', data: metadata });
  emit({ type: 'status', message: `✅ "${metadata.title}" by ${metadata.author}` });

  // Fetch the previous review once — across BOTH modes (issue comment OR inline
  // review submission). Used for idempotency, context, and dedup so the bot
  // never posts a duplicate review.
  const previousReview = await findLatestSentinelReview(prInfo, githubToken);

  if (options.skipIfReviewed && previousReview?.marker.headSha === metadata.headSha) {
    emit({
      type: 'status',
      message: `⏭️ Already reviewed at head ${metadata.headSha.slice(0, 8)}. Skipping.`,
    });
    return { review: null, skipped: true, commentUrl: previousReview.htmlUrl };
  }

  const previousReviewBody = previousReview?.body;
  // Dedup: if a prior Sentinel review exists, evolve a single comment instead
  // of stacking a new one. (Manual UI runs rely on this; webhooks already set
  // updateExisting.) Inline can't be patched in place, so re-runs fall to the
  // comment-update path in publishReview.
  const hasPriorReview = !!previousReview;

  // 3. Fetch files
  emit({ type: 'status', message: '📂 Fetching changed files...' });
  const files = await fetchPRFiles(prInfo, githubToken);
  emit({
    type: 'status',
    message: `📂 ${files.length} files changed (+${metadata.additions}, -${metadata.deletions})`,
  });

  // 4. Process diff
  emit({ type: 'status', message: '🔧 Processing diff...' });
  let processedDiff = processDiff(files, requestedSkills.map((s) => s.id));
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

    // Clean review (no diff): no hay nada que anclar inline, postear como comentario.
    const published = await publishReview(
      prInfo,
      review,
      emit,
      updateExisting,
      githubToken,
      options.reviewStyle,
      { inlineMode: false },
    );
    emit({ type: 'complete', data: review });
    return { review, skipped: false, ...published };
  }

  // 4c. Budget plan: decide how many chunks / how much reasoning fits the
  // deadline so the run NEVER gets killed mid-stream. Applies to all modes.
  const budget = computeBudgetPlan({ processedDiff, mode, softDeadlineMs, requestedSkills });
  const activeSkills = budget.skills;
  const thinkingBudgetOverride = budget.thinkingBudget;
  if (budget.note) emit({ type: 'status', message: budget.note });

  // Re-chunk smaller for large PRs so the single analyzed chunk reliably
  // finishes and returns a real (partial) review instead of timing out.
  if (budget.rechunkTokens) {
    processedDiff = processDiff(files, activeSkills.map((s) => s.id), budget.rechunkTokens);
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
  // Cap chunks to what the budget plan says fits the deadline.
  const effectiveChunks = processedDiff.chunks.slice(0, budget.maxChunks);
  const plannedChunks = effectiveChunks.length;
  const deadlineAt = startTime + softDeadlineMs;
  let processedChunks = 0;
  const modelsUsed = new Set<string>();

  for (const chunk of effectiveChunks) {
    if (Date.now() > deadlineAt) {
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

    const { raw: chunkRaw, timedOut } = await consumeStreamWithDeadline(
      geminiStream,
      deadlineAt,
      (text) => emit({ type: 'chunk', content: text }),
    );

    if (timedOut) {
      // The model didn't finish this chunk in time. Stop here and keep
      // whatever earlier chunks already produced (graceful partial).
      partial = true;
      emit({
        type: 'status',
        message: `⏱️ Time budget reached mid-analysis. Returning a partial review (${processedChunks}/${plannedChunks} chunks completed).`,
      });
      break;
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
      // A review is a cache hit if ANY chunk reused the cached primer. (The old
      // AND-from-a-false-seed could never become true, so the metadata always
      // reported "Cache Hit: No" even when the cache was reused.)
      cacheHit: cacheInfo.cacheHit || chunkCacheInfo.cacheHit,
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
    // Never-fail: if we ran out of time before the first chunk produced a
    // usable result, surface a clear, actionable message instead of throwing
    // (which the SSE would render as a generic crash).
    if (partial) {
      emit({
        type: 'error',
        message:
          'This PR is too large to finish even one analysis pass within the time limit. Try Lite mode (security + bugs only) or review a smaller PR / fewer files.',
      });
      return { review: null, skipped: false };
    }
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

  // 6b. If a prior review exists with a findings fingerprint, fold a compact
  // re-verification summary INTO this review's summary (single evolving
  // comment — no separate stacking comment).
  if (hasPriorReview && previousReview?.marker.findings?.length) {
    try {
      const prevFindings = previousReview.marker.findings;
      const oldShape: ReviewResult = {
        summary: '',
        overallRiskLevel: 'low',
        categories: {
          bugs: prevFindings.map((f) => ({
            title: f.title,
            severity: f.severity as ReviewFinding['severity'],
            file: f.file,
            description: '',
            suggestion: '',
            cweId: f.cweId,
          })),
          security: [],
          performance: [],
          codeQuality: [],
          suggestions: [],
        },
        positiveAspects: [],
        metadata: review.metadata,
      };
      const diff = diffReviews(oldShape, review);
      const line = `🔄 Re-review vs previous: ✅ ${diff.fixed.length} fixed · ⚠️ ${diff.persisting.length} still present · 🆕 ${diff.newFindings.length} new.`;
      review.summary = review.summary ? `${line}\n\n${review.summary}` : line;
    } catch (err) {
      console.warn('[run-review] re-verification fold-in failed (non-fatal):', err);
    }
  }

  // 7. Publish to GitHub (mandatory deliverable)
  // Dedup: update in place whenever a prior review exists (even a manual re-run
  // from the UI), so we never stack duplicate reviews.
  const effectiveUpdateExisting = updateExisting || hasPriorReview;
  const inlineMode = options.inlineMode ?? true;
  const published = await publishReview(
    prInfo,
    review,
    emit,
    effectiveUpdateExisting,
    githubToken,
    options.reviewStyle,
    {
      inlineMode,
      diffFiles: processedDiff.files,
      headSha: metadata.headSha,
      prSize: {
        additions: metadata.additions,
        deletions: metadata.deletions,
        filesChanged: metadata.filesChanged,
      },
    },
  );

  // Re-verification is now folded into the single evolving comment (step 6b),
  // so we no longer post a separate stacking comment here.

  // 9. Emit complete FIRST so the client gets results even if stats save is slow.
  emit({ type: 'complete', data: review });

  // 10. Track stats (best-effort, fire-and-forget — never delays the stream).
  if (options.userId) {
    void trackStats(options.userId, review, metadata, prInfo, published.commentUrl);
  }

  return { review, skipped: false, ...published };
}

/**
 * Suma esta review a los contadores del usuario en KV. Best-effort, no lanza.
 * Llamado al final de runReview cuando hay userId.
 */
async function trackStats(
  userId: string,
  review: ReviewResult,
  metadata: PRMetadata,
  prInfo: PRInfo,
  commentUrl?: string,
): Promise<void> {
  try {
    const sev = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const [, findings] of Object.entries(review.categories)) {
      for (const f of findings) {
        if (f.severity in sev) sev[f.severity] += 1;
      }
    }
    const byCategory = {
      security: review.categories.security.length,
      bugs: review.categories.bugs.length,
      performance: review.categories.performance.length,
      codeQuality: review.categories.codeQuality.length,
      suggestions: review.categories.suggestions.length,
    };
    const findingsCount =
      byCategory.security + byCategory.bugs + byCategory.performance + byCategory.codeQuality + byCategory.suggestions;

    await Promise.all([
      recordReview(userId, {
        findings: sev,
        byCategory,
        tokensUsed: review.metadata.totalTokens,
        cacheHit: review.metadata.cacheHit,
      }),
      pushRecentReview(userId, {
        prUrl: prInfo.url,
        prTitle: metadata.title,
        owner: prInfo.owner,
        repo: prInfo.repo,
        pullNumber: prInfo.pullNumber,
        riskLevel: review.overallRiskLevel,
        riskScore: calculateRiskScore(review, {
          additions: metadata.additions,
          deletions: metadata.deletions,
          filesChanged: metadata.filesChanged,
        }).score,
        findingsCount,
        reviewedAt: Date.now(),
        commentUrl,
      }),
    ]);
  } catch (err) {
    console.warn('[run-review] stats tracking failed (non-fatal):', err);
  }
}
