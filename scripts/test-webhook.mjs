import crypto from 'node:crypto';

const WEBHOOK_SECRET = 'rjGkSpyAitzNweLxbxxsek5ZRXlTegC2o3oBcyCbnN8=';
const URL = 'https://pr-sentinel-sigma.vercel.app/api/webhooks/github';

const PRs = [
  { owner: 'iqsource', repo: 'hackathon-2026-05-notesy', number: 1 },
  { owner: 'iqsource', repo: 'hackathon-2026-05-notesy', number: 2 },
  { owner: 'iqsource', repo: 'hackathon-2026-05-notesy', number: 3 },
  { owner: 'iqsource', repo: 'hackathon-2026-05-notesy', number: 4 }
];

async function run() {
  for (const pr of PRs) {
    const payload = {
      action: 'opened',
      pull_request: {
        html_url: `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}`,
        draft: false,
        number: pr.number
      },
      repository: {
        full_name: `${pr.owner}/${pr.repo}`
      }
    };

    const body = JSON.stringify(payload);
    const signature = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

    console.log(`Triggering PR #${pr.number} ...`);
    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'pull_request',
        'x-hub-signature-256': signature
      },
      body
    });

    const text = await res.text();
    console.log(`Status: ${res.status} - ${text}`);
  }
}

run().catch(console.error);
