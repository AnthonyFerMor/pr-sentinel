// ============================================================
// PROMPT.TS — System prompt y schema para el análisis de PRs
// ============================================================

import { Type } from '@google/genai';
import { PRMetadata, DiffFile, ReviewResult } from './types';
import { buildReviewMarker, MarkerFinding } from './review-marker';
import { Skill, resolveActiveSkills } from './skills';
import { calculateRiskScore, formatRiskScoreBlock } from './risk-score';

/**
 * Compact fingerprint of all findings — embedded in the review marker so a
 * later re-review can diff fixed/persisting/new without parsing markdown.
 */
function fingerprintFindings(review: ReviewResult): MarkerFinding[] {
  const all = [
    ...review.categories.security,
    ...review.categories.bugs,
    ...review.categories.performance,
    ...review.categories.codeQuality,
    ...review.categories.suggestions,
  ];
  return all.map((f) => ({
    file: f.file,
    title: f.title,
    severity: f.severity,
    ...(f.cweId ? { cweId: f.cweId } : {}),
  }));
}

/**
 * System prompt para el agente de revisión de PRs.
 * Diseñado para encontrar bugs REALES, no genéricos.
 *
 * Se compone de un núcleo estable (misión + método) más los fragmentos
 * de los skills activos. Si no se pasan skills, usa los default.
 */
export function buildSystemPrompt(skills?: Skill[]): string {
  const active = skills ?? resolveActiveSkills();
  const skillSections = active
    .map((skill) => skill.promptFragment)
    .join('\n\n');
  const skillNames = active.map((skill) => `${skill.icon} ${skill.name}`).join(', ');

  return `You are PR Sentinel, an expert senior code reviewer with 15+ years of experience in security, performance, and code quality. You review Pull Requests on GitHub.

## YOUR MISSION
Analyze the PR diff and produce a thorough, actionable code review. Find REAL issues, not generic advice. Every finding must reference specific code.

## ACTIVE REVIEW SKILLS
This review has the following skills enabled: ${skillNames || '(none)'}.
Focus your analysis on the categories these skills cover. Do not report findings outside the enabled skills' scope.

## ANALYSIS METHOD — DATA FLOW TRACING
For EVERY file in the diff, follow this rigorous process:

1. **Identify entry points**: route handlers, API endpoints, form handlers, event listeners, exported functions.
2. **Trace data flows**: for each entry point, track where user-controlled data (request body, query params, URL params, headers, cookies, form inputs, file uploads) travels through the code.
3. **Find sinks**: identify dangerous operations the data reaches — SQL queries, HTML rendering, file system access, shell commands, redirects, eval, deserialization, database writes.
4. **Check guards**: at each step, verify if the data is validated, sanitized, escaped, or parameterized BEFORE reaching the sink. If not, report it.
5. **Check authorization**: for every write operation (POST, PUT, DELETE, UPDATE, INSERT), verify that the handler checks WHO is making the request, not just WHAT is being requested.
6. **Check error boundaries**: trace what happens when each async operation fails — does the error propagate correctly? Is the user informed? Is state left consistent?

## WHAT TO LOOK FOR (only the enabled skills below)

${skillSections}

## RULES
1. Be specific — reference exact file and line range from the diff
2. Be actionable — provide a concrete code fix for EACH finding, showing exactly what to change
3. Don't invent issues — if code is good, say so. Quality > quantity.
4. Use 'critical' sparingly — only for exploitable security, data loss, or production outage
5. Acknowledge good code in positiveAspects — safe patterns, good validation, clean architecture
6. Consider the framework (Next.js App Router, React 19, etc.)
7. Stay within the enabled skills' scope — do not surface issues from disabled categories
8. For EACH finding, explain: what the bug IS, what HAPPENS if exploited/triggered, and HOW to fix it with code

Return structured JSON matching the provided schema. Do NOT wrap in markdown code blocks.`;
}

/**
 * Stable review rubric stored in Gemini context cache.
 * Keep this large and stable so cache hits are meaningful and verifiable.
 *
 * El núcleo es estable; los checklists provienen de los skills activos.
 * Para una misma combinación de skills, el primer es idéntico → cache hit.
 */
