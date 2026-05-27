// ============================================================
// GEMINI.TS — Servicio de Gemini con Context Caching
// ============================================================

import { GoogleGenAI } from '@google/genai';
import { buildSystemPrompt, buildUserPrompt, getReviewResponseSchema } from './prompt';
import { PRMetadata, DiffFile, ReviewResult } from './types';

const MODEL_NAME = 'gemini-3.5-flash';

// Cache management — reuse across requests in same warm instance
let cachedContentName: string | null = null;
let cacheCreatedAt: number = 0;
const CACHE_TTL_MS = 55 * 60 * 1000; // 55 min (cache lasts 1hr, renew early)

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. ' +
      'Get your key at https://ai.google.dev and set it in .env.local'
    );
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Creates or reuses the context cache for the system prompt.
 * 
 * Cache verification: usageMetadata.cachedContentTokenCount > 0 = cache hit.
 * This is visible in logs and the UI dashboard.
 */
async function ensureCache(): Promise<string> {
  const client = getClient();
  const now = Date.now();

  if (cachedContentName && (now - cacheCreatedAt) < CACHE_TTL_MS) {
    console.log(`♻️  Reusing cache: ${cachedContentName}`);
    return cachedContentName;
  }

  console.log('🆕 Creating new context cache...');
  const systemPrompt = buildSystemPrompt();

  try {
    const cache = await client.caches.create({
      model: MODEL_NAME,
      config: {
        systemInstruction: systemPrompt,
        contents: [
          {
            role: 'user',
            parts: [{ text: 'You are ready to review Pull Requests. Awaiting PR data.' }],
          },
        ],
        ttl: '3600s',
        displayName: 'pr-sentinel-system-prompt',
      },
    });

    cachedContentName = cache.name!;
    cacheCreatedAt = now;
    console.log(`✅ Cache created: ${cachedContentName}`);
    return cachedContentName;
  } catch (error) {
    console.error('❌ Cache creation failed:', error);
    cachedContentName = null;
    throw error;
  }
}

/**
 * Analyzes a chunk of diff and returns a stream + cache info getter.
 */
export async function analyzeChunk(
  metadata: PRMetadata,
  files: DiffFile[],
  chunkInfo?: { chunkId: number; totalChunks: number }
): Promise<{
  stream: AsyncIterable<{ text: string }>;
  getCacheInfo: () => Promise<{
    cacheHit: boolean;
    cachedTokens: number;
    totalTokens: number;
  }>;
}> {
  const client = getClient();
  const userPrompt = buildUserPrompt(metadata, files, chunkInfo);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let config: any;

  try {
    const cacheName = await ensureCache();
    config = {
      cachedContent: cacheName,
      responseMimeType: 'application/json',
      responseSchema: getReviewResponseSchema(),
    };
  } catch {
    // Fallback without cache
    console.warn('⚠️  Falling back to non-cached request');
    config = {
      responseMimeType: 'application/json',
      responseSchema: getReviewResponseSchema(),
      systemInstruction: buildSystemPrompt(),
    };
  }

  const response = await client.models.generateContentStream({
    model: MODEL_NAME,
    contents: userPrompt,
    config,
  });

  let usageInfo: { cacheHit: boolean; cachedTokens: number; totalTokens: number } | null = null;

  async function* wrappedStream() {
    for await (const chunk of response) {
      if (chunk.usageMetadata) {
        const cached = chunk.usageMetadata.cachedContentTokenCount ?? 0;
        const total = chunk.usageMetadata.totalTokenCount ?? 0;
        usageInfo = { cacheHit: cached > 0, cachedTokens: cached, totalTokens: total };
        console.log(`📊 Usage — Cached: ${cached}, Total: ${total}, Hit: ${cached > 0}`);
      }
      if (chunk.text) {
        yield { text: chunk.text };
      }
    }
  }

  return {
    stream: wrappedStream(),
    getCacheInfo: async () => usageInfo ?? { cacheHit: false, cachedTokens: 0, totalTokens: 0 },
  };
}

/**
 * Analyzes a full PR (possibly multi-chunk) without streaming.
 */
export async function analyzeFullPR(
  metadata: PRMetadata,
  files: DiffFile[],
  chunkInfo?: { chunkId: number; totalChunks: number }
): Promise<{ review: ReviewResult; raw: string }> {
  const { stream, getCacheInfo } = await analyzeChunk(metadata, files, chunkInfo);

  let fullText = '';
  const startTime = Date.now();

  for await (const chunk of stream) {
    fullText += chunk.text;
  }

  const cacheInfo = await getCacheInfo();
  const processingTime = Date.now() - startTime;
  const parsed = JSON.parse(fullText);

  const review: ReviewResult = {
    ...parsed,
    metadata: {
      modelUsed: MODEL_NAME,
      cachedTokens: cacheInfo.cachedTokens,
      totalTokens: cacheInfo.totalTokens,
      cacheHit: cacheInfo.cacheHit,
      processingTimeMs: processingTime,
      chunksProcessed: chunkInfo?.totalChunks ?? 1,
    },
  };

  return { review, raw: fullText };
}

/**
 * Returns current cache statistics.
 */
export function getCacheStats() {
  return {
    cacheExists: cachedContentName !== null,
    cacheName: cachedContentName,
    cacheAge: cachedContentName ? Date.now() - cacheCreatedAt : 0,
    cacheAgeMinutes: cachedContentName
      ? Math.round((Date.now() - cacheCreatedAt) / 60000)
      : 0,
  };
}
