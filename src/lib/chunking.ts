// ============================================================
// CHUNKING.TS — Estrategia de chunking para PRs grandes
// ============================================================

import { DiffFile, DiffChunk, ProcessedDiff } from './types';

const CHARS_PER_TOKEN = parseInt(process.env.CHARS_PER_TOKEN ?? '4', 10);
const MAX_TOKENS_PER_CHUNK = parseInt(process.env.MAX_TOKENS_PER_CHUNK ?? '45000', 10);
const CHUNKING_THRESHOLD = parseInt(process.env.CHUNKING_THRESHOLD ?? '50000', 10);

/**
 * Estima la cantidad de tokens en un texto (~4 chars = 1 token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Procesa el diff de un PR: filtra, prioriza, y divide en chunks si necesario.
 *
 * Estrategia:
 * 1. Filtrar archivos sin valor (binarios, lock, generados)
 * 2. Ordenar por prioridad (high → medium → low)
 * 3. Si total > 50K tokens, dividir en chunks
 */
export function processDiff(files: DiffFile[]): ProcessedDiff {
  const skippedFiles: string[] = [];
  const analyzableFiles: DiffFile[] = [];

  for (const file of files) {
    if (file.priority === 'skip') {
      skippedFiles.push(file.filename);
    } else {
      analyzableFiles.push(file);
    }
  }

  const priorityOrder = { high: 0, medium: 1, low: 2, skip: 3 };
  analyzableFiles.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const totalTokensEstimate = analyzableFiles.reduce(
    (sum, file) => sum + estimateTokens(file.patch || ''),
    0
  );

  if (totalTokensEstimate <= CHUNKING_THRESHOLD) {
    return {
      files: analyzableFiles,
      totalTokensEstimate,
      requiresChunking: false,
      chunks: [{
        id: 1,
        files: analyzableFiles,
        tokenEstimate: totalTokensEstimate,
        priority: 'high',
      }],
      skippedFiles,
    };
  }

  const chunks = createChunks(analyzableFiles);

  return {
    files: analyzableFiles,
    totalTokensEstimate,
    requiresChunking: true,
    chunks,
    skippedFiles,
  };
}

function createChunks(files: DiffFile[]): DiffChunk[] {
  const chunks: DiffChunk[] = [];
  let currentChunk: DiffFile[] = [];
  let currentTokens = 0;
  let chunkId = 1;

  for (const file of files) {
    const fileTokens = estimateTokens(file.patch);

    // Single file exceeds limit — truncate
    if (fileTokens > MAX_TOKENS_PER_CHUNK) {
      if (currentChunk.length > 0) {
        chunks.push({
          id: chunkId++,
          files: [...currentChunk],
          tokenEstimate: currentTokens,
          priority: currentChunk[0].priority as DiffChunk['priority'],
        });
        currentChunk = [];
        currentTokens = 0;
      }

      const truncatedFile: DiffFile = {
        ...file,
        patch: file.patch.substring(0, MAX_TOKENS_PER_CHUNK * CHARS_PER_TOKEN) +
          '\n... [TRUNCATED — file too large] ...',
      };
      chunks.push({
        id: chunkId++,
        files: [truncatedFile],
        tokenEstimate: MAX_TOKENS_PER_CHUNK,
        priority: file.priority as DiffChunk['priority'],
      });
      continue;
    }

    if (currentTokens + fileTokens > MAX_TOKENS_PER_CHUNK && currentChunk.length > 0) {
      chunks.push({
        id: chunkId++,
        files: [...currentChunk],
        tokenEstimate: currentTokens,
        priority: currentChunk[0].priority as DiffChunk['priority'],
      });
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(file);
    currentTokens += fileTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push({
      id: chunkId++,
      files: [...currentChunk],
      tokenEstimate: currentTokens,
      priority: currentChunk[0].priority as DiffChunk['priority'],
    });
  }

  return chunks;
}

/**
 * Genera un resumen del chunking para logging.
 */
export function getChunkingSummary(diff: ProcessedDiff): string {
  if (!diff.requiresChunking) {
    return `📦 Single batch: ${diff.files.length} files, ~${diff.totalTokensEstimate.toLocaleString()} tokens`;
  }

  const chunkDetails = diff.chunks
    .map((c) => `  Chunk ${c.id}: ${c.files.length} files, ~${c.tokenEstimate.toLocaleString()} tokens [${c.priority}]`)
    .join('\n');

  return [
    `📦 Chunking activated: ~${diff.totalTokensEstimate.toLocaleString()} tokens → ${diff.chunks.length} chunks`,
    chunkDetails,
  ].join('\n');
}