export function buildCachePrimer(skills?: Skill[]): string {
  const active = skills ?? resolveActiveSkills();
  const skillChecklists = active
    .map((skill) => skill.rubricFragment)
    .join('\n\n');

  return `PR SENTINEL REUSABLE REVIEW RUBRIC

This cached primer is policy and review methodology, not code under review. Use it silently to guide every Pull Request review. Do not mention the primer or quote it in the final answer.

Severity calibration:
- critical: exploitable security issue, credential exposure, data loss, remote code execution, auth bypass, or a change likely to take production down.
- high: likely correctness bug, broken authorization, unhandled failure path, race condition, broken migration, or serious data integrity problem.
- medium: performance degradation, missing validation with limited blast radius, N+1 query, avoidable expensive work, or maintainability problem that can create bugs soon.
- low: minor maintainability, readability, small type-safety improvements, or optional hardening.
- info: useful observation that should not block merge.

ENABLED SKILL CHECKLISTS (only review what these cover):

${skillChecklists}

Cross-cutting notes:
- In Next.js App Router, check server/client boundaries, route handler request parsing, streaming behavior, runtime choice, max duration, dynamic data caching, and environment variable visibility. Server secrets must never use NEXT_PUBLIC_ prefixes.
- In React, check stale closures, missing dependencies, controlled input edge cases, duplicate keys, invalid nesting, hydration mismatches, and state that can update after cancellation.
- GitHub integration: treat public PR URLs as untrusted input.

Review quality rules:
- Findings must be grounded in the diff. Avoid generic advice, style preferences, and imaginary surrounding code.
- Each finding needs a concrete file, line range when available, impact, and a practical fix. If exact line numbers are unavailable from the patch, give the most specific hunk/file reference possible.
- Do not inflate severity. A review with fewer real findings is better than a noisy review.
- Mention positive aspects when they are specific: good validation, clean separation, safe auth boundary, useful tests, robust streaming, clear error states.
- For suggestions, prefer small patches that fit the existing architecture. Avoid recommending new frameworks, broad rewrites, or expensive infrastructure unless the issue truly requires it.

False-positive guardrails (do NOT report these as issues):
- new URL(req.url) and req.nextUrl are both valid, idiomatic ways to read query params in Next.js route handlers. Do not flag either as fragile, unreliable, or a bug.
- Do not raise CSRF on an endpoint that has no authentication at all. With no cookie/session, there is no session to forge — the accurate finding (if writes should be protected) is missing authentication/authorization, not CSRF. Only raise CSRF when the diff shows cookie/session-based auth on a state-changing route without an origin check, token, or SameSite-safe design.
- A fire-and-forget async call (a Promise that is not awaited) is NOT a "blocking" or "latency" issue. If a tracking/analytics call is not awaited, the accurate risk is that it may be dropped before completing in a short-lived/serverless runtime — never recommend adding await to "reduce latency", and never describe a non-awaited call as blocking.
- Do not invent surrounding code, imaginary auth systems, config, or framework behavior that is not shown in the diff.

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
/**
 * Anota cada línea del patch con su número real en el archivo nuevo,
 * parseando los hunk headers (@@ -a,b +c,d @@). Así el modelo puede dar
 * un lineRange preciso que GitHub pueda anclar a la línea correcta.
 * Las líneas eliminadas no tienen número en el lado nuevo.
 */
function annotatePatch(patch: string): string {
  if (!patch) return patch;
  const pad = (n: number) => String(n).padStart(5);
  const lines = patch.split('\n');
  let newLine = 0;
  const out: string[] = [];

  for (const line of lines) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = parseInt(hunk[1], 10);
      out.push(`     | ${line}`);
      continue;
    }
    const marker = line[0];
    if (marker === '+') {
      out.push(`${pad(newLine)}|+${line.slice(1)}`);
      newLine += 1;
    } else if (marker === '-') {
      out.push(`     |-${line.slice(1)}`);
    } else if (marker === ' ') {
      out.push(`${pad(newLine)}| ${line.slice(1)}`);
      newLine += 1;
    } else {
      // "\ No newline at end of file" or empty trailing line
      out.push(`     | ${line}`);
    }
  }

  return out.join('\n');
}

/** Rol corto para el file map (sin la guía larga de classifyFileRole). */
function shortFileRole(filename: string): string {
  const full = classifyFileRole(filename);
  if (!full) return '';
  return full.split('—')[0].trim();
}

/** Índice de todos los archivos del PR, para dar contexto cross-file. */
function buildFileMap(allFiles: DiffFile[]): string {
  const rows = allFiles
    .map((f) => {
      const role = shortFileRole(f.filename);
      return `- \`${f.filename}\` [${f.status}] (+${f.additions}/-${f.deletions})${role ? ` — ${role}` : ''}`;
    })
    .join('\n');
  return `## PR File Map (all changed files)
Use this map to reason about cross-file interactions (a sink in one file fed by a source in another, shared state, an endpoint plus its client caller). You may only cite findings in files whose diff is shown below.

${rows}`;
}

