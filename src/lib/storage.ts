// ============================================================
// STORAGE.TS — Persistent multi-user storage backed by Upstash Redis (Vercel KV).
//
// Why: webhooks fire asynchronously, when the user is offline. Their JWT
// is unavailable, so we can't recover their credentials from a cookie.
// We need server-side persistence keyed by userId.
//
// What we store:
//   user:{userId}            → JSON UserConfig (geminiApiKey + githubPAT encrypted)
//   repo:{owner}/{repo}      → userId (lookup: who owns this repo's auto-bot?)
//   userRepos:{userId}       → JSON EnabledRepo[] (list of enabled repos)
//
// Security: secrets are encrypted at rest with AES-256-GCM using a key
// derived from NEXTAUTH_SECRET via scrypt. The KV provider never sees
// plaintext keys, so even if the Redis instance leaks, the secrets stay safe.
//
// Graceful degradation: if KV env vars aren't configured (e.g. local dev
// without Upstash), all functions return null/empty. The app keeps working
// in single-user mode via cookies + server env keys.
// ============================================================

import { Redis } from '@upstash/redis';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

export type ReviewStyle = 'full' | 'lite' | 'caveman';

export interface UserConfig {
  geminiApiKey?: string;
  githubPAT?: string;
  /** Output format for PR review comments. Default = 'full'. User opt-in for 'caveman' (token-saving). */
  reviewStyle?: ReviewStyle;
  /**
   * Inline mode: si true, postea cada finding como comentario inline anclado
   * a la línea exacta del diff (estilo CodeRabbit). Si false, usa un solo
   * comentario gigante al final del PR. Default = true.
   */
  inlineMode?: boolean;
}

export interface EnabledRepo {
  owner: string;
  repo: string;
  webhookId: number;
  enabledAt: number;
}

// ── Redis client (lazy, singleton) ───────────────────────────

let redisClient: Redis | null = null;
let redisDisabled = false;

function getRedis(): Redis | null {
  if (redisDisabled) return null;
  if (redisClient) return redisClient;

  // Vercel KV ships URL+token under KV_REST_API_*; standalone Upstash uses UPSTASH_REDIS_REST_*.
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // KV not configured — fall back to single-user mode silently.
    redisDisabled = true;
    return null;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

export function isStorageAvailable(): boolean {
  return getRedis() !== null;
}

// ── Encryption (AES-256-GCM) ─────────────────────────────────

const ENCRYPTION_ALGO = 'aes-256-gcm';
const SCRYPT_SALT = 'pr-sentinel-v1-secrets';

let derivedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (derivedKey) return derivedKey;
  // NextAuth v5 uses AUTH_SECRET; v4 used NEXTAUTH_SECRET. Accept either so
  // the same encryption key works regardless of which env var the deployment sets.
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('NEXTAUTH_SECRET or AUTH_SECRET must be set (>= 16 chars) to encrypt user secrets.');
  }
  derivedKey = scryptSync(secret, SCRYPT_SALT, 32);
  return derivedKey;
}

/** Encrypt a plaintext string → "iv:authTag:ciphertext" base64-encoded. */
function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGO, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/** Decrypt a previously encrypted string. Returns null on tamper/format error. */
function decrypt(encoded: string): string | null {
  try {
    const [ivB64, tagB64, ctB64] = encoded.split(':');
    if (!ivB64 || !tagB64 || !ctB64) return null;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(ctB64, 'base64');
    const decipher = createDecipheriv(ENCRYPTION_ALGO, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    return null;
  }
}

// ── Key builders ─────────────────────────────────────────────

const k = {
  user: (userId: string) => `user:${userId}`,
  repo: (owner: string, repo: string) => `repo:${owner.toLowerCase()}/${repo.toLowerCase()}`,
  userRepos: (userId: string) => `userRepos:${userId}`,
};

// ── User config (geminiApiKey + githubPAT) ───────────────────

interface EncryptedUserConfig {
  geminiApiKey?: string; // encrypted
  githubPAT?: string;    // encrypted
  reviewStyle?: ReviewStyle; // plaintext (non-sensitive preference)
  inlineMode?: boolean;      // plaintext (non-sensitive preference)
}

/**
 * Saves (or merges) user config. Fields set to undefined are left alone;
 * fields set to empty string are deleted. Fields with a value are encrypted.
 * `reviewStyle` is non-sensitive so stored as plain enum.
 */
export async function saveUserConfig(userId: string, partial: UserConfig): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const existing = (await redis.get<EncryptedUserConfig>(k.user(userId))) || {};
  const next: EncryptedUserConfig = { ...existing };

  if (partial.geminiApiKey !== undefined) {
    if (partial.geminiApiKey === '') delete next.geminiApiKey;
    else next.geminiApiKey = encrypt(partial.geminiApiKey);
  }
  if (partial.githubPAT !== undefined) {
    if (partial.githubPAT === '') delete next.githubPAT;
    else next.githubPAT = encrypt(partial.githubPAT);
  }
  if (partial.reviewStyle !== undefined) {
    next.reviewStyle = partial.reviewStyle;
  }
  if (partial.inlineMode !== undefined) {
    next.inlineMode = partial.inlineMode;
  }

  await redis.set(k.user(userId), next);
}

