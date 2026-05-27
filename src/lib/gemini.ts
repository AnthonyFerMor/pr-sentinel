// ============================================================
// GEMINI.TS - Servicio de Gemini con Context Caching
// ============================================================

import { GoogleGenAI } from '@google/genai';
import {
  buildCachePrimer,
  buildSystemPrompt,
  buildUserPrompt,
  buildScoutPrompt,
  getReviewResponseSchema,
  getScoutResponseSchema,
  Hotspot,
} from './prompt';
import { PRMetadata, DiffFile, ReviewResult } from './types';
import { Skill, resolveActiveSkills, skillsCacheKey } from './skills';

const DEFAULT_MODEL_NAME = 'gemini-3.5-flash';
const MODEL_NAME = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL_NAME;

// Status codes and messages for retry logic
const RETRYABLE_STATUS_CODES = new Set(['UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'INTERNAL', 'DEADLINE_EXCEEDED']);
const RETRYABLE_HTTP_CODES = new Set([429, 500, 503, 504]);
const RETRYABLE_KEYWORDS = ['high demand', 'try again later', 'temporarily', 'overloaded', 'capacity'];

// Cache management - reuse across requests in same warm instance.
type CacheEntry = { name: string; createdAt: number };
const cacheByModel = new Map<string, CacheEntry>();
const cacheFailureByModel = new Map<string, number>();
const CACHE_TTL_MS = 55 * 60 * 1000; // 55 min (cache lasts 1hr, renew early)
const CACHE_FAILURE_COOLDOWN_MS = 60 * 1000;

// Lightweight stats to make cache hits verifiable in-app.
let cacheHitCount = 0;
let cacheMissCount = 0;
let lastUsageInfo:
  | {
      cacheHit: boolean;
      cachedTokens: number;
      totalTokens: number;
      at: number;
      modelUsed: string;
    }
  | null = null;

type GeminiStreamChunk = {
  text?: string;
  usageMetadata?: {
    cachedContentTokenCount?: number;
    totalTokenCount?: number;
  };
};

type ProviderErrorDetails = {
  code?: number;
  status?: string;
  message: string;
  rawMessage: string;
};

type GeminiGenerationConfig = {
  cachedContent?: string;
  responseMimeType: 'application/json';
  responseSchema: ReturnType<typeof getReviewResponseSchema>;
  systemInstruction?: string;
  thinkingConfig?: { thinkingBudget: number };
};

export class GeminiServiceError extends Error {
  constructor(
    public readonly userMessage: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
    public readonly providerStatus?: string,
    public readonly cause?: unknown
  ) {
    super(userMessage);
    this.name = 'GeminiServiceError';
  }
}

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

export function getPrimaryModelName() {
  return MODEL_NAME;
}

function getFallbackModels(): string[] {
  const value = process.env.GEMINI_FALLBACK_MODELS?.trim();
  if (!value || value.toLowerCase() === 'none') return [];
  return value
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

function getModelCandidates(): string[] {
  return Array.from(new Set([MODEL_NAME, ...getFallbackModels()]));
}

function useExplicitCache(): boolean {
  return process.env.GEMINI_EXPLICIT_CACHE?.trim().toLowerCase() === 'true';
}

function getMaxRetries(): number {
  const parsed = Number.parseInt(process.env.GEMINI_MAX_RETRIES ?? '', 10);
  if (Number.isFinite(parsed) && parsed >= 0) return Math.min(parsed, 5);
  return 4;
}

function retryDelayMs(attemptIndex: number): number {
  const baseDelays = [900, 2200, 4500, 8000, 12000];
  const base = baseDelays[attemptIndex] ?? 12000;
  return base + Math.floor(Math.random() * 350);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractErrorDetailsFromObject(value: unknown): Partial<ProviderErrorDetails> | null {
  if (!value || typeof value !== 'object') return null;

  const errorObj = value as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
    error?: unknown;
  };

  // Handle nested error structure: { error: { code, status, message } }
  const target = (
    'error' in errorObj && errorObj.error && typeof errorObj.error === 'object'
      ? (errorObj.error as Record<string, unknown>)
      : (errorObj as Record<string, unknown>)
  );

  return {
    code: typeof target.code === 'number' ? target.code : undefined,
    status: typeof target.status === 'string' ? target.status : undefined,
    message: typeof target.message === 'string' ? target.message : undefined,
  };
}

function extractProviderError(error: unknown): ProviderErrorDetails {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : JSON.stringify(error);

  let details: Partial<ProviderErrorDetails> = {
    rawMessage,
    message: rawMessage || 'Gemini request failed',
  };

  const directDetails = extractErrorDetailsFromObject(error);
  if (directDetails) details = { ...details, ...directDetails };

  let currentMessage = details.message ?? rawMessage;
  for (let i = 0; i < 3; i += 1) {
    const parsed = tryParseJson(currentMessage);
    const nested = extractErrorDetailsFromObject(parsed);
    if (!nested) break;

    details = { ...details, ...nested };
    if (!nested.message || nested.message === currentMessage) break;
    currentMessage = nested.message;
  }

  return {
    rawMessage,
    message: details.message ?? rawMessage ?? 'Gemini request failed',
    code: details.code,
    status: details.status,
  };
}

function isRetryableProviderError(details: ProviderErrorDetails): boolean {
  const status = details.status?.toUpperCase();
  const message = details.message.toLowerCase();

  return (
    (details.code !== undefined && RETRYABLE_HTTP_CODES.has(details.code)) ||
    (status !== undefined && RETRYABLE_STATUS_CODES.has(status)) ||
    RETRYABLE_KEYWORDS.some((keyword) => message.includes(keyword))
  );
}

function buildUserFacingGeminiError(
  details: ProviderErrorDetails,
  candidates: string[]
): GeminiServiceError {
  const retryable = isRetryableProviderError(details);
  const modelText = candidates.join(', ');
  const providerLabel = [details.code, details.status].filter(Boolean).join(' ') || 'provider error';

  if (details.code === 503 || details.status?.toUpperCase() === 'UNAVAILABLE') {
    return new GeminiServiceError(
      `Gemini is temporarily overloaded (${providerLabel}). PR Sentinel retried the request with backoff but the provider is still out of capacity. Try again in a minute; no partial GitHub comment was posted. Model(s): ${modelText}.`,
      true,
      details.code,
      details.status
    );
  }

  if (details.code === 429 || details.status?.toUpperCase() === 'RESOURCE_EXHAUSTED') {
    return new GeminiServiceError(
      `Gemini rate limit was reached (${providerLabel}). Wait a bit or reduce concurrent reviews, then retry. No partial GitHub comment was posted. Model(s): ${modelText}.`,
      true,
      details.code,
      details.status
    );
  }

  if (retryable) {
    return new GeminiServiceError(
      `Gemini returned a temporary error (${providerLabel}). PR Sentinel retried the request, but it still failed. Try again shortly. Model(s): ${modelText}.`,
      true,
      details.code,
      details.status
    );
  }

  return new GeminiServiceError(
    `Gemini request failed (${providerLabel}): ${details.message}`,
    false,
    details.code,
    details.status
  );
}

/**
 * Creates or reuses the context cache for the system prompt + stable rubric.
 *
 * Cache verification: usageMetadata.cachedContentTokenCount > 0 = cache hit.
 * This is visible in logs and the UI dashboard.
 */
async function ensureCache(modelName: string, skills: Skill[]): Promise<string> {
  const client = getClient();
  const now = Date.now();
  const skillsKey = skillsCacheKey(skills);
  const cacheKey = `${modelName}::${skillsKey}`;
  const existing = cacheByModel.get(cacheKey);
  const lastFailure = cacheFailureByModel.get(cacheKey) ?? 0;

  if (existing && now - existing.createdAt < CACHE_TTL_MS) {
    console.log(`Reusing Gemini cache for ${cacheKey}: ${existing.name}`);
    return existing.name;
  }

  if (lastFailure && now - lastFailure < CACHE_FAILURE_COOLDOWN_MS) {
    throw new Error(
      `Gemini cache creation is cooling down for ${cacheKey} after a recent provider failure`
    );
  }

  console.log(`Creating Gemini context cache for ${cacheKey}...`);
  const systemPrompt = buildSystemPrompt(skills);
  const cachePrimer = buildCachePrimer(skills);

  try {
    const cache = await client.caches.create({
      model: modelName,
      config: {
        systemInstruction: systemPrompt,
        contents: [
          {
            role: 'user',
            parts: [{ text: cachePrimer }],
          },
        ],
        ttl: '3600s',
        displayName: `pr-sentinel-system-rubric-${modelName}-${skillsKey}`,
      },
    });

    if (!cache.name) throw new Error('Gemini cache was created without a cache name');

    cacheByModel.set(cacheKey, { name: cache.name, createdAt: now });
    cacheFailureByModel.delete(cacheKey);
    console.log(`Gemini cache created for ${cacheKey}: ${cache.name}`);
    return cache.name;
  } catch (error) {
    console.error(`Gemini cache creation failed for ${cacheKey}:`, error);
    cacheByModel.delete(cacheKey);
    cacheFailureByModel.set(cacheKey, Date.now());
    throw error;
  }
}

function getThinkingBudget(): number {
  const parsed = Number.parseInt(process.env.GEMINI_THINKING_BUDGET ?? '', 10);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return 8192;
}

async function buildGenerationConfig(
  modelName: string,
  skills: Skill[],
  onStatus?: (message: string) => void
): Promise<GeminiGenerationConfig> {
  const thinkingBudget = getThinkingBudget();
  const thinkingConfig = thinkingBudget > 0 ? { thinkingBudget } : undefined;

  if (!useExplicitCache()) {
    return {
      responseMimeType: 'application/json',
      responseSchema: getReviewResponseSchema(),
      systemInstruction: buildSystemPrompt(skills),
      thinkingConfig,
    };
  }

  try {
    const cacheName = await ensureCache(modelName, skills);
    return {
      cachedContent: cacheName,
      responseMimeType: 'application/json',
      responseSchema: getReviewResponseSchema(),
      thinkingConfig,
    };
  } catch (error) {
    const details = extractProviderError(error);
    onStatus?.(
      `Context cache unavailable for ${modelName}; continuing without cache for this attempt.`
    );
    console.warn(`Falling back to non-cached request for ${modelName}:`, details.message);

    return {
      responseMimeType: 'application/json',
      responseSchema: getReviewResponseSchema(),
      systemInstruction: buildSystemPrompt(skills),
      thinkingConfig,
    };
  }
}

async function createModelStream(
  client: GoogleGenAI,
  modelName: string,
  userPrompt: string,
  skills: Skill[],
  onStatus?: (message: string) => void
): Promise<AsyncIterable<GeminiStreamChunk>> {
  const config = await buildGenerationConfig(modelName, skills, onStatus);
  const response = await client.models.generateContentStream({
    model: modelName,
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    config,
  });

  return response as AsyncIterable<GeminiStreamChunk>;
}

async function* generateWithRetry(
  client: GoogleGenAI,
  userPrompt: string,
  skills: Skill[],
  onStatus?: (message: string) => void
): AsyncGenerator<{ chunk: GeminiStreamChunk; modelName: string }> {
  const candidates = getModelCandidates();
  const maxRetries = getMaxRetries();
  let lastError: unknown = null;

  for (const [modelIndex, modelName] of candidates.entries()) {
    if (modelIndex > 0) {
      onStatus?.(`Primary Gemini model is still unavailable; trying fallback ${modelName}.`);
    }

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      let yieldedFromAttempt = false;

      try {
        const response = await createModelStream(client, modelName, userPrompt, skills, onStatus);

        for await (const chunk of response) {
          yieldedFromAttempt = true;
          yield { chunk, modelName };
        }

        return;
      } catch (error) {
        lastError = error;
        const details = extractProviderError(error);
        const retryable = isRetryableProviderError(details);

        if (yieldedFromAttempt) {
          throw new GeminiServiceError(
            `Gemini stream was interrupted after partial output (${details.code ?? 'error'} ${details.status ?? ''}). Retry the review so PR Sentinel can produce valid JSON and avoid posting a partial comment.`,
            retryable,
            details.code,
            details.status,
            error
          );
        }

        const hasRetryLeft = retryable && attempt < maxRetries;
        if (hasRetryLeft) {
          const delay = retryDelayMs(attempt);
          onStatus?.(
            `Gemini returned ${details.code ?? details.status ?? 'a temporary error'}; retrying ${modelName} in ${(delay / 1000).toFixed(1)}s (${attempt + 1}/${maxRetries}).`
          );
          await sleep(delay);
          continue;
        }

        if (!retryable) throw buildUserFacingGeminiError(details, candidates);
        break;
      }
    }
  }

  throw buildUserFacingGeminiError(extractProviderError(lastError), getModelCandidates());
}

/**
 * Analyzes a chunk of diff and returns a stream + cache info getter.
 */
export async function analyzeChunk(
  metadata: PRMetadata,
  files: DiffFile[],
  chunkInfo?: { chunkId: number; totalChunks: number },
  options?: {
    onStatus?: (message: string) => void;
    skills?: Skill[];
    allFiles?: DiffFile[];
    focusAreas?: Hotspot[];
  }
): Promise<{
  stream: AsyncIterable<{ text: string }>;
  getCacheInfo: () => Promise<{
    cacheHit: boolean;
    cachedTokens: number;
    totalTokens: number;
  }>;
  getModelUsed: () => string;
}> {
  const client = getClient();
  const skills = options?.skills ?? resolveActiveSkills();
  const userPrompt = buildUserPrompt(metadata, files, chunkInfo, {
    includeCachePrimer: !useExplicitCache(),
    skills,
    allFiles: options?.allFiles,
    focusAreas: options?.focusAreas,
  });
  let usageInfo: { cacheHit: boolean; cachedTokens: number; totalTokens: number } | null = null;
  let modelUsed = MODEL_NAME;

  async function* wrappedStream() {
    for await (const { chunk, modelName } of generateWithRetry(
      client,
      userPrompt,
      skills,
      options?.onStatus
    )) {
      modelUsed = modelName;

      if (chunk.usageMetadata) {
        const cached = chunk.usageMetadata.cachedContentTokenCount ?? 0;
        const total = chunk.usageMetadata.totalTokenCount ?? 0;
        const hit = cached > 0;
        usageInfo = { cacheHit: hit, cachedTokens: cached, totalTokens: total };
        lastUsageInfo = {
          cacheHit: hit,
          cachedTokens: cached,
          totalTokens: total,
          at: Date.now(),
          modelUsed,
        };
        if (hit) cacheHitCount += 1;
        else cacheMissCount += 1;
        console.log(
          `Gemini usage - Model: ${modelUsed}, Cached: ${cached}, Total: ${total}, Hit: ${hit}`
        );
      }

      if (chunk.text) {
        yield { text: chunk.text };
      }
    }
  }

  return {
    stream: wrappedStream(),
    getCacheInfo: async () => usageInfo ?? { cacheHit: false, cachedTokens: 0, totalTokens: 0 },
    getModelUsed: () => modelUsed,
  };
}

/**
 * Pase 1 (scout): localiza hotspots con una llamada liviana y no-streaming.
 * Best-effort: si falla, devuelve [] y el flujo continúa sin focus areas.
 */
export async function scoutHotspots(
  metadata: PRMetadata,
  files: DiffFile[],
  skills?: Skill[]
): Promise<Hotspot[]> {
  const client = getClient();
  const prompt = buildScoutPrompt(metadata, files, skills);

  for (const modelName of getModelCandidates()) {
    try {
      const response = await client.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: getScoutResponseSchema(),
          thinkingConfig: { thinkingBudget: 1024 },
        },
      });

      const text = (response as { text?: string }).text ?? '';
      let parsed: { hotspots?: unknown };
      try {
        parsed = JSON.parse(text) as { hotspots?: unknown };
      } catch (jsonErr) {
        console.warn(`[scout] Invalid JSON from ${modelName}:`, jsonErr);
        continue;
      }
      if (Array.isArray(parsed.hotspots)) {
        return parsed.hotspots.filter(
          (h): h is Hotspot =>
            !!h &&
            typeof h === 'object' &&
            typeof (h as Hotspot).file === 'string' &&
            typeof (h as Hotspot).reason === 'string' &&
            typeof (h as Hotspot).category === 'string'
        );
      }
      return [];
    } catch (error) {
      console.warn(`[scout] Pass failed for ${modelName}:`, extractProviderError(error).message);
      continue;
    }
  }

  return [];
}

