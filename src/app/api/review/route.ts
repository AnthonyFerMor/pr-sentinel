// ============================================================
// /api/review/route.ts — Endpoint principal del agente
// SSE streaming: status → metadata → chunks → complete
// ============================================================

import { NextRequest } from 'next/server';
import { parsePRUrl } from '@/lib/parser';
import { fetchPRMetadata, fetchPRFiles, postReviewComment } from '@/lib/github';
import { processDiff, getChunkingSummary } from '@/lib/chunking';
import { analyzeChunk } from '@/lib/gemini';
import { formatReviewAsMarkdown } from '@/lib/prompt';
import { ReviewResult, StreamEvent } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { prUrl, postToGitHub = false } = body;

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

        // 5. Analyze with Gemini
        send({ type: 'status', message: '🤖 Starting AI analysis with Gemini 3.5 Flash...' });

        let fullResponse = '';
        const startTime = Date.now();
        let cacheInfo = { cacheHit: false, cachedTokens: 0, totalTokens: 0 };

        for (const chunk of processedDiff.chunks) {
          if (processedDiff.requiresChunking) {
            send({
              type: 'status',
              message: `📦 Processing chunk ${chunk.id}/${processedDiff.chunks.length} (${chunk.files.length} files)`,
            });
          }

          const { stream: geminiStream, getCacheInfo } = await analyzeChunk(
            metadata,
            chunk.files,
            processedDiff.requiresChunking
              ? { chunkId: chunk.id, totalChunks: processedDiff.chunks.length }
              : undefined
          );

          for await (const geminiChunk of geminiStream) {
            fullResponse += geminiChunk.text;
            send({ type: 'chunk', content: geminiChunk.text });
          }

          const chunkCacheInfo = await getCacheInfo();
          cacheInfo = {
            cacheHit: cacheInfo.cacheHit || chunkCacheInfo.cacheHit,
            cachedTokens: cacheInfo.cachedTokens + chunkCacheInfo.cachedTokens,
            totalTokens: cacheInfo.totalTokens + chunkCacheInfo.totalTokens,
          };

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
          const parsed = JSON.parse(fullResponse);
          review = {
            ...parsed,
            metadata: {
              modelUsed: 'gemini-3.5-flash',
              ...cacheInfo,
              processingTimeMs: processingTime,
              chunksProcessed: processedDiff.chunks.length,
            },
          };
        } catch {
          send({ type: 'error', message: `Failed to parse AI response. Raw length: ${fullResponse.length}` });
          controller.close();
          return;
        }

        // 7. Post to GitHub if requested
        if (postToGitHub) {
          send({ type: 'status', message: '📝 Posting review to GitHub...' });
          try {
            const markdown = formatReviewAsMarkdown(review);
            const { commentUrl } = await postReviewComment(prInfo, markdown);
            send({ type: 'status', message: `✅ Review posted: ${commentUrl}` });
          } catch (ghError) {
            const msg = ghError instanceof Error ? ghError.message : 'Unknown error';
            send({ type: 'status', message: `⚠️ Failed to post to GitHub: ${msg}` });
          }
        }

        // 8. Send complete result
        send({ type: 'complete', data: review });

      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error occurred';
        send({ type: 'error', message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
