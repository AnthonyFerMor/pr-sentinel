// ============================================================
// /api/repos/enable — Activate the auto-review bot on a repo.
//
// Flow:
//   1. Auth check (must be logged in).
//   2. Load user PAT from KV (required — OAuth tokens expire, webhooks need
//      a durable credential).
//   3. Create webhook on the target repo via GitHub API.
//   4. Persist {owner, repo, webhookId} under userId in KV.
//   5. Return success + webhookId.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserConfig, enableRepo, isStorageAvailable } from '@/lib/storage';
import { createRepoWebhook } from '@/lib/github-webhooks';

export const runtime = 'nodejs';

function getWebhookUrl(request: NextRequest): string {
  // Prefer an explicit env override so a Vercel deploy can point hooks at a
  // canonical domain even when accessed via a preview URL.
  const override = process.env.NEXTAUTH_URL?.replace(/\/$/, '');
  if (override) return `${override}/api/webhooks/github`;

  // Fallback: derive from the incoming request.
  const host = request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}/api/webhooks/github`;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isStorageAvailable()) {
    return NextResponse.json(
      { error: 'Persistent storage is not configured on this deployment.' },
      { status: 503 },
    );
  }

  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'GITHUB_WEBHOOK_SECRET is not configured on the server.' },
      { status: 500 },
    );
  }

  let body: { owner?: string; repo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const owner = body.owner?.trim();
  const repo = body.repo?.trim();
  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo are required' }, { status: 400 });
  }

  const config = await getUserConfig(session.user.id);
  if (!config?.githubPAT) {
    return NextResponse.json(
      { error: 'Add a GitHub PAT in Settings before enabling auto-review.' },
      { status: 400 },
    );
  }

  try {
    const webhookId = await createRepoWebhook(config.githubPAT, owner, repo, {
      url: getWebhookUrl(request),
      secret: webhookSecret,
    });
    await enableRepo(session.user.id, owner, repo, webhookId);
    return NextResponse.json({ ok: true, owner, repo, webhookId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create webhook';
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      return NextResponse.json(
        { error: 'Repo not found. Does your PAT have access to it?' },
        { status: 404 },
      );
    }
    if (status === 403 || status === 401) {
      return NextResponse.json(
        { error: 'PAT lacks permission to create webhooks. Add `repo` (admin) scope.' },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
