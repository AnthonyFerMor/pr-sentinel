// ============================================================
// /api/review/estimate/route.ts — Pre-flight size check (NO Gemini)
// Fast: only GitHub API + local processDiff. Tells the UI how big the PR is,
// whether a full review fits the time budget, and whether this commit was
// already reviewed — so the user can choose scope and never hit a timeout.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { parsePRUrl } from '@/lib/parser';
import { fetchPRMetadata, fetchPRFiles, findLatestSentinelReview } from '@/lib/github';
import { processDiff } from '@/lib/chunking';
import { resolveActiveSkills } from '@/lib/skills';
import { estimateReviewPlan } from '@/lib/preflight';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const session = await auth();
  const githubToken = session?.accessToken;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { prUrl, skills: skillIds, mode } = (body ?? {}) as {
    prUrl?: unknown;
    skills?: unknown;
    mode?: unknown;
  };

  if (!prUrl || typeof prUrl !== 'string') {
    return NextResponse.json({ error: 'prUrl is required' }, { status: 400 });
  }

  const requestedSkillIds = Array.isArray(skillIds)
    ? skillIds.filter((id): id is string => typeof id === 'string')
    : undefined;
  const reviewMode: 'full' | 'lite' = mode === 'lite' ? 'lite' : 'full';

  try {
    const prInfo = parsePRUrl(prUrl);
    const skills =
      reviewMode === 'lite'
        ? resolveActiveSkills(['security', 'bugs'])
        : resolveActiveSkills(requestedSkillIds);

    const [metadata, files, previousReview] = await Promise.all([
      fetchPRMetadata(prInfo, githubToken),
      fetchPRFiles(prInfo, githubToken),
      findLatestSentinelReview(prInfo, githubToken),
    ]);

    const processedDiff = processDiff(files, skills.map((s) => s.id));
    const estimate = estimateReviewPlan(processedDiff, metadata, { mode: reviewMode });

    const alreadyReviewed =
      previousReview && previousReview.marker.headSha === metadata.headSha
        ? { headSha: metadata.headSha, url: previousReview.htmlUrl }
        : null;

    return NextResponse.json({ ...estimate, alreadyReviewed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to estimate PR size';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
