/**
 * Standalone test runner — calls GitHub API + Gemini directly.
 * No Next.js imports, no auth middleware.
 * Run: npx tsx --env-file=.env.local scripts/test-reviews.ts
 */
import { runReview } from '../src/lib/run-review';
import type { StreamEvent } from '../src/lib/types';

const PR_URLS = [
  'https://github.com/iqsource/hackathon-2026-05-notesy/pull/1',
  'https://github.com/iqsource/hackathon-2026-05-notesy/pull/2',
  'https://github.com/iqsource/hackathon-2026-05-notesy/pull/3',
  'https://github.com/iqsource/hackathon-2026-05-notesy/pull/4',
];

const githubToken = process.env.PR_SENTINEL_GITHUB_TOKEN;
const geminiApiKey = process.env.GEMINI_API_KEY;

async function main() {
  console.log(`GitHub token: ${githubToken ? '✅ set' : '❌ missing'}`);
  console.log(`Gemini key:   ${geminiApiKey ? '✅ set' : '❌ missing'}`);
  if (!githubToken || !geminiApiKey) {
    console.error('Missing credentials. Make sure .env.local is loaded.');
    process.exit(1);
  }

  for (const prUrl of PR_URLS) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📋 Reviewing: ${prUrl}`);
    console.log('='.repeat(70));
    const t0 = Date.now();
    try {
      const outcome = await runReview(prUrl, {
        updateExisting: true,
        skipIfReviewed: false,
        githubToken,
        geminiApiKey,
        onEvent: (e: StreamEvent) => {
          if (e.type === 'status') process.stdout.write('  ' + e.message + '\n');
          if (e.type === 'error') process.stderr.write('  ⚠ ERROR: ' + e.message + '\n');
          if (e.type === 'complete') {
            const r = e.data;
            const total = [
              ...r.categories.security,
              ...r.categories.bugs,
              ...r.categories.performance,
              ...r.categories.codeQuality,
              ...r.categories.suggestions,
            ].length;
            const cached = r.metadata.cachedTokens.toLocaleString();
            const total_tok = r.metadata.totalTokens.toLocaleString();
            console.log(`\n  ✅ RESULT: ${r.overallRiskLevel.toUpperCase()} | ${total} findings`);
            console.log(`     🔒${r.categories.security.length} bugs:🐛${r.categories.bugs.length} perf:⚡${r.categories.performance.length}`);
            console.log(`     Cache hit: ${r.metadata.cacheHit ? '✅' : '❌'} | Cached: ${cached} | Total: ${total_tok} tokens`);
            console.log(`     Model: ${r.metadata.modelUsed}`);
          }
        },
      });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ⏱ ${elapsed}s | Comment: ${outcome.commentUrl ?? '(not posted)'}`);
      if (outcome.commentError) console.error(`  ⚠ Comment error: ${outcome.commentError}`);
    } catch (err) {
      console.error(`  ❌ FAILED: ${(err as Error).message}`);
      if ((err as Error).stack) console.error((err as Error).stack!.split('\n').slice(0, 5).join('\n'));
    }
  }

  console.log('\n🎉 All reviews done!');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
