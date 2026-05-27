// ============================================================
// /api/cron — Revisión programada de PRs abiertos
// ------------------------------------------------------------
// Recorre los repos en CRON_REPOS, lista sus PRs abiertos y
// revisa los que están en needs_review / needs_update.
// Idempotente: skipIfReviewed evita re-gastar tokens.
// Protegido con CRON_SECRET (Authorization: Bearer ...), que es
// como Vercel Cron autentica las invocaciones programadas.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { listOpenPullRequests } from '@/lib/github';
import { runReview } from '@/lib/run-review';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Tope de PRs por corrida para no exceder el timeout serverless.
const MAX_PRS_PER_RUN = Number.parseInt(process.env.CRON_MAX_PRS ?? '5', 10);

function parseRepoList(): { owner: string; repo: string }[] {
  return (process.env.CRON_REPOS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [owner, repo] = entry.split('/');
      return { owner, repo };
    })
    .filter((r) => r.owner && r.repo);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured on this server.' },
      { status: 500 }
    );
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const repos = parseRepoList();
  if (repos.length === 0) {
    return NextResponse.json(
      { error: 'CRON_REPOS is not configured (expected "owner/repo,owner2/repo2").' },
      { status: 400 }
    );
  }

  const startedAt = Date.now();
  const results: Array<{
    repo: string;
    pr: number;
    status: 'reviewed' | 'updated' | 'skipped' | 'error';
    detail?: string;
  }> = [];
  let reviewed = 0;

  for (const { owner, repo } of repos) {
    if (reviewed >= MAX_PRS_PER_RUN) break;

    let pulls;
    try {
      pulls = await listOpenPullRequests(owner, repo);
    } catch (err) {
      results.push({
        repo: `${owner}/${repo}`,
        pr: 0,
        status: 'error',
        detail: err instanceof Error ? err.message : 'list failed',
      });
      continue;
    }

    const pending = pulls.filter((p) => p.reviewState !== 'reviewed');

    for (const pr of pending) {
      if (reviewed >= MAX_PRS_PER_RUN) break;

      const remainingMs = maxDuration * 1000 - (Date.now() - startedAt);
      const softDeadlineMs = remainingMs - 5000;
      if (softDeadlineMs <= 5000) {
        console.warn('[cron] Stopping: insufficient serverless time remaining.');
        break;
      }

      try {
        const outcome = await runReview(pr.url, {
          updateExisting: true,
          skipIfReviewed: true,
          softDeadlineMs,
        });
        reviewed += 1;
        results.push({
          repo: `${owner}/${repo}`,
          pr: pr.number,
          status: outcome.skipped
            ? 'skipped'
            : pr.reviewState === 'needs_update'
              ? 'updated'
              : 'reviewed',
          detail: outcome.commentUrl,
        });
      } catch (err) {
        results.push({
          repo: `${owner}/${repo}`,
          pr: pr.number,
          status: 'error',
          detail: err instanceof Error ? err.message : 'review failed',
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    reposScanned: repos.length,
    prsReviewed: reviewed,
    elapsedMs: Date.now() - startedAt,
    results,
  });
}
