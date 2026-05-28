/**
 * Retry webhook for PR #1 only.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

function sign(body, secret) {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

const payload = {
  action: 'opened',
  pull_request: {
    number: 1,
    title: 'Add full-text search to notes',
    html_url: 'https://github.com/iqsource/hackathon-2026-05-notesy/pull/1',
    draft: false,
    state: 'open',
    head: { sha: 'abc124' },
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

console.log('Retrying PR #1...');
const res = await fetch('http://localhost:3000/api/webhooks/github', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-GitHub-Event': 'pull_request',
    'X-Hub-Signature-256': signature,
    'X-GitHub-Delivery': `retry-1-${Date.now()}`,
  },
  body,
});
const text = await res.text();
console.log(`Response ${res.status}: ${text}`);
