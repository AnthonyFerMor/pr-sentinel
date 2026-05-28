/**
 * Send a signed pull_request.opened webhook to PROD for our test repo.
 * Run: node scripts/trigger-test-repo.mjs
 */
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const env = {};
for (const line of envFile.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const SECRET = env.GITHUB_WEBHOOK_SECRET;
const URL = 'https://pr-sentinel-sigma.vercel.app/api/webhooks/github';

const payload = {
  action: 'opened',
  pull_request: {
    number: 1,
    title: 'Add search, export, and admin command endpoints',
    html_url: 'https://github.com/AnthonyFerMor/pr-sentinel-test/pull/1',
    draft: false,
    state: 'open',
    head: { sha: 'test' },
  },
  repository: {
    full_name: 'AnthonyFerMor/pr-sentinel-test',
    name: 'pr-sentinel-test',
    owner: { login: 'AnthonyFerMor' },
  },
  sender: { login: 'AnthonyFerMor' },
};

const body = JSON.stringify(payload);
const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');

const res = await fetch(URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-github-event': 'pull_request',
    'x-hub-signature-256': sig,
    'x-github-delivery': `test-${Date.now()}`,
  },
  body,
});
console.log(`Status: ${res.status}`);
console.log(await res.text());
