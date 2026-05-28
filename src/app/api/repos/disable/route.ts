// ============================================================
// /api/repos/disable — Deactivate the auto-review bot on a repo.
// Idempotent: silently succeeds if the repo wasn't enabled.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  disableRepo,
  getEnabledWebhookId,
  getUserConfig,
  isStorageAvailable,
} from '@/lib/storage';
import { deleteRepoWebhook } from '@/lib/github-webhooks';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isStorageAvailable()) {
    return NextResponse.json(
      { error: 'Persistent storage is not configured.' },
      { status: 503 },
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

  const webhookId = await getEnabledWebhookId(session.user.id, owner, repo);
  const config = await getUserConfig(session.user.id);

  // Try to delete the webhook on GitHub. This is best-effort: even if it fails
  // (e.g., user revoked the PAT), we still clear our KV entry so the UI
  // reflects the intended state.
  if (webhookId && config?.githubPAT) {
    try {
      await deleteRepoWebhook(config.githubPAT, owner, repo, webhookId);
    } catch (err) {
      console.warn('[repos/disable] webhook delete failed (continuing):', err);
    }
  }

  await disableRepo(session.user.id, owner, repo);
  return NextResponse.json({ ok: true, owner, repo });
}
