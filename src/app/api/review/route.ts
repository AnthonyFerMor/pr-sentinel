// ============================================================
// /api/review/route.ts — Endpoint manual del agente (SSE)
// La orquestación vive en lib/run-review.ts; aquí solo
// adaptamos los eventos a un stream Server-Sent Events.
// ============================================================

import { NextRequest } from 'next/server';
import { runReview, ReviewMode } from '@/lib/run-review';
import { GeminiServiceError } from '@/lib/gemini';
import { StreamEvent } from '@/lib/types';
import { auth } from '@/lib/auth';
import { getUserKeys } from '@/lib/session';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Read user session + keys
  const session = await auth();
  const userKeys = await getUserKeys();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { prUrl, skills: skillIds, mode } = (body ?? {}) as {
    prUrl?: unknown;
    skills?: unknown;
    mode?: unknown;
  };

  if (!prUrl || typeof prUrl !== 'string') {
    return new Response(
      JSON.stringify({ error: 'prUrl is required in the request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const requestedSkillIds = Array.isArray(skillIds)
    ? skillIds.filter((id): id is string => typeof id === 'string')
    : undefined;

  const reviewMode: ReviewMode =
    mode === 'lite' ? 'lite' : 'full';

  // Per-user credentials: OAuth token for GitHub, encrypted cookie for Gemini
  const githubToken = session?.accessToken;
  const geminiApiKey = userKeys.geminiApiKey;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: StreamEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        await runReview(prUrl, {
          skills: requestedSkillIds,
          onEvent: send,
          softDeadlineMs: (maxDuration - 5) * 1000,
          geminiApiKey,
          githubToken,
          mode: reviewMode,
        });
      } catch (error) {
        const msg =
          error instanceof GeminiServiceError
            ? error.userMessage
            : error instanceof Error
              ? error.message
              : 'Unknown error occurred';
        send({ type: 'error', message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