export interface Hotspot {
  file: string;
  lineRange?: string;
  reason: string;
  category: string;
}

function buildFocusAreas(hotspots: Hotspot[]): string {
  const rows = hotspots
    .map(
      (h) =>
        `- \`${h.file}\`${h.lineRange ? ` (${h.lineRange})` : ''} — [${h.category}] ${h.reason}`
    )
    .join('\n');
  return `## FOCUS AREAS (from initial scan)
A fast first-pass scan flagged these spots as most likely to contain real issues. Investigate each one thoroughly and confirm or dismiss it with evidence from the diff. Do not limit yourself to these — but do not miss them.

${rows}`;
}

/**
 * Construye la sección de contexto del review anterior.
 * El modelo usa esto para: no re-reportar issues ya corregidos,
 * confirmar cuáles siguen presentes, y enfocarse en problemas nuevos.
 */
function buildPreviousReviewContext(previousBody: string): string {
  // Trim to avoid ballooning the prompt — keep the findings, drop the metadata table.
  const trimmed = previousBody
    .replace(/<!--[\s\S]*?-->/, '')          // strip hidden marker
    .replace(/<details>[\s\S]*?<\/details>/gi, '') // strip metadata table
    .trim()
    .slice(0, 6000);                          // hard cap to avoid token blowout

  return `
## Previous PR Sentinel Review (for context)
A previous automated review was posted on this PR. Use it to:
- Confirm which previously-reported issues are still present in the current diff.
- Identify issues that have been fixed since the last review and acknowledge the fix.
- Avoid duplicating findings that are already documented and still open — reference them briefly instead of repeating the full analysis.
- Focus your new findings on problems NOT covered by the previous review.

<previous-review>
${trimmed}
</previous-review>

`;
}

