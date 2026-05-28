// ============================================================
// /api/settings — Read/write per-user Gemini API key
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserKeys, setUserKeys } from '@/lib/session';

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 6) + '••••' + key.slice(-4);
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keys = await getUserKeys();
  return NextResponse.json({
    geminiKeySet: !!keys.geminiApiKey,
    geminiKeyMasked: keys.geminiApiKey ? maskKey(keys.geminiApiKey) : null,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { geminiApiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.geminiApiKey !== 'string') {
    return NextResponse.json({ error: 'geminiApiKey must be a string' }, { status: 400 });
  }

  await setUserKeys({ geminiApiKey: body.geminiApiKey || undefined });

  return NextResponse.json({
    ok: true,
    geminiKeySet: !!body.geminiApiKey,
    geminiKeyMasked: body.geminiApiKey ? maskKey(body.geminiApiKey) : null,
  });
}
