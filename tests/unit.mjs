/**
 * Unit tests for PR Sentinel critical business logic.
 * Run with: node tests/unit.mjs
 * No dependencies beyond Node.js built-ins.
 */

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ─── isAddressedToSentinel ────────────────────────────────────────────────────
// Inline the logic (avoid TS import complexity) — mirrors conversational.ts exactly.

const REVIEW_MARKER_NAME = 'pr-sentinel-review';
const SELF_SIGNATURES = [
  '🤖 PR Sentinel',
  REVIEW_MARKER_NAME,
  'PR Sentinel — conversational reply',
  'PR Sentinel — automated re-verification',
];

function isSelfComment(body) {
  return SELF_SIGNATURES.some((sig) => body.includes(sig));
}

function isAddressedToSentinel(body, parentBody) {
  if (isSelfComment(body)) return false;
  const lower = body.toLowerCase();
  if (lower.includes('@pr-sentinel') || lower.includes('@pr_sentinel')) return true;
  if (parentBody && parentBody.includes(REVIEW_MARKER_NAME)) return true;
  return false;
}

section('isAddressedToSentinel — direct mention');
assert(isAddressedToSentinel('@pr-sentinel what do you think?', null), 'detects @pr-sentinel mention');
assert(isAddressedToSentinel('@PR-Sentinel explain this', null), 'case-insensitive');
assert(isAddressedToSentinel('@pr_sentinel look here', null), 'underscore variant');
assert(!isAddressedToSentinel('this is just a comment', null), 'ignores unrelated comment');
assert(!isAddressedToSentinel('', null), 'ignores empty comment');

section('isAddressedToSentinel — reply to sentinel comment');
const parentWithMarker = `Some text <!-- ${REVIEW_MARKER_NAME} {"version":1} --> more`;
assert(isAddressedToSentinel('I disagree with this finding', parentWithMarker), 'reply to sentinel comment');
assert(!isAddressedToSentinel('I disagree', 'random parent comment'), 'ignores reply to non-sentinel comment');
assert(!isAddressedToSentinel('I disagree', null), 'no parent = no match');

section('isAddressedToSentinel — self-loop guard');
assert(!isAddressedToSentinel('🤖 PR Sentinel thinks this is fine', null), 'ignores own review comment');
assert(!isAddressedToSentinel(`Here is my reply\n\n---\n*🤖 PR Sentinel — conversational reply*`, null), 'ignores own reply');
assert(!isAddressedToSentinel(`<!-- ${REVIEW_MARKER_NAME} {"version":1} -->`, null), 'ignores comment with own marker');
assert(!isAddressedToSentinel('PR Sentinel — automated re-verification', null), 'ignores re-verification comment');

// ─── parsePRUrl ───────────────────────────────────────────────────────────────

function parsePRUrl(url) {
  let clean = url.trim();
  if (!clean.startsWith('http')) clean = 'https://' + clean;
  const match = clean.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) throw new Error(`Invalid PR URL: ${url}`);
  const [, owner, repo, numStr] = match;
  const pullNumber = parseInt(numStr, 10);
  if (isNaN(pullNumber) || pullNumber <= 0) throw new Error(`Invalid PR number: ${numStr}`);
  return { owner, repo, pullNumber, url: `https://github.com/${owner}/${repo}/pull/${pullNumber}` };
}

section('parsePRUrl');
assert(parsePRUrl('https://github.com/owner/repo/pull/123').pullNumber === 123, 'parses standard URL');
assert(parsePRUrl('https://github.com/owner/repo/pull/123').owner === 'owner', 'extracts owner');
assert(parsePRUrl('https://github.com/owner/repo/pull/123').repo === 'repo', 'extracts repo');
assert(parsePRUrl('https://github.com/owner/repo/pull/42/files').pullNumber === 42, 'handles /files suffix');
assert(parsePRUrl('github.com/owner/repo/pull/1').pullNumber === 1, 'handles no-protocol URL');

let threw = false;
try { parsePRUrl('https://github.com/owner/repo'); } catch { threw = true; }
assert(threw, 'throws on non-PR URL');

// ─── findingSimilarity ────────────────────────────────────────────────────────

