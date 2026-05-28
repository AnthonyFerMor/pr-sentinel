// ============================================================
// GITHUB-WEBHOOKS.TS — Create/delete webhooks on a user's repo.
//
// Why a separate file: the rest of github.ts deals with PR reads.
// Webhook management is a different concern (admin-level scope on
// the repo) and only used by the auto-bot enable/disable flow.
// ============================================================

import { Octokit } from 'octokit';

interface WebhookConfig {
  url: string;
  secret: string;
  contentType?: 'json' | 'form';
}

const EVENTS = ['pull_request', 'issue_comment', 'pull_request_review_comment'];

function client(token: string): Octokit {
  return new Octokit({ auth: token });
}

/**
 * Creates a webhook on `owner/repo`. Returns the GitHub-assigned hook id.
 * If a hook with the same callback URL already exists, returns its id instead
 * of creating a duplicate (idempotent).
 */
export async function createRepoWebhook(
  token: string,
  owner: string,
  repo: string,
  config: WebhookConfig,
): Promise<number> {
  const octo = client(token);

  // Idempotency: avoid duplicate hooks pointing at the same URL.
  const existing = await octo.rest.repos.listWebhooks({ owner, repo });
  const dupe = existing.data.find((h) => h.config?.url === config.url);
  if (dupe) return dupe.id;

  const res = await octo.rest.repos.createWebhook({
    owner,
    repo,
    name: 'web',
    active: true,
    events: EVENTS,
    config: {
      url: config.url,
      content_type: config.contentType ?? 'json',
      secret: config.secret,
      insecure_ssl: '0',
    },
  });
  return res.data.id;
}

/** Deletes a webhook by id. 404 is treated as success (already gone). */
export async function deleteRepoWebhook(
  token: string,
  owner: string,
  repo: string,
  hookId: number,
): Promise<void> {
  const octo = client(token);
  try {
    await octo.rest.repos.deleteWebhook({ owner, repo, hook_id: hookId });
  } catch (err: unknown) {
    // Octokit RequestError carries .status
    const status = (err as { status?: number })?.status;
    if (status !== 404) throw err;
  }
}
