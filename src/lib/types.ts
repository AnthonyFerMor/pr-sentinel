// ============================================================
// TYPES.TS — Definición central de tipos del proyecto PR Sentinel
// ============================================================

/**
 * Información parseada de una URL de PR de GitHub.
 * Ejemplo: "https://github.com/owner/repo/pull/123"
 *   → { owner: "owner", repo: "repo", pullNumber: 123 }
 */
export interface PRInfo {
  owner: string;
  repo: string;
  pullNumber: number;
  url: string;
}

/**
 * Metadata de un Pull Request obtenida de la GitHub API.
 */
export interface PRMetadata {
  title: string;
  body: string | null;
  author: string;
  baseBranch: string;
  headBranch: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  state: string;
  createdAt: string;
}

/**
 * Un archivo individual dentro del diff de un PR.
 */
export interface DiffFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  patch: string;
  isBinary: boolean;
  isLockFile: boolean;
  isGenerated: boolean;
  priority: 'high' | 'medium' | 'low' | 'skip';
}

/**
 * El diff completo de un PR, ya procesado y categorizado.
 */
export interface ProcessedDiff {
  files: DiffFile[];
  totalTokensEstimate: number;
  requiresChunking: boolean;
  chunks: DiffChunk[];
  skippedFiles: string[];
}

/**
 * Un chunk de diff para procesar cuando el PR es muy grande.
 */
export interface DiffChunk {
  id: number;
  files: DiffFile[];
  tokenEstimate: number;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Estructura del review generado por Gemini (structured output).
 */
export interface ReviewResult {
  summary: string;
  overallRiskLevel: 'critical' | 'high' | 'medium' | 'low' | 'clean';
  categories: {
    bugs: ReviewFinding[];
    security: ReviewFinding[];
    performance: ReviewFinding[];
    codeQuality: ReviewFinding[];
    suggestions: ReviewFinding[];
  };
  positiveAspects: string[];
  metadata: {
    modelUsed: string;
    cachedTokens: number;
    totalTokens: number;
    cacheHit: boolean;
    processingTimeMs: number;
    chunksProcessed: number;
  };
}

/**
 * Un hallazgo individual dentro del review.
 */
export interface ReviewFinding {
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  file: string;
  lineRange?: string;
  description: string;
  suggestion: string;
  cweId?: string;
}

/**
 * Evento enviado via Server-Sent Events (SSE) durante el streaming.
 */
export type StreamEvent =
  | { type: 'status'; message: string }
  | { type: 'metadata'; data: PRMetadata }
  | { type: 'chunk'; content: string }
  | { type: 'finding'; data: ReviewFinding; category: string }
  | { type: 'cache_info'; cached: boolean; cachedTokens: number; totalTokens: number }
  | { type: 'complete'; data: ReviewResult }
  | { type: 'error'; message: string };