export function buildUserPrompt(
  metadata: PRMetadata,
  files: DiffFile[],
  chunkInfo?: { chunkId: number; totalChunks: number },
  options?: {
    includeCachePrimer?: boolean;
    skills?: Skill[];
    allFiles?: DiffFile[];
    focusAreas?: Hotspot[];
    previousReviewBody?: string;
  }
): string {
  const cachePrimer = options?.includeCachePrimer
    ? `${buildCachePrimer(options.skills)}\n\n---\n\n`
    : '';
  const chunkHeader = chunkInfo
    ? `\n⚠️ This is chunk ${chunkInfo.chunkId} of ${chunkInfo.totalChunks}. Focus on the files in this chunk.\n`
    : '';
  const fileMap = options?.allFiles && options.allFiles.length > 0
    ? `\n${buildFileMap(options.allFiles)}\n`
    : '';
  const focusAreas = options?.focusAreas && options.focusAreas.length > 0
    ? `\n${buildFocusAreas(options.focusAreas)}\n`
    : '';
  const previousReview = options?.previousReviewBody
    ? buildPreviousReviewContext(options.previousReviewBody)
    : '';

  const filesSection = files
    .map((f) => {
      const role = classifyFileRole(f.filename);
      return [
        `### File: ${f.filename} [${f.status}] (+${f.additions}, -${f.deletions})${role ? ` — ${role}` : ''}`,
        '```diff',
        f.patch ? annotatePatch(f.patch) : '(binary file — no diff available)',
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
${fileMap}${focusAreas}${previousReview}${chunkHeader}
## Changed Files (full diff for this ${chunkInfo ? 'chunk' : 'PR'})

${filesSection}

## READING THE DIFF — CRITICAL RULES
Each diff line is prefixed with \`<lineNumber>|<marker>\`:
- \`+\` (added) — this line EXISTS in the current code. Report bugs found here.
- \`-\` (removed) — this line was DELETED and NO LONGER EXISTS. NEVER report a bug on a \`-\` line; that code is gone.
- space (context) — unchanged line, exists in current code.
- \`|\` with no number prefix — hunk header, not real code.

When you report a finding:
- Set \`lineNumber\` (REQUIRED, integer) to the real new-file line number from the prefix — the line you want to anchor the inline review comment on. It MUST be an \`+\` or context line shown in the diff. For multi-line findings, use the LAST line.
- Optionally set \`startLine\` for multi-line findings (must be < lineNumber, also from the diff).
- Set \`lineRange\` as a display string (e.g. "L42" or "L42-L48") matching the numbers above.
- NEVER invent a line number. NEVER pick a number that doesn't appear in the diff. NEVER use a number from a \`-\` (deleted) line.

Auto-fix suggestions (highly preferred when applicable):
- Whenever the fix is a contiguous, mechanical edit of the lines from \`startLine\` (or \`lineNumber\` if single-line) up to \`lineNumber\`, populate \`replacementCode\` with the EXACT source text that should replace those lines.
- No backticks, no code fences, no "// before" or "// after" markers — just raw code, as it should appear in the file. Preserve indentation.
- Skip \`replacementCode\` when the fix needs new imports elsewhere, multiple non-contiguous edits, or a wider refactor. A wrong auto-fix is worse than no auto-fix.

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
 * Pase 1 (scout): prompt liviano que sólo localiza hotspots, sin análisis profundo.
 * Le damos el file map + diffs anotados y pedimos una lista corta de zonas a investigar.
 */
export function buildScoutPrompt(
  metadata: PRMetadata,
  files: DiffFile[],
  skills?: Skill[]
): string {
  const active = skills ?? resolveActiveSkills();
  const skillNames = active.map((s) => `${s.icon} ${s.name}`).join(', ');
  const filesSection = files
    .map((f) => {
      const role = classifyFileRole(f.filename);
      return [
        `### File: ${f.filename} [${f.status}]${role ? ` — ${role}` : ''}`,
        '```diff',
        f.patch ? annotatePatch(f.patch) : '(binary file — no diff available)',
        '```',
      ].join('\n');
    })
    .join('\n\n');

  return `You are the FIRST-PASS triage scanner of PR Sentinel. Do NOT write a full review. Your only job is to quickly flag the spots most likely to contain real issues, so a deeper second pass can focus there.

Enabled skills (only flag things in scope): ${skillNames || '(none)'}.

## Pull Request: "${metadata.title}"
${metadata.body || '(no description provided)'}

## Changed Files (line numbers are real new-file lines)

${filesSection}

## TASK
Return a short list of hotspots — at most 12 — ranked by how likely they are to be a real problem. For each: the file, the line range (use the real line numbers shown), the suspected category, and a one-line reason. Be selective: only spots that genuinely warrant a closer look. Do NOT solve them here.

Return structured JSON matching the provided schema. Do NOT wrap in markdown code blocks.`;
}

