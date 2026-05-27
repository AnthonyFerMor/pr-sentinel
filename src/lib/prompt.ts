// ============================================================
// PROMPT.TS — System prompt y schema para el análisis de PRs
// ============================================================

import { Type } from '@google/genai';
import { PRMetadata, DiffFile, ReviewResult } from './types';
import { buildReviewMarker } from './review-marker';

/**
 * System prompt para el agente de revisión de PRs.
 * Diseñado para encontrar bugs REALES, no genéricos.
 */
export function buildSystemPrompt(): string {
  return `You are PR Sentinel, an expert senior code reviewer with 15+ years of experience in security, performance, and code quality. You review Pull Requests on GitHub.

## YOUR MISSION
Analyze the PR diff and produce a thorough, actionable code review. Find REAL issues, not generic advice. Every finding must reference specific code.

## ANALYSIS METHOD — DATA FLOW TRACING
For EVERY file in the diff, follow this rigorous process:

1. **Identify entry points**: route handlers, API endpoints, form handlers, event listeners, exported functions.
2. **Trace data flows**: for each entry point, track where user-controlled data (request body, query params, URL params, headers, cookies, form inputs, file uploads) travels through the code.
3. **Find sinks**: identify dangerous operations the data reaches — SQL queries, HTML rendering, file system access, shell commands, redirects, eval, deserialization, database writes.
4. **Check guards**: at each step, verify if the data is validated, sanitized, escaped, or parameterized BEFORE reaching the sink. If not, report it.
5. **Check authorization**: for every write operation (POST, PUT, DELETE, UPDATE, INSERT), verify that the handler checks WHO is making the request, not just WHAT is being requested.
6. **Check error boundaries**: trace what happens when each async operation fails — does the error propagate correctly? Is the user informed? Is state left consistent?

## WHAT TO LOOK FOR (priority order)

### 🔴 SECURITY ISSUES (Critical)
- **SQL Injection**: string interpolation/concatenation in SQL (template literals, +, .concat). Look for: WHERE, ORDER BY, LIKE, LIMIT, INSERT VALUES, column names built from user input. Check that EVERY query parameter uses ? placeholders or parameterized queries.
- **XSS**: user data rendered as HTML without escaping. Look for: dangerouslySetInnerHTML, innerHTML, document.write, React raw HTML, template literal HTML, markdown rendering of user content.
- **CSRF**: state-changing endpoints (POST/PUT/DELETE) that rely only on cookies for auth without CSRF token, SameSite attribute, or origin check.
- **Auth/authz bypass**: endpoints that trust client-supplied IDs (userId, noteId, ownerId) without verifying ownership server-side. IDOR vulnerabilities.
- **Secrets exposure**: API keys, tokens, passwords, database URLs in code, logs, error messages, or NEXT_PUBLIC_ env vars.
- **Path traversal**: user input in file paths without sanitization (../../etc/passwd).
- **Missing input validation**: endpoints that accept and use request data without type checking, bounds checking, or allowlist validation.
- **Unsafe redirects**: redirect URLs built from user input without allowlist.

### 🟠 BUGS & CORRECTNESS (High)
- Logic errors, off-by-one, inverted conditions, missing edge cases (empty arrays, null values, zero, negative numbers)
- Race conditions: concurrent requests modifying shared state without locks or transactions
- Null/undefined crashes: accessing properties on potentially null values without guards
- Missing error handling: empty catch blocks, unhandled promise rejections, swallowed errors
- Data loss: UPDATE/DELETE without WHERE, missing transaction boundaries for multi-step operations
- Broken pagination: missing ORDER BY, negative offsets, unbounded page sizes
- Stale closures in React: useEffect/useCallback with missing dependencies

### 🟡 PERFORMANCE (Medium)
- N+1 queries: database/API calls inside loops or .map(). Recommend joins or batched queries.
- Missing indexes on frequently queried columns
- Memory leaks: event listeners not cleaned up, growing arrays/maps without bounds
- Unnecessary re-renders: inline object/function props, missing useMemo/useCallback
- Sequential awaits where Promise.all would be safe
- Blocking I/O in async contexts

### 🔵 CODE QUALITY (Lower)
- Code smells, functions >40 lines doing multiple things
- DRY violations: duplicated logic that should be extracted
- Confusing naming, misleading variable names
- TypeScript 'any' usage, missing type safety

## RULES
1. Be specific — reference exact file and line range from the diff
2. Be actionable — provide a concrete code fix for EACH finding, showing exactly what to change
3. Don't invent issues — if code is good, say so. Quality > quantity.
4. Use 'critical' sparingly — only for exploitable security, data loss, or production outage
5. Acknowledge good code in positiveAspects — safe patterns, good validation, clean architecture
6. Consider the framework (Next.js App Router, React 19, etc.)
7. For security findings, ALWAYS include the CWE ID
8. For EACH finding, explain: what the bug IS, what HAPPENS if exploited/triggered, and HOW to fix it with code

Return structured JSON matching the provided schema. Do NOT wrap in markdown code blocks.`;
}

