// ============================================================
// /api/webhooks/github — Listener de eventos de GitHub
// ------------------------------------------------------------
// Handles:
//   - pull_request (opened/reopened/synchronize/ready_for_review)
//   - issue_comment (replies to PR Sentinel on PRs)
//   - pull_request_review_comment (inline review comment replies)
//
// Verifica la firma HMAC y dispara el trabajo en background con
// after(), respondiendo 202 de inmediato para no agotar el
// timeout de entrega de webhooks de GitHub.
// ============================================================

import { NextRequest, NextResponse, after } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { runReview } from '@/lib/run-review';
import { handleCommentEvent } from '@/lib/conversational';
import { getAuthenticatedLogin } from '@/lib/github';
import { parsePRUrl } from '@/lib/parser';
import { getRepoOwner, getUserConfig, ReviewStyle } from '@/lib/storage';

/**
 * Resolve the credentials to use for a webhook-triggered review.
 *
 * Multi-tenant model:
 *   - If a user has enabled auto-review on this repo (via /repositories UI),
 *     their record is in KV. We use their stored PAT + Gemini key — meaning
 *     the GitHub comment is posted as that user, and the Gemini quota is
 *     billed to their key.
 *   - If no record exists (e.g. someone wired this app's webhook URL into a
 *     repo manually, or KV is unconfigured), we fall back to the server's
 *     env-var credentials. This preserves the original single-tenant flow.
 */
async function resolveCredentials(
  owner: string,
  repo: string,
): Promise<{ githubToken?: string; geminiApiKey?: string; userId?: string; reviewStyle?: ReviewStyle; inlineMode?: boolean }> {
  try {
    const userId = await getRepoOwner(owner, repo);
    if (!userId) return {};
    const cfg = await getUserConfig(userId);
    return {
      userId,
      githubToken: cfg?.githubPAT,
      geminiApiKey: cfg?.geminiApiKey,
      reviewStyle: cfg?.reviewStyle,
      inlineMode: cfg?.inlineMode,
    };
  } catch (err) {
    console.warn('[webhook] credential lookup failed, falling back to server:', err);
    return {};
  }
}

export const runtime = 'nodejs';
export const maxDuration = 60;

const REVIEWABLE_ACTIONS = new Set(['opened', 'reopened', 'synchronize', 'ready_for_review']);

/** Verifica la firma x-hub-signature-256 contra el secreto compartido. */
function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── Payload types for each event ─────────────────────────────

interface PullRequestPayload {
  action?: string;
  pull_request?: { html_url?: string; draft?: boolean; number?: number; title?: string };
  repository?: { full_name?: string };
}

interface IssueCommentPayload {
  action?: string;
  issue?: {
    number?: number;
    pull_request?: { html_url?: string };
  };
  comment?: {
    id?: number;
    body?: string;
    user?: { login?: string };
    html_url?: string;
  };
  repository?: { full_name?: string };
}

interface ReviewCommentPayload {
  action?: string;
  pull_request?: { html_url?: string; number?: number; title?: string };
  comment?: {
    id?: number;
    body?: string;
    user?: { login?: string };
    html_url?: string;
    in_reply_to_id?: number;
  };
  repository?: { full_name?: string };
}

// ── Handlers ─────────────────────────────────────────────────