export function getScoutResponseSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      hotspots: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            file: { type: Type.STRING, description: 'File path of the hotspot' },
            lineRange: { type: Type.STRING, description: 'Real line range, e.g. "L42-L48"' },
            category: {
              type: Type.STRING,
              description: 'Suspected category: security, bug, performance, quality, accessibility, testing',
            },
            reason: { type: Type.STRING, description: 'One-line reason this spot is suspicious' },
          },
          required: ['file', 'reason', 'category'],
        },
      },
    },
    required: ['hotspots'],
  };
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
      lineNumber: {
        type: Type.INTEGER,
        description:
          'REQUIRED. Real new-file line number where the finding is anchored. ' +
          'Use the EXACT number shown to the left of the `+` or context line in the annotated diff. ' +
          'This MUST be a line that appears in the diff (added or context line). ' +
          'For multi-line findings, this is the LAST line of the range.',
      },
      startLine: {
        type: Type.INTEGER,
        description:
          'Optional. First line of the range for multi-line findings. ' +
          'Must be < lineNumber. Omit for single-line findings.',
      },
      lineRange: { type: Type.STRING, description: 'Display string for the line range, e.g. "L15-L23" or "L42". Should match lineNumber/startLine.' },
      description: { type: Type.STRING, description: 'Detailed explanation: what the bug is, the data flow from source to sink, and why it is dangerous' },
      impact: { type: Type.STRING, description: 'What happens if this issue is exploited or triggered in production — concrete scenario, not generic risk' },
      suggestion: { type: Type.STRING, description: 'Concrete fix with actual code showing exactly what to change. Include before/after when possible.' },
      replacementCode: {
        type: Type.STRING,
        description:
          'Optional: the EXACT literal source code that should replace the range startLine..lineNumber, ' +
          'without backticks, without markdown fences, without "// before" or "// after" comments. ' +
          'Provide this ONLY when the fix is a mechanical, in-place replacement of a contiguous range. ' +
          'GitHub will render this as a one-click "Apply suggestion" button. ' +
          'Omit if the fix requires changes spanning more than the cited lines or new imports elsewhere.',
      },
      cweId: { type: Type.STRING, description: 'CWE ID for security issues, e.g. "CWE-89" for SQL injection, "CWE-79" for XSS' },
    },
    required: ['title', 'severity', 'file', 'lineNumber', 'description', 'impact', 'suggestion'],
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
          findings: fingerprintFindings(review),
        }) + '\n'
      : '';

  let md = marker + `# 🤖 PR Sentinel — Automated Code Review\n\n`;
  md += `## ${riskEmoji[review.overallRiskLevel] ?? '❓'} Overall Risk: **${review.overallRiskLevel.toUpperCase()}**\n\n`;

  // Risk score block (best-effort; never break the post if scoring throws).
  try {
    md += formatRiskScoreBlock(calculateRiskScore(review));
  } catch {}

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

  const noFindings =
    review.categories.security.length +
      review.categories.bugs.length +
      review.categories.performance.length +
      review.categories.codeQuality.length +
      review.categories.suggestions.length ===
    0;
  if (noFindings) {
    md += `✅ **No issues found.** PR Sentinel reviewed this diff across its active skills and did not find anything blocking. Looks good to merge.\n\n`;
  }

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

/**
 * Caveman-mode formatter.
 *
 * Ultra-compressed review output: one line per finding, no per-finding metadata table,
 * no verbose impact/suggestion sections. Cuts output token usage ~70% while keeping
 * the actionable signal (file, line, severity, problem, fix).
 *
 * Inspired by caveman-review skill. User opt-in via Settings.
 */
export function formatReviewAsCaveman(review: ReviewResult): string {
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
          findings: fingerprintFindings(review),
        }) + '\n'
      : '';

  // Tally findings by severity across all categories.
  const allFindings = [
    ...review.categories.security.map((f) => ({ ...f, cat: '🔒' as const })),
    ...review.categories.bugs.map((f) => ({ ...f, cat: '🐛' as const })),
    ...review.categories.performance.map((f) => ({ ...f, cat: '⚡' as const })),
    ...review.categories.codeQuality.map((f) => ({ ...f, cat: '🧹' as const })),
    ...review.categories.suggestions.map((f) => ({ ...f, cat: '💡' as const })),
  ];

  const sevCount = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of allFindings) sevCount[f.severity] += 1;
  const totals =
    `${sevCount.critical}🔴 ${sevCount.high}🟠 ${sevCount.medium}🟡 ${sevCount.low}🔵` +
    (sevCount.info ? ` ${sevCount.info}ℹ️` : '');

  let md = marker + `# 🤖 PR Sentinel — Caveman Mode\n\n`;
  md += `${riskEmoji[review.overallRiskLevel] ?? '❓'} **${review.overallRiskLevel.toUpperCase()}** | ${totals} | `;
  md += `${review.metadata.modelUsed} | cache:${review.metadata.cacheHit ? '✅' : '❌'} | `;
  md += `${review.metadata.totalTokens.toLocaleString()} tok | ${review.metadata.processingTimeMs}ms\n\n`;
  md += `${review.summary}\n\n`;

  if (allFindings.length > 0) {
    md += `## Findings\n\n`;
    for (const f of allFindings) {
      const loc = f.lineRange ? `\`${f.file}:${f.lineRange}\`` : `\`${f.file}\``;
      const cwe = f.cweId ? ` [${f.cweId}]` : '';
      // Collapse description to first sentence for caveman brevity.
      const shortDesc = f.description.split(/\.(?:\s|$)/)[0].trim();
      const fix = f.suggestion.split('\n')[0].trim();
      md += `- ${f.cat} ${loc} ${sevEmoji[f.severity] ?? '❓'} **${f.severity}**${cwe}: ${f.title}. ${shortDesc}. Fix: ${fix}\n`;
    }
    md += '\n';
  } else {
    md += `## Findings\n\nNo issues. ✅\n\n`;
  }

  if (review.positiveAspects.length > 0) {
    md += `## Positive\n\n`;
    for (const a of review.positiveAspects) md += `- ${a}\n`;
    md += '\n';
  }

  md += `---\n`;
  md += `totals: ${totals} | *PR Sentinel caveman mode (token-saving). Toggle in Settings to switch to full markdown.*`;
  return md;
}