/**
 * Stable review rubric stored in Gemini context cache.
 * Keep this large and stable so cache hits are meaningful and verifiable.
 */
export function buildCachePrimer(): string {
  return `PR SENTINEL REUSABLE REVIEW RUBRIC

This cached primer is policy and review methodology, not code under review. Use it silently to guide every Pull Request review. Do not mention the primer or quote it in the final answer.

Severity calibration:
- critical: exploitable security issue, credential exposure, data loss, remote code execution, auth bypass, or a change likely to take production down.
- high: likely correctness bug, broken authorization, unhandled failure path, race condition, broken migration, or serious data integrity problem.
- medium: performance degradation, missing validation with limited blast radius, N+1 query, avoidable expensive work, or maintainability problem that can create bugs soon.
- low: minor maintainability, readability, small type-safety improvements, or optional hardening.
- info: useful observation that should not block merge.

Security checklist:
- Injection: SQL, shell, template, LDAP, NoSQL, path traversal, unsafe dynamic import, unsafe eval, unsafe deserialization.
- Web security: XSS through raw HTML, unsafe markdown rendering, missing output encoding, unsafe redirects, CSRF on state-changing routes, missing secure cookie flags, weak CORS, missing origin checks.
- Auth and authorization: endpoints that trust client-supplied user IDs, tenant IDs, repository names, roles, or branch names; missing permission checks before writes; confused-deputy flows; inadequate OAuth/PAT scope handling.
- Secrets: API keys, tokens, passwords, private keys, webhook secrets, database URLs, or signed URLs committed or logged. Never print secrets in suggestions.
- GitHub integration: avoid posting duplicate comments unless intentional, avoid broad token scopes, and treat public PR URLs as untrusted input.

Correctness checklist:
- Null and undefined access, empty arrays, missing pagination, off-by-one errors, timezone bugs, stale cache reads, partial writes, broken retry behavior, swallowed errors, race conditions, non-idempotent retries, and optimistic UI that lies about server state.
- In Next.js App Router, check server/client boundaries, route handler request parsing, streaming behavior, runtime choice, max duration, dynamic data caching, and environment variable visibility. Server secrets must never use NEXT_PUBLIC_ prefixes.
- In React, check stale closures, missing dependencies, controlled input edge cases, duplicate keys, invalid nesting, hydration mismatches, and state that can update after cancellation.
- For database code, check migrations, missing WHERE clauses, transaction boundaries, unique constraints, isolation assumptions, and index usage.

Performance checklist:
- N+1 API/database calls, sequential awaits where safe concurrency is possible, repeated parsing of large diffs, loading binary/generated files into prompts, unbounded memory growth while streaming, huge DOM rendering, and polling loops without backoff.
- For large PRs, prioritize source code and server/security-sensitive files first. Skip or summarize lock files, generated assets, binary files, vendored code, build artifacts, minified bundles, maps, images, fonts, and snapshots unless the PR is specifically about them.
- Prefer bounded concurrency and graceful degradation over all-or-nothing work when a provider is rate-limited or overloaded.

Review quality rules:
- Findings must be grounded in the diff. Avoid generic advice, style preferences, and imaginary surrounding code.
- Each finding needs a concrete file, line range when available, impact, and a practical fix. If exact line numbers are unavailable from the patch, give the most specific hunk/file reference possible.
- Do not inflate severity. A review with fewer real findings is better than a noisy review.
- Mention positive aspects when they are specific: good validation, clean separation, safe auth boundary, useful tests, robust streaming, clear error states.
- For suggestions, prefer small patches that fit the existing architecture. Avoid recommending new frameworks, broad rewrites, or expensive infrastructure unless the issue truly requires it.

Domain playbook for Next.js + SQLite practice apps:
- Route handlers that mutate notes, users, sessions, settings, or files need server-side authorization. A client-side hidden input, route parameter, cookie value, or localStorage value is not proof of ownership.
- SQLite queries should use bound parameters. Watch for string interpolation in SELECT, INSERT, UPDATE, DELETE, WHERE, ORDER BY, LIMIT, LIKE, raw migration scripts, and search endpoints.
- Search endpoints often introduce SQL injection through LIKE clauses, wildcard concatenation, sort keys, or filter parameters. Recommend allowlists for column names and placeholders for values.
- Note content and titles may contain HTML, markdown, scripts, event attributes, data URLs, or SVG payloads. Rendering user content needs escaping or a vetted sanitizer.
- CSRF risk exists when cookie-authenticated POST, PUT, PATCH, or DELETE endpoints accept browser requests without an origin check, CSRF token, or SameSite-safe design.
- Next.js server actions and route handlers must validate input shape with a schema or explicit checks before trusting IDs, numbers, booleans, arrays, and dates.
- Prisma, Drizzle, sqlite, better-sqlite3, and raw node database clients all need transaction boundaries for multi-step writes that must succeed or fail together.
- N+1 patterns show up when listing notes/users/comments and fetching related rows inside a map or loop. Recommend joins, batched queries, or preloading.
- Pagination needs deterministic ordering, bounds on page size, and protection against negative offsets or huge limits.
- Date handling should avoid locale string comparisons, implicit timezone parsing, and sorting formatted strings instead of timestamps.
- File upload/download routes must validate path joins, reject traversal, enforce content type/size, and avoid echoing filesystem errors to users.
- Public GitHub PR input should be parsed narrowly. Avoid accepting arbitrary hosts, path-like owner/repo values, or URLs that can become SSRF targets.
- UI fixes are lower priority than backend correctness unless the UI lies about success, loses user data, or blocks the required end-to-end flow.

Evidence standards for findings:
- Report a security issue only when the diff shows a data/control path from untrusted input to a sensitive sink or removes an existing protection.
- Report a correctness issue when the changed code can fail under a concrete condition: empty data, missing auth, duplicate records, failed network call, stale cache, concurrent request, or invalid parameter.
- Report a performance issue when the changed code adds repeated I/O, unbounded work, large prompt payloads, repeated renders, or polling without limits.
- Report code quality only when it affects maintainability enough to matter in a real PR: duplicated logic, unclear responsibility, unsafe types, fragile parsing, or hidden coupling.
- For every finding, explain why the changed code is risky, what can happen in production, and the smallest practical fix.

Preferred fix patterns:
- Use parameterized SQL or ORM bind variables; never build query strings with user values.
- Validate request bodies and query params at the server boundary; reject unknown or invalid values early.
- Use allowlists for enum-like inputs such as sort columns, directions, states, severities, labels, file statuses, and model names.
- Add transaction wrappers for multi-query writes and idempotency for retryable operations.
- Bound loops, pagination, chunk sizes, prompt sizes, polling intervals, retries, and parallelism.
- Return user-friendly errors while logging provider status, request IDs, and safe diagnostics on the server.
- Keep secrets in server-only environment variables and never log token prefixes, lengths, or raw auth headers.
- Prefer one durable GitHub comment marker per review so automation can detect whether the current head SHA was already reviewed.
- In streaming flows, do not mark success until the GitHub comment is actually posted; surface model and GitHub failures separately.
- In cache flows, show cache hit/miss, cached token count, total token count, cache age, and model name so evaluators can verify the requirement.

Hackathon-specific expectations:
- The product must review public GitHub PR URLs end to end and post a structured GitHub comment.
- Gemini context caching must be active and observable through cached token usage, logs, or a dashboard.
- Diffs above roughly 50K tokens should be chunked with a priority strategy.
- Streaming should keep the user informed while fetching metadata, processing diffs, calling the model, and posting the comment.
- Error states should be explicit and useful. For temporary model overload, retry with backoff and explain that the provider is out of capacity instead of surfacing raw provider JSON.
`;
}

