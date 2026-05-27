// ============================================================
// /api/webhooks/github — Listener de eventos de GitHub
// ------------------------------------------------------------
// Recibe pull_request events (opened / reopened / synchronize),
// verifica la firma HMAC y dispara runReview en background con
// after(), respondiendo 202 de inmediato para no agotar el
// timeout de entrega de webhooks de GitHub.
// ============================================================

import { NextRequest, NextResponse, after } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { runReview } from '@/lib/run-review';

export const runtime = 'nodejs';
export const maxDuration = 60;

const REVIEWABLE_ACTIONS = new Set(['opened', 'reopened', 'synchronize', 'ready_for_review']);

/** Verifica la firma x-hub-signature-256 contra el secreto compartido. */
function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  // timingSafeEqual lanza si difieren en longitud → comparamos largo primero.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: 'GITHUB_WEBHOOK_SECRET is not configured.' },
      { status: 500 }
    );
  }

  // Necesitamos el body crudo para verificar la firma; parseamos después.
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = request.headers.get('x-github-event');
  if (event === 'ping') {
    return NextResponse.json({ ok: true, pong: true });
  }
  if (event !== 'pull_request') {
    return NextResponse.json({ ok: true, ignored: `event '${event}'` });
  }

  let payload: {
    action?: string;
    pull_request?: { html_url?: string; draft?: boolean; number?: number };
    repository?: { full_name?: string };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const action = payload.action ?? '';
  const prUrl = payload.pull_request?.html_url;

  if (!REVIEWABLE_ACTIONS.has(action) || !prUrl) {
    return NextResponse.json({ ok: true, ignored: `action '${action}'` });
  }
  if (payload.pull_request?.draft) {
    return NextResponse.json({ ok: true, ignored: 'draft PR' });
  }

  // Dispara el review en background y responde 202 de inmediato.
  after(async () => {
    try {
      const outcome = await runReview(prUrl, {
        updateExisting: true,
        skipIfReviewed: true,
        softDeadlineMs: (maxDuration - 5) * 1000,
      });
      console.log(
        `[webhook] ${payload.repository?.full_name} ${action} → ` +
          (outcome.skipped ? 'skipped (already reviewed)' : `reviewed: ${outcome.commentUrl ?? 'no comment'}`)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[webhook] review failed for ${prUrl}: ${msg}`);
    }
  });

  return NextResponse.json({ ok: true, queued: prUrl }, { status: 202 });
}