/**
 * Analyzes a full PR (possibly multi-chunk) without streaming.
 */
export async function analyzeFullPR(
  metadata: PRMetadata,
  files: DiffFile[],
  chunkInfo?: { chunkId: number; totalChunks: number }
): Promise<{ review: ReviewResult; raw: string }> {
  const { stream, getCacheInfo, getModelUsed } = await analyzeChunk(metadata, files, chunkInfo);

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
      modelUsed: getModelUsed(),
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
  const now = Date.now();
  const cacheEntries = Array.from(cacheByModel.entries()).map(([model, entry]) => ({
    model,
    cacheName: entry.name,
    cacheAge: now - entry.createdAt,
    cacheAgeMinutes: Math.round((now - entry.createdAt) / 60000),
  }));
  const primaryEntry =
    cacheEntries.find((entry) => entry.model === MODEL_NAME) ?? cacheEntries[0] ?? null;

  return {
    primaryModel: MODEL_NAME,
    fallbackModels: getFallbackModels(),
    cacheMode: useExplicitCache() ? 'explicit' : 'implicit',
    implicitCachingEnabled: !useExplicitCache(),
    cacheExists: cacheEntries.length > 0,
    cacheName: primaryEntry?.cacheName ?? null,
    cacheAge: primaryEntry?.cacheAge ?? 0,
    cacheAgeMinutes: primaryEntry?.cacheAgeMinutes ?? 0,
    cacheEntries,
    cacheHitCount,
    cacheMissCount,
    lastUsage: lastUsageInfo,
  };
}