/** Loads and decrypts user config. Returns null if not stored or KV unavailable. */
export async function getUserConfig(userId: string): Promise<UserConfig | null> {
  const redis = getRedis();
  if (!redis) return null;

  const stored = await redis.get<EncryptedUserConfig>(k.user(userId));
  if (!stored) return null;

  return {
    geminiApiKey: stored.geminiApiKey ? decrypt(stored.geminiApiKey) ?? undefined : undefined,
    githubPAT: stored.githubPAT ? decrypt(stored.githubPAT) ?? undefined : undefined,
    reviewStyle: stored.reviewStyle,
    inlineMode: stored.inlineMode,
  };
}

/** Returns true iff the user has both required pieces to auto-review: a PAT and Gemini key (or relies on server fallback). */
export async function hasUsableConfig(userId: string): Promise<boolean> {
  const cfg = await getUserConfig(userId);
  return !!cfg?.githubPAT;
}

// ── Repo enable/disable (auto-bot) ───────────────────────────

/**
 * Marks an owner/repo as having auto-review enabled by `userId`.
 * Stores both the repo→user reverse lookup AND adds to the user's repo list.
 */
export async function enableRepo(
  userId: string,
  owner: string,
  repo: string,
  webhookId: number,
): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Storage is not configured (KV env vars missing).');

  // Reverse lookup: repo → userId (so webhook can find owner fast).
  await redis.set(k.repo(owner, repo), userId);

  // Append to user's list (dedupe by owner/repo).
  const list = (await redis.get<EnabledRepo[]>(k.userRepos(userId))) || [];
  const filtered = list.filter((r) => !(r.owner === owner && r.repo === repo));
  filtered.push({ owner, repo, webhookId, enabledAt: Date.now() });
  await redis.set(k.userRepos(userId), filtered);
}

/** Removes a repo's auto-review entry. Idempotent. */
export async function disableRepo(userId: string, owner: string, repo: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  // Only delete the reverse lookup if it still points to this user (avoids
  // a race where a second user re-enabled the repo).
  const currentOwner = await redis.get<string>(k.repo(owner, repo));
  if (currentOwner === userId) {
    await redis.del(k.repo(owner, repo));
  }

  const list = (await redis.get<EnabledRepo[]>(k.userRepos(userId))) || [];
  const filtered = list.filter((r) => !(r.owner === owner && r.repo === repo));
  await redis.set(k.userRepos(userId), filtered);
}

/** Returns the userId that owns auto-review for this repo, or null. */
export async function getRepoOwner(owner: string, repo: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  return await redis.get<string>(k.repo(owner, repo));
}

/** Returns all repos the user has enabled. */
export async function getEnabledRepos(userId: string): Promise<EnabledRepo[]> {
  const redis = getRedis();
  if (!redis) return [];
  return (await redis.get<EnabledRepo[]>(k.userRepos(userId))) || [];
}

/** Quick check used by the toggle UI. */
export async function isRepoEnabled(userId: string, owner: string, repo: string): Promise<boolean> {
  const list = await getEnabledRepos(userId);
  return list.some((r) => r.owner === owner && r.repo === repo);
}

/** Returns the webhook id for an enabled repo (needed to delete it on disable). */
export async function getEnabledWebhookId(
  userId: string,
  owner: string,
  repo: string,
): Promise<number | null> {
  const list = await getEnabledRepos(userId);
  const match = list.find((r) => r.owner === owner && r.repo === repo);
  return match?.webhookId ?? null;
}
