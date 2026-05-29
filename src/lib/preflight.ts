// ============================================================
// PREFLIGHT.TS — Cheap PR size estimate (NO Gemini call)
// ------------------------------------------------------------
// Runs after processDiff() to tell the UI, before spending any tokens:
//   - how big the PR is (files / tokens / chunks)
//   - whether a Full review will finish within the serverless time budget
//   - a recommended mode/scope that WILL fit
// This powers the "large PR → choose your scope" UX and guarantees the user
// is never surprised by a timeout.
// ============================================================

import type { ProcessedDiff, PRMetadata } from './types';

// Keep in sync with run-review.ts budget model.
const FULL_CHUNK_MS = Number.parseInt(process.env.FULL_CHUNK_MS ?? '48000', 10);
const LITE_CHUNK_MS = Number.parseInt(process.env.LITE_CHUNK_MS ?? '26000', 10);

export type SizeCategory = 'small' | 'medium' | 'large' | 'huge';

export interface PreflightEstimate {
  filesChanged: number;
  analyzableFiles: number;
  skippedFiles: number;
  estimatedTokens: number;
  plannedChunks: number;
  sizeCategory: SizeCategory;
  /** Will a Full review of the whole PR finish within the time budget? */
  fitsFull: boolean;
  recommendedMode: 'full' | 'lite';
  /** Chunks the recommended plan will actually analyze. */
  recommendedMaxChunks: number;
  /** Human-readable explanation for the UI. */
  message: string;
}

function fitChunks(softDeadlineMs: number, perChunkMs: number): number {
  return Math.max(1, Math.floor(softDeadlineMs / perChunkMs));
}

export function estimateReviewPlan(
  processedDiff: ProcessedDiff,
  metadata: PRMetadata,
  opts: { mode?: 'full' | 'lite'; softDeadlineMs?: number } = {},
): PreflightEstimate {
  const softDeadlineMs = opts.softDeadlineMs ?? 55 * 1000;
  const totalChunks = Math.max(1, processedDiff.chunks.length);
  const estimatedTokens = processedDiff.totalTokensEstimate;
  const analyzableFiles = processedDiff.files.length;
  const skippedFiles = processedDiff.skippedFiles.length;

  const fullFit = fitChunks(softDeadlineMs, FULL_CHUNK_MS);
  const liteFit = Math.min(2, fitChunks(softDeadlineMs, LITE_CHUNK_MS));
  const fitsFull = totalChunks <= fullFit;

  // Size category: from chunk count first (chunking implies a large diff).
  let sizeCategory: SizeCategory;
  if (totalChunks > 3) sizeCategory = 'huge';
  else if (totalChunks > 1) sizeCategory = 'large';
  else if (estimatedTokens > 15_000) sizeCategory = 'medium';
  else sizeCategory = 'small';

  // Recommendation: if Full won't cover the whole PR in time, recommend Lite
  // (fewer skills + lower thinking = faster) and cap chunks to what fits.
  const recommendedMode: 'full' | 'lite' = fitsFull ? 'full' : 'lite';
  const recommendedMaxChunks =
    recommendedMode === 'full' ? Math.min(totalChunks, fullFit) : Math.min(totalChunks, liteFit);

  let message: string;
  if (sizeCategory === 'small') {
    message = 'Small PR — a full review will complete quickly.';
  } else if (fitsFull) {
    message = `Medium PR (~${estimatedTokens.toLocaleString()} tokens). A full review fits within the time budget.`;
  } else {
    const covered = recommendedMaxChunks;
    message =
      `Large PR: ${analyzableFiles} analyzable files, ~${estimatedTokens.toLocaleString()} tokens, ${totalChunks} chunks. ` +
      `A full review won't finish in time. Recommended: ${recommendedMode === 'lite' ? 'Lite mode' : 'Full mode'} ` +
      `analyzing the ${covered} highest-priority chunk(s). You can adjust mode/skills below, or split the PR.`;
  }

  return {
    filesChanged: metadata.filesChanged,
    analyzableFiles,
    skippedFiles,
    estimatedTokens,
    plannedChunks: totalChunks,
    sizeCategory,
    fitsFull,
    recommendedMode,
    recommendedMaxChunks,
    message,
  };
}
