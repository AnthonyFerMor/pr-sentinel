// ============================================================
// SESSION.TS — Encrypted cookie helpers for per-user API keys
// Uses iron-session for AES-256 encryption of sensitive data.
// ============================================================

import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';

export interface UserKeys {
  geminiApiKey?: string;
}

const SESSION_OPTIONS = {
  password: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'fallback-dev-secret-that-is-at-least-32-chars-long!!',
  cookieName: 'pr-sentinel-keys',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

export async function getUserKeys(): Promise<UserKeys> {
  const cookieStore = await cookies();
  const session = await getIronSession<UserKeys>(cookieStore, SESSION_OPTIONS);
  return {
    geminiApiKey: session.geminiApiKey,
  };
}

export async function setUserKeys(keys: Partial<UserKeys>): Promise<void> {
  const cookieStore = await cookies();
  const session = await getIronSession<UserKeys>(cookieStore, SESSION_OPTIONS);
  if (keys.geminiApiKey !== undefined) {
    session.geminiApiKey = keys.geminiApiKey || undefined;
  }
  await session.save();
}

export async function clearUserKeys(): Promise<void> {
  const cookieStore = await cookies();
  const session = await getIronSession<UserKeys>(cookieStore, SESSION_OPTIONS);
  session.destroy();
}
