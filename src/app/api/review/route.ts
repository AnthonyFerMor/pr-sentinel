// ============================================================
// /api/review/route.ts — Endpoint principal del agente
// SSE streaming: status → metadata → chunks → complete
// ============================================================

import { NextRequest } from 'next/server';
import { parsePRUrl } from '@/lib/parser';
import { fetchPRMetadata, fetchPRFiles, postReviewComment } from '@/lib/github';
import { processDiff, getChunkingSummary } from '@/lib/chunking';
import { analyzeChunk, GeminiServiceError, getPrimaryModelName } from '@/lib/gemini';
import { formatReviewAsMarkdown } from '@/lib/prompt';
import { ReviewResult, StreamEvent } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function tryParseJsonObject(input: string): unknown {
  // Gemini usually obeys responseMimeType, but it can still add whitespace,
  // fences, or a short preface. Make parsing tolerant so the run doesn't fail.
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

const riskRank: Record<ReviewResult['overallRiskLevel'], number> = {
  clean: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

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

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { prUrl } = (body ?? {}) as {
    prUrl?: unknown;
  };

  if (!prUrl || typeof prUrl !== 'string') {
    return new Response(
      JSON.stringify({ error: 'prUrl is required in the request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: StreamEvent) {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      }

      try {
        // 1. Parse URL
        send({ type: 'status', message: '🔗 Parsing PR URL...' });
        const prInfo = parsePRUrl(prUrl);
        send({ type: 'status', message: `📋 PR #${prInfo.pullNumber} in ${prInfo.owner}/${prInfo.repo}` });

        // 2. Fetch metadata
        send({ type: 'status', message: '📥 Fetching PR metadata...' });
        
        const metadata = await fetchPRMetadata(prInfo);
        send({ type: 'metadata', data: metadata });
        send({ type: 'status', message: `✅ "${metadata.title}" by ${metadata.author}` });

        // 3. Fetch files
        send({ type: 'status', message: '📂 Fetching changed files...' });
        const files = await fetchPRFiles(prInfo);
        send({ type: 'status', message: `📂 ${files.length} files changed (+${metadata.additions}, -${metadata.deletions})` });

        // 4. Process diff
        send({ type: 'status', message: '🔧 Processing diff...' });
        const processedDiff = processDiff(files);
        send({ type: 'status', message: getChunkingSummary(processedDiff) });

        if (processedDiff.skippedFiles.length > 0) {
          send({
            type: 'status',
            message: `⏭️ Skipped ${processedDiff.skippedFiles.length} files (binary/lock/generated)`,
          });
        }

        if (processedDiff.files.length === 0) {
          send({
            type: 'status',
            message: 'No analyzable source files remained after filtering. Posting a clean skipped-files review.',
          });

          const review: ReviewResult = {
            summary:
              'This PR only changes files that PR Sentinel skips by policy, such as binary assets, generated files, or lock files. No analyzable source diff was available, so no code issues were detected.',
            overallRiskLevel: 'clean',
            categories: {
              bugs: [],
              security: [],
              performance: [],
              codeQuality: [],
              suggestions: [],
            },
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

          send({ type: 'status', message: '📝 Posting review to GitHub...' });
          try {
            const markdown = formatReviewAsMarkdown(review);
            const { commentUrl } = await postReviewComment(prInfo, markdown);
            review.metadata.commentUrl = commentUrl;
            send({ type: 'status', message: `✅ Review posted: ${commentUrl}` });
            send({ type: 'complete', data: review });
          } catch (ghError) {
            const msg = ghError instanceof Error ? ghError.message : 'Unknown error';
            review.metadata.commentError = msg;
            send({
              type: 'error',
              message: `GitHub comment failed, so the review was not marked complete. Check PR_SENTINEL_GITHUB_TOKEN permissions for ${prInfo.owner}/${prInfo.repo}. GitHub said: ${msg}`,
            });
            send({ type: 'complete', data: review });
          }
          return;
        }

        // 5. Analyze with Gemini
        send({ type: 'status', message: `🤖 Starting AI analysis with ${getPrimaryModelName()}...` });

        const startTime = Date.now();
        let cacheInfo = { cacheHit: false, cachedTokens: 0, totalTokens: 0 };
        let merged: Omit<ReviewResult, 'metadata'> | null = null;
        let partial = false;
        const plannedChunks = processedDiff.chunks.length;
        const softDeadlineMs = (maxDuration - 5) * 1000;
        let processedChunks = 0;
        const modelsUsed = new Set<string>();

        for (const chunk of processedDiff.chunks) {
          if ((Date.now() - startTime) > softDeadlineMs) {
            partial = true;
            send({
              type: 'status',
              message: `⏱️ Time budget reached. Returning partial review after ${chunk.id - 1}/${plannedChunks} chunks.`,
            });
            break;
          }
          if (processedDiff.requiresChunking) {
            send({
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
            { onStatus: (message) => send({ type: 'status', message }) }
          );

          let chunkRaw = '';
          for await (const geminiChunk of geminiStream) {
            chunkRaw += geminiChunk.text;
            send({ type: 'chunk', content: geminiChunk.text });
          }

          try {
            const parsed = tryParseJsonObject(chunkRaw);
            merged = mergeChunkReviews(merged, normalizeChunkReview(parsed));
            processedChunks += 1;
          } catch {
            send({
              type: 'error',
              message: `Failed to parse AI response for chunk ${chunk.id}. Raw length: ${chunkRaw.length}`,
            });
            controller.close();
            return;
          }

          const chunkCacheInfo = await getCacheInfo();
          cacheInfo = {
            cacheHit: cacheInfo.cacheHit && chunkCacheInfo.cacheHit,
            cachedTokens: cacheInfo.cachedTokens + chunkCacheInfo.cachedTokens,
            totalTokens: cacheInfo.totalTokens + chunkCacheInfo.totalTokens,
          };
          modelsUsed.add(getModelUsed());

          send({
            type: 'cache_info',
            cached: chunkCacheInfo.cacheHit,
            cachedTokens: chunkCacheInfo.cachedTokens,
            totalTokens: chunkCacheInfo.totalTokens,
          });
        }

        // 6. Parse result
        const processingTime = Date.now() - startTime;
        let review: ReviewResult;

        try {
          if (!merged) {
            send({ type: 'error', message: 'No valid review response from AI model. All chunks failed to parse.' });
            controller.close();
            return;
          }
          review = {
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
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          send({ type: 'error', message: `Failed to build final review from AI response: ${errorMsg}` });
          controller.close();
          return;
        }

        if (review.metadata.partial) {
          const suffix = ` (Partial review: analyzed ${processedChunks}/${plannedChunks} chunks due to time budget.)`;
          review.summary = review.summary ? (review.summary + suffix) : suffix.trim();
        }

        // 7. Post to GitHub. This is mandatory for the hackathon deliverable.
        send({ type: 'status', message: '📝 Posting review to GitHub...' });
        try {
          const markdown = formatReviewAsMarkdown(review);
          const { commentUrl } = await postReviewComment(prInfo, markdown);
          review.metadata.commentUrl = commentUrl;
          send({ type: 'status', message: `✅ Review posted: ${commentUrl}` });
        } catch (ghError) {
          const msg = ghError instanceof Error ? ghError.message : 'Unknown error';
          review.metadata.commentError = msg;
          send({
            type: 'error',
            message: `GitHub comment failed, so the review was not marked complete. Check PR_SENTINEL_GITHUB_TOKEN permissions for ${prInfo.owner}/${prInfo.repo}. GitHub said: ${msg}`,
          });
          send({ type: 'complete', data: review });
          return;
        }

        // 8. Send complete result
        send({ type: 'complete', data: review });

      } catch (error) {
        const msg =
          error instanceof GeminiServiceError
            ? error.userMessage
            : error instanceof Error
              ? error.message
              : 'Unknown error occurred';
        send({ type: 'error', message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      // Avoid any intermediary buffering (helps Vercel/Proxies stream smoothly).
      'X-Accel-Buffering': 'no',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