function handlePullRequest(payload: PullRequestPayload) {
  const action = payload.action ?? '';
  const prUrl = payload.pull_request?.html_url;

  if (!REVIEWABLE_ACTIONS.has(action) || !prUrl) {
    return NextResponse.json({ ok: true, ignored: `action '${action}'` });
  }
  if (payload.pull_request?.draft) {
    return NextResponse.json({ ok: true, ignored: 'draft PR' });
  }

  // Parse owner/repo from full_name to look up per-user credentials.
  const fullName = payload.repository?.full_name ?? '';
  const [owner, repo] = fullName.split('/');

  after(async () => {
    try {
      const creds = owner && repo ? await resolveCredentials(owner, repo) : {};
      // Match the manual (paste-a-link) flow: the FIRST review of a PR is posted
      // as line-anchored inline comments (when the user has inline mode on).
      // runReview then auto-detects a prior review on later pushes and evolves a
      // single summary comment instead of stacking — inline reviews can't be
      // edited in place, so re-reviews fall back to comment mode there.
      const outcome = await runReview(prUrl, {
        updateExisting: false,
        skipIfReviewed: true,
        softDeadlineMs: (maxDuration - 5) * 1000,
        githubToken: creds.githubToken,
        geminiApiKey: creds.geminiApiKey,
        reviewStyle: creds.reviewStyle,
        inlineMode: creds.inlineMode ?? true,
        userId: creds.userId,
      });
      console.log(
        `[webhook] ${fullName} ${action} → ` +
          (outcome.skipped ? 'skipped (already reviewed)' : `reviewed: ${outcome.commentUrl ?? 'no comment'}`) +
          (creds.userId ? ` (as user ${creds.userId})` : ' (server credentials)'),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[webhook] review failed for ${prUrl}: ${msg}`);
    }
  });

  return NextResponse.json({ ok: true, queued: prUrl }, { status: 202 });
}

// Bot usernames to ignore (prevent self-reply loops).
const BOT_LOGINS = new Set(['pr-sentinel[bot]', 'pr-sentinel', 'github-actions[bot]']);

function handleIssueComment(payload: IssueCommentPayload) {
  // Only handle newly created comments, not edits or deletes.
  if (payload.action !== 'created') {
    return NextResponse.json({ ok: true, ignored: `comment action '${payload.action}'` });
  }

  // Ignore comments from our own bot to prevent infinite loops.
  const commentAuthor = payload.comment?.user?.login?.toLowerCase() ?? '';
  if (BOT_LOGINS.has(commentAuthor)) {
    return NextResponse.json({ ok: true, ignored: 'self-comment (bot)' });
  }

  // issue_comment fires for issues AND PRs. Confirm it's a PR.
  const prHtmlUrl = payload.issue?.pull_request?.html_url;
  if (!prHtmlUrl) {
    return NextResponse.json({ ok: true, ignored: 'not a PR comment' });
  }

  const comment = payload.comment;
  if (!comment?.body || !comment.id || !comment.user?.login) {
    return NextResponse.json({ ok: true, ignored: 'incomplete comment payload' });
  }

  let prInfo;
  try {
    prInfo = parsePRUrl(prHtmlUrl);
  } catch {
    return NextResponse.json({ ok: true, ignored: 'could not parse PR URL from issue_comment' });
  }

  // Resolve repo owner's credentials so the reply uses their PAT + Gemini key.
  const fullName = payload.repository?.full_name ?? '';
  const [owner, repo] = fullName.split('/');

  after(async () => {
    try {
      const creds = owner && repo ? await resolveCredentials(owner, repo) : {};
      // Defense-in-depth: ignore the bot's OWN comments even when posted under
      // a user's PAT (dynamic identity, not a fixed bot name).
      const selfLogin = await getAuthenticatedLogin(creds.githubToken);
      if (selfLogin && comment.user!.login!.toLowerCase() === selfLogin) {
        console.log('[webhook] ignoring own issue_comment (dynamic identity).');
        return;
      }
      const result = await handleCommentEvent(
        prInfo,
        {
          id: comment.id!,
          body: comment.body!,
          author: comment.user!.login!,
          htmlUrl: comment.html_url ?? '',
        },
        `PR #${prInfo.pullNumber}`,
        { geminiApiKey: creds.geminiApiKey, githubToken: creds.githubToken },
      );

      if (!result) {
        console.log(`[webhook] comment on ${payload.repository?.full_name}#${prInfo.pullNumber} — not addressed to PR Sentinel, ignored.`);
      } else if (result.replied) {
        console.log(`[webhook] replied to @${comment.user!.login} on ${payload.repository?.full_name}#${prInfo.pullNumber}: ${result.commentUrl}`);
      } else {
        console.log(`[webhook] comment addressed to PR Sentinel but empty question, skipped.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[webhook] conversational reply failed: ${msg}`);
    }
  });

  return NextResponse.json({ ok: true, queued: 'comment_reply' }, { status: 202 });
}

function handleReviewComment(payload: ReviewCommentPayload) {
  if (payload.action !== 'created') {
    return NextResponse.json({ ok: true, ignored: `review_comment action '${payload.action}'` });
  }

  // Ignore bot's own inline review comments.
  const reviewAuthor = payload.comment?.user?.login?.toLowerCase() ?? '';
  if (BOT_LOGINS.has(reviewAuthor)) {
    return NextResponse.json({ ok: true, ignored: 'self-review-comment (bot)' });
  }

  const prUrl = payload.pull_request?.html_url;
  const comment = payload.comment;
  if (!prUrl || !comment?.body || !comment.id || !comment.user?.login) {
    return NextResponse.json({ ok: true, ignored: 'incomplete review comment payload' });
  }

  let prInfo;
  try {
    prInfo = parsePRUrl(prUrl);
  } catch {
    return NextResponse.json({ ok: true, ignored: 'could not parse PR URL from review_comment' });
  }

  const fullName = payload.repository?.full_name ?? '';
  const [owner, repo] = fullName.split('/');

  after(async () => {
    try {
      const creds = owner && repo ? await resolveCredentials(owner, repo) : {};
      const selfLogin = await getAuthenticatedLogin(creds.githubToken);
      if (selfLogin && comment.user!.login!.toLowerCase() === selfLogin) {
        console.log('[webhook] ignoring own review_comment (dynamic identity).');
        return;
      }
      const result = await handleCommentEvent(
        prInfo,
        {
          id: comment.id!,
          body: comment.body!,
          author: comment.user!.login!,
          htmlUrl: comment.html_url ?? '',
          inReplyToId: comment.in_reply_to_id,
        },
        payload.pull_request?.title ?? `PR #${prInfo.pullNumber}`,
        { geminiApiKey: creds.geminiApiKey, githubToken: creds.githubToken },
      );

      if (!result) {
        console.log(`[webhook] inline review comment on ${payload.repository?.full_name}#${prInfo.pullNumber} — not addressed, ignored.`);
      } else if (result.replied) {
        console.log(`[webhook] replied to inline comment by @${comment.user!.login}: ${result.commentUrl}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[webhook] inline review reply failed: ${msg}`);
    }
  });

  return NextResponse.json({ ok: true, queued: 'review_comment_reply' }, { status: 202 });
}

// ── Main POST handler ────────────────────────────────────────

export async function POST(request: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: 'GITHUB_WEBHOOK_SECRET is not configured.' },
      { status: 500 }
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = request.headers.get('x-github-event');
  if (event === 'ping') {
    return NextResponse.json({ ok: true, pong: true });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  switch (event) {
    case 'pull_request':
      return handlePullRequest(payload as PullRequestPayload);

    case 'issue_comment':
      return handleIssueComment(payload as IssueCommentPayload);

    case 'pull_request_review_comment':
      return handleReviewComment(payload as ReviewCommentPayload);

    default:
      return NextResponse.json({ ok: true, ignored: `event '${event}'` });
  }
}