/**
 * Picks the right formatter based on the user's preference. Default = full.
 */
export function formatReview(review: ReviewResult, style?: 'full' | 'lite' | 'caveman'): string {
  if (style === 'caveman') return formatReviewAsCaveman(review);
  // 'lite' currently uses same markdown but with fewer skills active (handled upstream).
  return formatReviewAsMarkdown(review);
}

// ──────────────────────────────────────────────────────────────
// Inline-mode formatters
//
// En modo inline, separamos el review en dos partes:
//   1. Cuerpo principal del review (summary + metadata + leftover findings
//      que no caen sobre líneas válidas del diff).
//   2. Comentarios inline (un comentario por finding válido, anclado a la
//      línea del diff).
//
// Si no hay leftover y no hay inline (review limpio), el cuerpo sigue
// llevando el resumen y la metadata para que la nota se vea bien aún en PRs
// sin findings.
// ──────────────────────────────────────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: 'ℹ️',
};
const CATEGORY_LABEL: Record<string, string> = {
  security: '🔒 Security',
  bugs: '🐛 Bug',
  performance: '⚡ Performance',
  codeQuality: '🧹 Code quality',
  suggestions: '💡 Suggestion',
};

/**
 * Sanea código de reemplazo antes de envolverlo en un suggestion block.
 * Quita fences markdown si el modelo los añadió por error, y normaliza
 * line endings.
 */
function cleanReplacement(code: string): string {
  let cleaned = code.replace(/\r\n/g, '\n');
  // Strip surrounding markdown code fence if present.
  const fenceMatch = cleaned.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) cleaned = fenceMatch[1];
  return cleaned.replace(/\n+$/, '');
}

/**
 * Formatea un finding como cuerpo de comentario inline (corto, accionable).
 * Pensado para verse bien en el panel de "Files changed" de GitHub.
 *
 * Si el finding incluye `replacementCode` y el comentario está anclado a un
 * rango contiguo, añadimos un bloque ```suggestion``` que GitHub renderiza con
 * botón "Apply suggestion" → el dev hace commit del fix con un click.
 */
export function formatInlineComment(
  finding: import('./types').ReviewFinding,
  category: string,
): string {
  const sev = SEVERITY_EMOJI[finding.severity] ?? '❓';
  const cat = CATEGORY_LABEL[category] ?? category;
  const cwe = finding.cweId ? ` · \`${finding.cweId}\`` : '';

  let body = `**${sev} ${cat} — ${finding.severity.toUpperCase()}: ${finding.title}**${cwe}\n\n`;
  body += `${finding.description}\n\n`;
  if (finding.impact) body += `> ⚠️ **Impact:** ${finding.impact}\n\n`;

  if (finding.replacementCode && finding.replacementCode.trim()) {
    const cleaned = cleanReplacement(finding.replacementCode);
    body += `**Suggested fix** (click _Apply suggestion_ to commit):\n\n`;
    body += '```suggestion\n' + cleaned + '\n```\n\n';
    // Show the prose explanation below for context.
    body += `<details><summary>Why this fix</summary>\n\n${finding.suggestion}\n\n</details>\n\n`;
  } else {
    body += `**Suggested fix:**\n\n${finding.suggestion}\n\n`;
  }

  body += `<sub>🤖 PR Sentinel</sub>`;
  return body;
}

/**
 * Cuerpo principal para un review inline: resumen + metadata + lista corta
 * de findings y, opcionalmente, los "leftover" findings que no pudieron
 * anclarse a una línea del diff. Esto garantiza que ningún hallazgo se pierda
 * aunque el modelo se equivoque con el número de línea.
 */
