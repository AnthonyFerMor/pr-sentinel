export const REVIEW_MARKER_NAME = 'pr-sentinel-review';

export interface ReviewMarker {
  version: 1;
  headSha: string;
  prUrl: string;
  generatedAt: string;
  model: string;
}

export function buildReviewMarker(marker: Omit<ReviewMarker, 'version' | 'generatedAt'>): string {
  const payload: ReviewMarker = {
    version: 1,
    generatedAt: new Date().toISOString(),
    ...marker,
  };

  return `<!-- ${REVIEW_MARKER_NAME} ${JSON.stringify(payload)} -->`;
}

export function parseReviewMarker(body: string): ReviewMarker | null {
  const match = body.match(/<!--\s*pr-sentinel-review\s+({[\s\S]*?})\s*-->/);
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