function findingSimilarity(a, b) {
  let score = 0;
  if (a.file === b.file) score += 0.5;
  const wordsA = new Set(a.title.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.title.toLowerCase().split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  if (union.size > 0) score += 0.3 * (intersection.length / union.size);
  if (a.severity === b.severity) score += 0.1;
  if (a.cweId && b.cweId && a.cweId === b.cweId) score += 0.1;
  return score;
}

const THRESHOLD = 0.5;

section('findingSimilarity');
const findingA = { file: 'src/auth.ts', title: 'SQL injection in login', severity: 'critical', cweId: 'CWE-89' };
const findingB = { file: 'src/auth.ts', title: 'SQL injection in login', severity: 'critical', cweId: 'CWE-89' };
const findingC = { file: 'src/other.ts', title: 'XSS in render function', severity: 'high', cweId: 'CWE-79' };
const findingD = { file: 'src/auth.ts', title: 'SQL injection in query handler', severity: 'critical', cweId: 'CWE-89' };

assert(findingSimilarity(findingA, findingB) >= THRESHOLD, 'identical findings are similar');
assert(findingSimilarity(findingA, findingC) < THRESHOLD, 'different findings are not similar');
assert(findingSimilarity(findingA, findingD) >= THRESHOLD, 'same file+similar title+same severity+same CWE → similar');
assert(findingSimilarity(findingA, findingB) === 1.0, 'perfect match scores 1.0');

// ─── diffReviews ─────────────────────────────────────────────────────────────

function getAllFindings(review) {
  return [
    ...review.categories.security,
    ...review.categories.bugs,
    ...review.categories.performance,
    ...review.categories.codeQuality,
    ...review.categories.suggestions,
  ];
}

function diffReviews(oldReview, newReview) {
  const oldFindings = getAllFindings(oldReview);
  const newFindings = getAllFindings(newReview);
  const matchedOld = new Set();
  const matchedNew = new Set();

  for (let i = 0; i < oldFindings.length; i++) {
    let bestMatch = -1;
    let bestScore = 0;
    for (let j = 0; j < newFindings.length; j++) {
      if (matchedNew.has(j)) continue;
      const score = findingSimilarity(oldFindings[i], newFindings[j]);
      if (score > bestScore && score >= THRESHOLD) { bestScore = score; bestMatch = j; }
    }
    if (bestMatch >= 0) { matchedOld.add(i); matchedNew.add(bestMatch); }
  }

  return {
    fixed: oldFindings.filter((_, i) => !matchedOld.has(i)),
    persisting: oldFindings.filter((_, i) => matchedOld.has(i)),
    newFindings: newFindings.filter((_, j) => !matchedNew.has(j)),
  };
}

function makeReview(securityFindings = [], bugFindings = []) {
  return {
    categories: {
      security: securityFindings,
      bugs: bugFindings,
      performance: [],
      codeQuality: [],
      suggestions: [],
    },
  };
}

section('diffReviews');

const sqli = { file: 'src/auth.ts', title: 'SQL injection in login', severity: 'critical', cweId: 'CWE-89' };
const xss  = { file: 'src/render.ts', title: 'XSS in render output', severity: 'high', cweId: 'CWE-79' };
const csrf = { file: 'src/form.ts', title: 'Missing CSRF token', severity: 'medium', cweId: 'CWE-352' };

// Scenario: sqli fixed, xss persists, csrf new
const oldR = makeReview([sqli, xss]);
const newR = makeReview([xss, csrf]);
const diff1 = diffReviews(oldR, newR);

assert(diff1.fixed.length === 1, 'correctly identifies 1 fixed finding');
assert(diff1.fixed[0].cweId === 'CWE-89', 'fixed finding is SQL injection');
assert(diff1.persisting.length === 1, 'correctly identifies 1 persisting finding');
assert(diff1.persisting[0].cweId === 'CWE-79', 'persisting finding is XSS');
assert(diff1.newFindings.length === 1, 'correctly identifies 1 new finding');
assert(diff1.newFindings[0].cweId === 'CWE-352', 'new finding is CSRF');

// Scenario: all fixed
const diff2 = diffReviews(makeReview([sqli]), makeReview([]));
assert(diff2.fixed.length === 1 && diff2.persisting.length === 0 && diff2.newFindings.length === 0, 'all fixed');

// Scenario: nothing changed
const diff3 = diffReviews(makeReview([sqli]), makeReview([sqli]));
assert(diff3.fixed.length === 0 && diff3.persisting.length === 1 && diff3.newFindings.length === 0, 'nothing changed');

// Scenario: empty reviews
const diff4 = diffReviews(makeReview(), makeReview());
assert(diff4.fixed.length === 0 && diff4.persisting.length === 0 && diff4.newFindings.length === 0, 'both empty');

// ─── formatResolutionSummary spot check ──────────────────────────────────────

section('formatResolutionSummary output shape');

function formatResolutionSummary(diff) {
  const sections = [];
  sections.push('## 🔄 Re-verification Summary\n');
  sections.push(`PR Sentinel re-analyzed this PR after new commits. Here's what changed:\n`);
  if (diff.fixed.length > 0) {
    sections.push(`### ✅ Fixed (${diff.fixed.length})\n`);
    for (const f of diff.fixed) sections.push(`- ~~**${f.title}**~~ in \`${f.file}\` — resolved!`);
    sections.push('');
  }
  if (diff.persisting.length > 0) {
    sections.push(`### ⚠️ Still Present (${diff.persisting.length})\n`);
    for (const f of diff.persisting) sections.push(`- **${f.title}** in \`${f.file}\` — still needs attention`);
    sections.push('');
  }
  if (diff.newFindings.length > 0) {
    sections.push(`### 🆕 New Findings (${diff.newFindings.length})\n`);
    for (const f of diff.newFindings) sections.push(`- **${f.title}** [${f.severity}] in \`${f.file}\``);
    sections.push('');
  }
  if (!diff.fixed.length && !diff.persisting.length && !diff.newFindings.length)
    sections.push('No significant changes in findings between reviews.\n');
  sections.push('---\n*🤖 PR Sentinel — automated re-verification*');
  return sections.join('\n');
}

const summary = formatResolutionSummary(diff1);
assert(summary.includes('## 🔄 Re-verification Summary'), 'has header');
assert(summary.includes('✅ Fixed (1)'), 'shows fixed count');
assert(summary.includes('⚠️ Still Present (1)'), 'shows persisting count');
assert(summary.includes('🆕 New Findings (1)'), 'shows new count');
assert(summary.includes('🤖 PR Sentinel'), 'has bot signature');

const emptySum = formatResolutionSummary({ fixed: [], persisting: [], newFindings: [] });
assert(emptySum.includes('No significant changes'), 'empty diff shows no-change message');

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED ✅');
}