export function formatInlineReviewBody(
  review: ReviewResult,
  inlineCount: number,
  leftover: Array<{ finding: import('./types').ReviewFinding; category: string }>,
  prSize?: { additions?: number; deletions?: number; filesChanged?: number },
): string {
  const riskEmoji: Record<string, string> = {
    critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', clean: '✅',
  };
  const marker =
    review.metadata.reviewedHeadSha && review.metadata.sourcePrUrl
      ? buildReviewMarker({
          headSha: review.metadata.reviewedHeadSha,
          prUrl: review.metadata.sourcePrUrl,
          model: review.metadata.modelUsed,
          findings: fingerprintFindings(review),
        }) + '\n'
      : '';

  const totalFindings =
    review.categories.security.length +
    review.categories.bugs.length +
    review.categories.performance.length +
    review.categories.codeQuality.length +
    review.categories.suggestions.length;

  let md = marker + `# 🤖 PR Sentinel — Inline Code Review\n\n`;
  md += `## ${riskEmoji[review.overallRiskLevel] ?? '❓'} Overall Risk: **${review.overallRiskLevel.toUpperCase()}**\n\n`;

  // Risk score visual block (0-100 + breakdown).
  try {
    const risk = calculateRiskScore(review, prSize);
    md += formatRiskScoreBlock(risk);
  } catch {
    // Defensive — never let scoring break the post.
  }

  md += `${review.summary}\n\n`;
  if (totalFindings === 0) {
    md += `✅ **No issues found.** PR Sentinel reviewed this diff across its active skills (security, bugs, performance, and more) and did not find anything blocking. Looks good to merge.`;
  } else {
    md += `📍 **${inlineCount}** finding${inlineCount === 1 ? '' : 's'} posted as inline comments below.`;
    if (leftover.length > 0) {
      md += ` ${leftover.length} additional finding${leftover.length === 1 ? '' : 's'} listed here (no matching diff line).`;
    }
  }
  md += '\n\n';

  // Metadata
  md += `<details>\n<summary>📊 Analysis Metadata</summary>\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Model | ${review.metadata.modelUsed} |\n`;
  md += `| Cache Hit | ${review.metadata.cacheHit ? '✅ Yes' : '❌ No'} |\n`;
  md += `| Cached Tokens | ${review.metadata.cachedTokens.toLocaleString()} |\n`;
  md += `| Total Tokens | ${review.metadata.totalTokens.toLocaleString()} |\n`;
  md += `| Processing Time | ${review.metadata.processingTimeMs}ms |\n`;
  md += `| Findings | ${totalFindings} (${inlineCount} inline + ${leftover.length} general) |\n`;
  if (review.metadata.reviewedHeadSha) {
    md += `| Reviewed Head SHA | \`${review.metadata.reviewedHeadSha.slice(0, 12)}\` |\n`;
  }
  md += `\n</details>\n\n`;

  if (leftover.length > 0) {
    md += `---\n\n### Findings without an exact diff line\n\n`;
    md += `These findings reference code that doesn't map cleanly to a single line in this diff (e.g. cross-file concerns or unchanged context). Listed here so nothing is lost.\n\n`;
    for (const { finding, category } of leftover) {
      const sev = SEVERITY_EMOJI[finding.severity] ?? '❓';
      const cat = CATEGORY_LABEL[category] ?? category;
      const loc = finding.lineRange
        ? `\`${finding.file}\` (${finding.lineRange})`
        : `\`${finding.file}\``;
      md += `#### ${sev} ${cat} — ${finding.severity.toUpperCase()}: ${finding.title}\n`;
      md += `📄 ${loc}`;
      if (finding.cweId) md += ` · 🏷️ \`${finding.cweId}\``;
      md += `\n\n${finding.description}\n\n`;
      if (finding.impact) md += `> ⚠️ **Impact:** ${finding.impact}\n\n`;
      md += `**Suggested fix:**\n\n${finding.suggestion}\n\n---\n\n`;
    }
  }

  if (review.positiveAspects.length > 0) {
    md += `### ✨ Positive Aspects\n\n`;
    for (const a of review.positiveAspects) md += `- ${a}\n`;
    md += '\n';
  }

  md += `\n*Generated by PR Sentinel — AI-powered code review using ${review.metadata.modelUsed}*`;
  return md;
}
