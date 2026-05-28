// ============================================================
// /api/settings — Read/write per-user Gemini API key + GitHub PAT
//
// Storage strategy:
//   - KV (when configured) is the source of truth. It's the only store
//     accessible from webhook handlers (where there is no user cookie),
//     so the auto-bot relies on it.
//   - The iron-session cookie mirrors the Gemini key for backward-compat
//     with environments that don't yet have KV provisioned. This way
//     the manual-review flow keeps working without a KV instance.
//   - The PAT lives ONLY in KV — it's a powerful credential and we want
//     it scoped to the server, never echoed in a cookie.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserKeys, setUserKeys } from '@/lib/session';
import { getUserConfig, saveUserConfig, isStorageAvailable, ReviewStyle } from '@/lib/storage';

const VALID_STYLES: readonly ReviewStyle[] = ['full', 'lite', 'caveman'] as const;

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 6) + '••••' + key.slice(-4);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Read from KV first (authoritative) — fall back to cookie if KV not set up.
  const kvCfg = await getUserConfig(session.user.id);
  const cookieKeys = await getUserKeys();
  const geminiKey = kvCfg?.geminiApiKey ?? cookieKeys.geminiApiKey;
  const githubPAT = kvCfg?.githubPAT;

  return NextResponse.json({
    geminiKeySet: !!geminiKey,
    geminiKeyMasked: geminiKey ? maskKey(geminiKey) : null,
    githubPATSet: !!githubPAT,
    githubPATMasked: githubPAT ? maskKey(githubPAT) : null,
    reviewStyle: kvCfg?.reviewStyle ?? 'full',
    storageAvailable: isStorageAvailable(),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { geminiApiKey?: string; githubPAT?: string; reviewStyle?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate types — undefined means "don't touch", string (possibly empty) means "set".
  if (body.geminiApiKey !== undefined && typeof body.geminiApiKey !== 'string') {
    return NextResponse.json({ error: 'geminiApiKey must be a string' }, { status: 400 });
  }
  if (body.githubPAT !== undefined && typeof body.githubPAT !== 'string') {
    return NextResponse.json({ error: 'githubPAT must be a string' }, { status: 400 });
  }
  if (body.reviewStyle !== undefined && !VALID_STYLES.includes(body.reviewStyle as ReviewStyle)) {
    return NextResponse.json(
      { error: `reviewStyle must be one of: ${VALID_STYLES.join(', ')}` },
      { status: 400 },
    );
  }

  // Persist to KV (authoritative). Empty string deletes the field.
  if (isStorageAvailable()) {
    await saveUserConfig(session.user.id, {
      geminiApiKey: body.geminiApiKey,
      githubPAT: body.githubPAT,
      reviewStyle: body.reviewStyle as ReviewStyle | undefined,
    });
  }

  // Mirror Gemini key to cookie for environments without KV.
  if (body.geminiApiKey !== undefined) {
    await setUserKeys({ geminiApiKey: body.geminiApiKey || undefined });
  }

  return NextResponse.json({
    ok: true,
    geminiKeySet: !!body.geminiApiKey,
    geminiKeyMasked: body.geminiApiKey ? maskKey(body.geminiApiKey) : null,
    githubPATSet: !!body.githubPAT,
    githubPATMasked: body.githubPAT ? maskKey(body.githubPAT) : null,
    reviewStyle: body.reviewStyle as ReviewStyle | undefined,
    storageAvailable: isStorageAvailable(),
  });
}
