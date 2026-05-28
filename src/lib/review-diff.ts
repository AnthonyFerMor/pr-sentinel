// ============================================================
// REVIEW-DIFF.TS — Compare two reviews to show resolution status
// ------------------------------------------------------------
// After re-reviewing a PR on new commits, this module compares
// the old and new reviews to generate a "resolution summary"
// showing which findings were fixed, which persist, and what's new.
// ============================================================

import { ReviewFinding, ReviewResult } from './types';

export interface ReviewDiffResult {
  fixed: ReviewFinding[];
  persisting: ReviewFinding[];
  newFindings: ReviewFinding[];
}

/**
 * Compute a simple similarity score between two findings.
 * Based on matching file + similar title.
 */
function findingSimilarity(a: ReviewFinding, b: ReviewFinding): number {
  let score = 0;

  // Same file is a strong signal
  if (a.file === b.file) score += 0.5;

  // Similar title (simple word overlap)
  const wordsA = new Set(a.title.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.title.toLowerCase().split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  if (union.size > 0) {
    score += 0.3 * (intersection.length / union.size);
  }

  // Same severity
  if (a.severity === b.severity) score += 0.1;

  // Same CWE
  if (a.cweId && b.cweId && a.cweId === b.cweId) score += 0.1;

  return score;
}

function getAllFindings(review: ReviewResult): ReviewFinding[] {
  return [
    ...review.categories.security,
    ...review.categories.bugs,
    ...review.categories.performance,
    ...review.categories.codeQuality,
    ...review.categories.suggestions,
  ];
}

const SIMILARITY_THRESHOLD = 0.5;

/**
 * Diff two reviews: old vs new.
 * - "fixed": findings in old but NOT in new (they were resolved)
 * - "persisting": findings in old that still appear in new
 * - "newFindings": findings in new that weren't in old
 */
export function diffReviews(
  oldReview: ReviewResult,
  newReview: ReviewResult,
): ReviewDiffResult {
  const oldFindings = getAllFindings(oldReview);
  const newFindings = getAllFindings(newReview);

  const matchedOld = new Set<number>();
  const matchedNew = new Set<number>();

  // Match old findings to new findings
  for (let i = 0; i < oldFindings.length; i++) {
    let bestMatch = -1;
    let bestScore = 0;

    for (let j = 0; j < newFindings.length; j++) {
      if (matchedNew.has(j)) continue;
      const score = findingSimilarity(oldFindings[i], newFindings[j]);
      if (score > bestScore && score >= SIMILARITY_THRESHOLD) {
        bestScore = score;
        bestMatch = j;
      }
    }

    if (bestMatch >= 0) {
      matchedOld.add(i);
      matchedNew.add(bestMatch);
    }
  }

  const fixed = oldFindings.filter((_, i) => !matchedOld.has(i));
  const persisting = oldFindings.filter((_, i) => matchedOld.has(i));
  const brandNew = newFindings.filter((_, j) => !matchedNew.has(j));

  return { fixed, persisting, newFindings: brandNew };
}

/**
 * Format the diff result as a GitHub markdown comment.
 */
export function formatResolutionSummary(diff: ReviewDiffResult): string {
  const sections: string[] = [];

  sections.push('## 🔄 Re-verification Summary\n');
  sections.push(`PR Sentinel re-analyzed this PR after new commits. Here's what changed:\n`);

  if (diff.fixed.length > 0) {
    sections.push(`### ✅ Fixed (${diff.fixed.length})\n`);
    for (const f of diff.fixed) {
      sections.push(`- ~~**${f.title}**~~ in \`${f.file}\` — resolved!`);
    }
    sections.push('');
  }

  if (diff.persisting.length > 0) {
    sections.push(`### ⚠️ Still Present (${diff.persisting.length})\n`);
    for (const f of diff.persisting) {
      sections.push(`- **${f.title}** in \`${f.file}\` — still needs attention`);
    }
    sections.push('');
  }

  if (diff.newFindings.length > 0) {
    sections.push(`### 🆕 New Findings (${diff.newFindings.length})\n`);
    for (const f of diff.newFindings) {
      sections.push(`- **${f.title}** [${f.severity}] in \`${f.file}\``);
    }
    sections.push('');
  }

  if (diff.fixed.length === 0 && diff.persisting.length === 0 && diff.newFindings.length === 0) {
    sections.push('No significant changes in findings between reviews.\n');
  }

  sections.push('---\n*🤖 PR Sentinel — automated re-verification*');

  return sections.join('\n');
}