function classifyFileRole(filename: string): string {
  const lower = filename.toLowerCase();
  if (/\/(api|routes?)\//.test(lower) || lower.endsWith('route.ts') || lower.endsWith('route.js'))
    return '⚠️ SERVER ENDPOINT — check auth, input validation, SQL safety';
  if (/\/(middleware)/.test(lower)) return '⚠️ MIDDLEWARE — check auth flow, header handling';
  if (/\/(actions?)\//.test(lower) || lower.includes('action'))
    return '⚠️ SERVER ACTION — check auth, CSRF, input validation';
  if (/\.(sql|prisma|drizzle)/.test(lower) || lower.includes('migration') || lower.includes('schema'))
    return '⚠️ DATABASE — check SQL injection, missing WHERE, transactions';
  if (/\/(auth|login|session|signup)/.test(lower)) return '⚠️ AUTH — check credential handling, session safety';
  if (/\/(lib|utils|helpers|services)\//.test(lower)) return 'SHARED LOGIC — check for unsafe assumptions';
  if (/\.(tsx|jsx)$/.test(lower) && !/\/(api|routes?)\//.test(lower)) return 'UI COMPONENT — check XSS, user input rendering';
  if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(lower)) return 'TEST FILE';
  if (/\.(json|yaml|yml|toml)$/.test(lower)) return 'CONFIG';
  return '';
}

/**
 * Construye el user prompt con contexto del PR y diff.
 */
export function buildUserPrompt(
  metadata: PRMetadata,
  files: DiffFile[],
  chunkInfo?: { chunkId: number; totalChunks: number },
  options?: { includeCachePrimer?: boolean }
): string {
  const cachePrimer = options?.includeCachePrimer ? `${buildCachePrimer()}\n\n---\n\n` : '';
  const chunkHeader = chunkInfo
    ? `\n⚠️ This is chunk ${chunkInfo.chunkId} of ${chunkInfo.totalChunks}. Focus on the files in this chunk.\n`
    : '';

  const filesSection = files
    .map((f) => {
      const role = classifyFileRole(f.filename);
      return [
        `### File: ${f.filename} [${f.status}] (+${f.additions}, -${f.deletions})${role ? ` — ${role}` : ''}`,
        '```diff',
        f.patch || '(binary file — no diff available)',
        '```',
      ].join('\n');
    })
    .join('\n\n');

  return `${cachePrimer}## Pull Request: "${metadata.title}"
**Author:** ${metadata.author}
**Branch:** ${metadata.headBranch} → ${metadata.baseBranch}
**Head SHA:** ${metadata.headSha}
**Changes:** ${metadata.filesChanged} files, +${metadata.additions} -${metadata.deletions}

**Description:**
${metadata.body || '(no description provided)'}
${chunkHeader}
## Changed Files

${filesSection}

## ANALYSIS INSTRUCTIONS
Use your thinking to deeply analyze the code before producing findings. For each file:
1. Identify what the code DOES (endpoint? component? utility?)
2. Trace ALL user-controlled data from entry to sink
3. Check EVERY database query for parameterization
4. Check EVERY endpoint for auth/authz
5. Check EVERY user-input render path for XSS
6. Check error handling completeness
7. Look for race conditions in concurrent operations

Be exhaustive. Missing a real SQL injection or XSS is worse than reporting a minor false positive. But do NOT invent issues — every finding must be grounded in the actual diff code shown above.`;
}

/**
 * Schema de respuesta para Gemini structured outputs.
 */
export function getReviewResponseSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      summary: {
        type: Type.STRING,
        description: 'A 2-3 sentence executive summary of the PR review findings',
      },
      overallRiskLevel: {
        type: Type.STRING,
        enum: ['critical', 'high', 'medium', 'low', 'clean'],
        description: 'Overall risk level based on findings',
      },
      categories: {
        type: Type.OBJECT,
        properties: {
          bugs: { type: Type.ARRAY, items: getFindingSchema() },
          security: { type: Type.ARRAY, items: getFindingSchema() },
          performance: { type: Type.ARRAY, items: getFindingSchema() },
          codeQuality: { type: Type.ARRAY, items: getFindingSchema() },
          suggestions: { type: Type.ARRAY, items: getFindingSchema() },
        },
        required: ['bugs', 'security', 'performance', 'codeQuality', 'suggestions'],
      },
      positiveAspects: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of positive aspects of the code',
      },
    },
    required: ['summary', 'overallRiskLevel', 'categories', 'positiveAspects'],
  };
}

function getFindingSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: 'Short descriptive title of the finding' },
      severity: { type: Type.STRING, enum: ['critical', 'high', 'medium', 'low', 'info'] },
      file: { type: Type.STRING, description: 'File path where the issue was found' },
      lineRange: { type: Type.STRING, description: 'Line range, e.g. "L15-L23"' },
      description: { type: Type.STRING, description: 'Detailed explanation: what the bug is, the data flow from source to sink, and why it is dangerous' },
      impact: { type: Type.STRING, description: 'What happens if this issue is exploited or triggered in production — concrete scenario, not generic risk' },
      suggestion: { type: Type.STRING, description: 'Concrete fix with actual code showing exactly what to change. Include before/after when possible.' },
      cweId: { type: Type.STRING, description: 'CWE ID for security issues, e.g. "CWE-89" for SQL injection, "CWE-79" for XSS' },
    },
    required: ['title', 'severity', 'file', 'description', 'impact', 'suggestion'],
  };
}

/**
 * Formatea el ReviewResult como Markdown para postear en GitHub.
 */
export function formatReviewAsMarkdown(review: ReviewResult): string {
  const riskEmoji: Record<string, string> = {
    critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', clean: '✅',
  };
  const sevEmoji: Record<string, string> = {
    critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: 'ℹ️',
  };

  const marker =
    review.metadata.reviewedHeadSha && review.metadata.sourcePrUrl
      ? buildReviewMarker({
          headSha: review.metadata.reviewedHeadSha,
          prUrl: review.metadata.sourcePrUrl,
          model: review.metadata.modelUsed,
        }) + '\n'
      : '';

  let md = marker + `# 🤖 PR Sentinel — Automated Code Review\n\n`;
  md += `## ${riskEmoji[review.overallRiskLevel] ?? '❓'} Overall Risk: **${review.overallRiskLevel.toUpperCase()}**\n\n`;
  md += `${review.summary}\n\n`;

  // Cache metadata
  md += `<details>\n<summary>📊 Analysis Metadata</summary>\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Model | ${review.metadata.modelUsed} |\n`;
  md += `| Cache Hit | ${review.metadata.cacheHit ? '✅ Yes' : '❌ No'} |\n`;
  md += `| Cached Tokens | ${review.metadata.cachedTokens.toLocaleString()} |\n`;
  md += `| Total Tokens | ${review.metadata.totalTokens.toLocaleString()} |\n`;
  md += `| Processing Time | ${review.metadata.processingTimeMs}ms |\n`;
  md += `| Chunks Processed | ${review.metadata.chunksProcessed} |\n`;
  if (review.metadata.reviewedHeadSha) {
    md += `| Reviewed Head SHA | \`${review.metadata.reviewedHeadSha.slice(0, 12)}\` |\n`;
  }
  md += `\n</details>\n\n---\n\n`;

  const categories = [
    { title: '🔒 Security Issues', items: review.categories.security },
    { title: '🐛 Bugs & Correctness', items: review.categories.bugs },
    { title: '⚡ Performance', items: review.categories.performance },
    { title: '🧹 Code Quality', items: review.categories.codeQuality },
    { title: '💡 Suggestions', items: review.categories.suggestions },
  ];

  for (const cat of categories) {
    if (cat.items.length === 0) continue;
    md += `### ${cat.title}\n\n`;
    for (const f of cat.items) {
      md += `#### ${sevEmoji[f.severity] ?? '❓'} [${f.severity.toUpperCase()}] ${f.title}\n`;
      md += `📄 \`${f.file}\``;
      if (f.lineRange) md += ` (${f.lineRange})`;
      if (f.cweId) md += ` | 🏷️ ${f.cweId}`;
      md += `\n\n${f.description}\n\n`;
      if (f.impact) md += `> **⚠️ Impact:** ${f.impact}\n\n`;
      md += `**Suggested fix:**\n${f.suggestion}\n\n---\n\n`;
    }
  }

  if (review.positiveAspects.length > 0) {
    md += `### ✨ Positive Aspects\n\n`;
    for (const a of review.positiveAspects) md += `- ${a}\n`;
    md += '\n';
  }

  const totalFindings =
    review.categories.security.length +
    review.categories.bugs.length +
    review.categories.performance.length +
    review.categories.codeQuality.length +
    review.categories.suggestions.length;

  md += `\n---\n`;
  md += `📊 **Summary:** ${totalFindings} finding(s) | `;
  md += `🔒 ${review.categories.security.length} security | `;
  md += `🐛 ${review.categories.bugs.length} bugs | `;
  md += `⚡ ${review.categories.performance.length} perf | `;
  md += `🧹 ${review.categories.codeQuality.length} quality | `;
  md += `💡 ${review.categories.suggestions.length} suggestions\n\n`;
  md += `*Generated by PR Sentinel — AI-powered code review using ${review.metadata.modelUsed}*`;
  return md;
}
