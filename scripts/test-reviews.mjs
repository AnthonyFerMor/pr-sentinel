/**
 * Direct test runner — calls runReview() without needing the HTTP server.
 * Run: node --env-file=.env.local scripts/test-reviews.mjs
 */

// Set env manually since --env-file may not be available in all Node versions
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Parse .env.local
const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of envFile.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

// Dynamic import after env setup
const { runReview } = await import('../src/lib/run-review.ts');

const PR_URLS = [
  'https://github.com/iqsource/hackathon-2026-05-notesy/pull/1',
  'https://github.com/iqsource/hackathon-2026-05-notesy/pull/2',
  'https://github.com/iqsource/hackathon-2026-05-notesy/pull/3',
  'https://github.com/iqsource/hackathon-2026-05-notesy/pull/4',
];

const githubToken = process.env.PR_SENTINEL_GITHUB_TOKEN;
const geminiApiKey = process.env.GEMINI_API_KEY;

console.log(`GitHub token: ${githubToken ? '✅' : '❌ missing'}`);
console.log(`Gemini key:   ${geminiApiKey ? '✅' : '❌ missing'}`);
console.log('');

for (const prUrl of PR_URLS) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Reviewing: ${prUrl}`);
  console.log('='.repeat(60));
  try {
    const outcome = await runReview(prUrl, {
      updateExisting: false,
      skipIfReviewed: false,
      githubToken,
      geminiApiKey,
      onEvent: (e) => {
        if (e.type === 'status') console.log('  ' + e.message);
        else if (e.type === 'error') console.error('  ERROR: ' + e.message);
        else if (e.type === 'complete') {
          const r = e.data;
          const total = Object.values(r.categories).flat().length;
          console.log(`  => ${r.overallRiskLevel.toUpperCase()} | ${total} findings`);
        }
      },
    });
    console.log(`  Comment URL: ${outcome.commentUrl ?? '(none)'}`);
    if (outcome.commentError) console.error(`  Comment error: ${outcome.commentError}`);
  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
  }
}

console.log('\n✅ All reviews done.');
