/**
 * Sends fake GitHub pull_request webhook events to the local dev server.
 * Signs each payload with the local GITHUB_WEBHOOK_SECRET.
 * Run: node scripts/send-webhooks.mjs
 */

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Parse .env.local
const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const env = {};
for (const line of envFile.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

const SECRET = env.GITHUB_WEBHOOK_SECRET;
if (!SECRET) { console.error('Missing GITHUB_WEBHOOK_SECRET'); process.exit(1); }

console.log(`Webhook secret: ${SECRET.slice(0, 8)}...`);

const BASE_URL = 'http://localhost:3000';

const PRS = [
  { number: 1, title: 'Add full-text search to notes' },
  { number: 2, title: 'Add user profile endpoint + per-note view tracking' },
  { number: 3, title: 'Add pagination to notes list' },
  { number: 4, title: 'Add comment feature to note detail pages' },
];

function sign(body, secret) {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

async function sendWebhook(prNumber, prTitle) {
  const payload = {
    action: 'opened',
    pull_request: {
      number: prNumber,
      title: prTitle,
      html_url: `https://github.com/iqsource/hackathon-2026-05-notesy/pull/${prNumber}`,
      draft: false,
      state: 'open',
      head: { sha: 'abc123' },
    },
    repository: {
      full_name: 'iqsource/hackathon-2026-05-notesy',
      name: 'hackathon-2026-05-notesy',
      owner: { login: 'iqsource' },
    },
    sender: { login: 'iqsource' },
  };

  const body = JSON.stringify(payload);
  const signature = sign(body, SECRET);

  console.log(`\nSending webhook for PR #${prNumber}: "${prTitle}"`);

  const res = await fetch(`${BASE_URL}/api/webhooks/github`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'pull_request',
      'X-Hub-Signature-256': signature,
      'X-GitHub-Delivery': `test-${prNumber}-${Date.now()}`,
    },
    body,
  });

  const text = await res.text();
  console.log(`  Response ${res.status}: ${text}`);
  return res.status;
}

// Send all 4 PRs with a small delay between each
for (const pr of PRS) {
  await sendWebhook(pr.number, pr.title);
  // Small delay to avoid overwhelming the dev server
  await new Promise(r => setTimeout(r, 2000));
}

console.log('\n✅ All webhooks sent! Reviews are running in the background.');
console.log('   Check GitHub for comments on the Notesy PRs in ~30-60 seconds.');
