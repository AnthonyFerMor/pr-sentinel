export const REVIEW_MARKER_NAME = 'pr-sentinel-review';

/** Compact fingerprint of a finding — enough to diff fixed/persisting/new. */
export interface MarkerFinding {
  file: string;
  title: string;
  severity: string;
  cweId?: string;
}

export interface ReviewMarker {
  version: 1;
  headSha: string;
  prUrl: string;
  generatedAt: string;
  model: string;
  /** Optional fingerprint of the findings in this review (added later; older comments omit it). */
  findings?: MarkerFinding[];
}

export function buildReviewMarker(
  marker: Omit<ReviewMarker, 'version' | 'generatedAt'>,
): string {
  const payload: ReviewMarker = {
    version: 1,
    generatedAt: new Date().toISOString(),
    ...marker,
  };

  return `<!-- ${REVIEW_MARKER_NAME} ${JSON.stringify(payload)} -->`;
}

export function parseReviewMarker(body: string): ReviewMarker | null {
  // Greedy {...} so nested objects (the findings array) are captured fully.
  // The JSON never contains "-->", so this stays bounded to the comment.
  const match = body.match(/<!--\s*pr-sentinel-review\s+(\{[\s\S]*\})\s*-->/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as Partial<ReviewMarker>;
    if (
      parsed.version === 1 &&
      typeof parsed.headSha === 'string' &&
      typeof parsed.prUrl === 'string' &&
      typeof parsed.generatedAt === 'string' &&
      typeof parsed.model === 'string'
    ) {
      return parsed as ReviewMarker;
    }
  } catch {
    return null;
  }

  return null;
}
