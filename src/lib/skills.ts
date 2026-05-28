// ============================================================
// SKILLS.TS — Catálogo modular de skills de revisión
// Cada skill aporta un fragmento al system prompt y al rubric.
// El usuario activa/desactiva skills; el prompt se compone dinámicamente.
// ============================================================

export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultEnabled: boolean;
  /** Fragmento inyectado en el system prompt (qué buscar). */
  promptFragment: string;
  /** Fragmento inyectado en el cache primer / rubric (cómo calibrar). */
  rubricFragment: string;
}

export const SKILLS: Skill[] = [
  {
    id: 'security',
    name: 'Security',
    description: 'SQL injection, XSS, CSRF, auth bypass, secrets, path traversal.',
    icon: '🔒',
    defaultEnabled: true,
    promptFragment: `### 🔴 SECURITY ISSUES (Critical)
- **SQL Injection**: string interpolation/concatenation in SQL (template literals, +, .concat). Look for: WHERE, ORDER BY, LIKE, LIMIT, INSERT VALUES, column names built from user input. Check that EVERY query parameter uses ? placeholders or parameterized queries.
- **XSS**: user data rendered as HTML without escaping. Look for: dangerouslySetInnerHTML, innerHTML, document.write, React raw HTML, template literal HTML, markdown rendering of user content.
- **CSRF**: state-changing endpoints (POST/PUT/DELETE) that rely only on cookies for auth without CSRF token, SameSite attribute, or origin check.
- **Auth/authz bypass**: endpoints that trust client-supplied IDs (userId, noteId, ownerId) without verifying ownership server-side. IDOR vulnerabilities.
- **Secrets exposure**: API keys, tokens, passwords, database URLs in code, logs, error messages, or NEXT_PUBLIC_ env vars.
- **Path traversal**: user input in file paths without sanitization (../../etc/passwd).
- **Missing input validation**: endpoints that accept and use request data without type checking, bounds checking, or allowlist validation.
- **Unsafe redirects**: redirect URLs built from user input without allowlist.`,
    rubricFragment: `Security checklist:
- Injection: SQL, shell, template, LDAP, NoSQL, path traversal, unsafe dynamic import, unsafe eval, unsafe deserialization.
- Web security: XSS through raw HTML, unsafe markdown rendering, missing output encoding, unsafe redirects, CSRF on state-changing routes, missing secure cookie flags, weak CORS, missing origin checks.
- Auth and authorization: endpoints that trust client-supplied user IDs, tenant IDs, repository names, roles, or branch names; missing permission checks before writes; confused-deputy flows; inadequate OAuth/PAT scope handling.
- Secrets: API keys, tokens, passwords, private keys, webhook secrets, database URLs, or signed URLs committed or logged. Never print secrets in suggestions.
- For security findings, ALWAYS include the CWE ID.`,
  },
  {
    id: 'bugs',
    name: 'Bugs & Correctness',
    description: 'Logic errors, race conditions, null crashes, error handling, data loss.',
    icon: '🐛',
    defaultEnabled: true,
    promptFragment: `### 🟠 BUGS & CORRECTNESS (High)
- Logic errors, off-by-one, inverted conditions, missing edge cases (empty arrays, null values, zero, negative numbers)
- Race conditions: concurrent requests modifying shared state without locks or transactions
- Null/undefined crashes: accessing properties on potentially null values without guards
- Missing error handling: empty catch blocks, unhandled promise rejections, swallowed errors
- Data loss: UPDATE/DELETE without WHERE, missing transaction boundaries for multi-step operations
- Broken pagination: missing ORDER BY, negative offsets, unbounded page sizes
- Stale closures in React: useEffect/useCallback with missing dependencies`,
    rubricFragment: `Correctness checklist:
- Null and undefined access, empty arrays, missing pagination, off-by-one errors, timezone bugs, stale cache reads, partial writes, broken retry behavior, swallowed errors, race conditions, non-idempotent retries, and optimistic UI that lies about server state.
- For database code, check migrations, missing WHERE clauses, transaction boundaries, unique constraints, isolation assumptions, and index usage.
- Report a correctness issue when the changed code can fail under a concrete condition: empty data, missing auth, duplicate records, failed network call, stale cache, concurrent request, or invalid parameter.`,
  },
  {
    id: 'performance',
    name: 'Performance',
    description: 'N+1 queries, memory leaks, unnecessary re-renders, blocking I/O.',
    icon: '⚡',
    defaultEnabled: true,
    promptFragment: `### 🟡 PERFORMANCE (Medium)
- N+1 queries: database/API calls inside loops or .map(). Recommend joins or batched queries.
- Missing indexes on frequently queried columns
- Memory leaks: event listeners not cleaned up, growing arrays/maps without bounds
- Unnecessary re-renders: inline object/function props, missing useMemo/useCallback
- Sequential awaits where Promise.all would be safe
- Blocking I/O in async contexts`,
    rubricFragment: `Performance checklist:
- N+1 API/database calls, sequential awaits where safe concurrency is possible, repeated parsing of large payloads, unbounded memory growth while streaming, huge DOM rendering, and polling loops without backoff.
- Report a performance issue when the changed code adds repeated I/O, unbounded work, large payloads, repeated renders, or polling without limits.`,
  },
  {
    id: 'best-practices',
    name: 'Best Practices',
    description: 'Code smells, DRY violations, naming, TypeScript type safety.',
    icon: '🧹',
    defaultEnabled: true,
    promptFragment: `### 🔵 CODE QUALITY (Lower)
- Code smells, functions >40 lines doing multiple things
- DRY violations: duplicated logic that should be extracted
- Confusing naming, misleading variable names
- TypeScript 'any' usage, missing type safety`,
    rubricFragment: `Review quality rules:
- Report code quality only when it affects maintainability enough to matter in a real PR: duplicated logic, unclear responsibility, unsafe types, fragile parsing, or hidden coupling.
- Use allowlists for enum-like inputs such as sort columns, directions, states, severities, labels, file statuses, and model names.`,
  },
  {
    id: 'accessibility',
    name: 'Accessibility',
    description: 'ARIA, keyboard nav, semantic HTML, contrast, screen-reader support.',
    icon: '♿',
    defaultEnabled: true,
    promptFragment: `### ♿ ACCESSIBILITY (a11y)
- Missing or incorrect ARIA roles/labels on interactive elements
- Non-semantic HTML where semantic elements exist (div onClick instead of button)
- Keyboard navigation: interactive elements not focusable, missing focus management, no visible focus ring
- Images/icons without alt text or aria-hidden
- Form inputs without associated labels
- Color used as the only signal (no text/icon backup)
- Insufficient color contrast on text vs background`,
    rubricFragment: `Accessibility checklist:
- Interactive controls must be real buttons/links or have correct role + keyboard handlers + focus management.
- Every input needs a programmatic label. Icons that convey meaning need accessible names; decorative ones need aria-hidden.
- Do not rely on color alone to convey state. Flag contrast risks on new text/background pairs.
- a11y findings are usually medium/low unless they fully block a core flow for assistive-tech users.`,
  },
  {
    id: 'testing',
    name: 'Testing',
    description: 'Missing coverage, untested edge cases, brittle or missing assertions.',
    icon: '🧪',
    defaultEnabled: true,
    promptFragment: `### 🧪 TESTING
- New logic (especially branches, error paths, auth checks) added without corresponding tests
- Edge cases left untested: empty input, null, boundary values, failure paths
- Tests that assert nothing meaningful, or only the happy path
- Brittle tests coupled to implementation detail instead of behavior
- Missing regression test for a bug the PR claims to fix`,
    rubricFragment: `Testing checklist:
- When the diff adds non-trivial logic or fixes a bug, expect a test that exercises it, including the failure/edge path.
- Flag assertions that cannot fail, snapshot-only tests for logic, and happy-path-only coverage of security/auth code.
- Testing findings are suggestions/low unless untested code is security- or data-critical.`,
  },
];

const SKILL_BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));

export function getSkillById(id: string): Skill | undefined {
  return SKILL_BY_ID.get(id);
}

/**
 * Resuelve la lista de skills activos. Si no se pasan IDs (undefined),
 * usa los marcados como defaultEnabled. IDs desconocidos se ignoran.
 * El resultado preserva el orden del catálogo para estabilidad de cache.
 */
export function resolveActiveSkills(ids?: string[]): Skill[] {
  if (!ids) {
    return SKILLS.filter((skill) => skill.defaultEnabled);
  }
  const requested = new Set(ids);
  const resolved = SKILLS.filter((skill) => requested.has(skill.id));
  // Si quedó vacío tras filtrar IDs inválidos, caer a los default.
  return resolved.length > 0 ? resolved : SKILLS.filter((skill) => skill.defaultEnabled);
}

/**
 * Clave estable que identifica una combinación de skills, para cache.
 * Independiente del orden de entrada porque ordenamos los IDs.
 */
export function skillsCacheKey(skills: Skill[]): string {
  return skills.map((skill) => skill.id).sort().join('+') || 'none';
}
