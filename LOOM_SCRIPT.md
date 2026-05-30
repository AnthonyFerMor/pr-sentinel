# PR Sentinel — Loom guide (3–5 min)

Goal: ~4 min. Talk to **decisions and trade-offs**, not a feature tour. Speak to
the rubric: review quality, technical implementation, and honesty.

---

## Before you hit record (pre-flight)

Have these tabs open, logged in, in this order:
1. **GitHub PR #3** of `pr-sentinel-test` — already has the auto-bot's **inline**
   comments (command injection, missing auth, error handling). This is your money shot.
2. **`pr-sentinel-sigma.vercel.app`** (the app, logged in) on the Review page.
3. **`/demo`** in a tab (public, no-login).
4. **`/dashboard`** in a tab (shows findings-by-severity + cache-hit rate).
5. A terminal with `vercel logs pr-sentinel-sigma.vercel.app` ready (to show a
   real `Gemini usage - Model: gemini-3.5-flash` log line if asked).
6. Editor open to `src/lib/skills.ts` and `src/lib/run-review.ts`.

Tips: zoom the browser to ~110%, hide bookmarks bar, close noisy tabs. Toggle the
new **light/dark** switch once on camera — it's a nice 2-second polish beat.

---

## 0:00 — Hook + the money shot (40s)
- "PR Sentinel reviews a GitHub PR with Gemini and posts findings as **inline
  comments on the exact lines** — security, bugs, performance, with one-click fixes."
- Show **PR #3**: scroll the inline comments. "This one was posted **automatically**
  by the webhook auto-bot the moment the PR opened — it caught a command injection,
  a missing-auth check, and weak error handling, each anchored to its line."
- "Same engine runs whether you paste a URL or let the auto-bot watch a repo."

## 0:40 — Architecture (45s)
- Next.js on Vercel. One core, `run-review.ts`, shared by **two entry points**: the
  SSE manual flow (`/api/review`) and the webhook auto-bot (`/api/webhooks/github`).
  "I refused to fork the logic — the auto-bot is exactly as thorough as the manual run."
- Auth: **GitHub OAuth** to read diffs (users already have it); a separate **PAT** only
  for the auto-bot, because webhooks need a durable credential. Nothing hardcoded.
- **BYOK Gemini**: each user's key, AES-256-GCM encrypted in Upstash KV. No shared quota.

## 1:25 — Prompt design (60s) — open skills.ts
- **Modular skills**: security, bugs, performance, deps, migrations, API-contract.
  Each contributes a prompt fragment + a rubric fragment, composed per request.
- **Structured output** via Gemini `responseSchema` → parsed straight into sections.
- **Severity calibration + evidence standards** live in the cached rubric: a finding
  needs a real input→sink path in the diff, an impact, and a concrete fix.
- The honest bit: "I benchmarked against competitors and tightened the prompt where
  it was noisy or wrong — e.g. it no longer flags `new URL(req.url)`, doesn't raise
  CSRF on endpoints with no auth, and it now catches **stored / server-side XSS**
  even when the SQL read is parameterized (SQL-safety ≠ XSS-safety)."

## 2:25 — Caching, honestly (40s) — open /dashboard + terminal
- "The stable ~4K-token rubric is the request **prefix** so Gemini's implicit caching
  can reuse it; you can verify `cachedContentTokenCount` in the logs, the PR comment,
  and `/api/cache/stats`."
- "Honest trade-off: I tried **explicit** `caches.create` — the **free tier caps it at
  zero** (`limit=0`, 429), so explicit caching is impossible on a free key. The path
  exists behind a flag for paid keys. I'd rather show real free-tier behavior than a
  fake HIT badge." (Show the dashboard's Cache-Hit-Rate being honest.)

## 3:05 — Large PRs + edge cases (30s)
- Classify every file: skip binaries / lock files / generated; **prioritize** source
  and sensitive paths (api/auth/db). Chunk past 50K tokens, and a **never-fail budget**
  truncates a huge PR to its highest-priority slice so a serverless function always
  returns a real (partial) review instead of timing out.

## 3:35 — Polish + what I cut (25s)
- Quick light/dark toggle on camera. "Inline suggestions, risk score, a dashboard,
  a public demo, and a persisted light mode."
- Cut for time: cross-instance explicit-cache reuse via KV (built, dormant — free tier
  blocks explicit anyway). "I chose a solid, honest core over half-features."

---

## Numbers / facts to have ready
- Model: `gemini-3.5-flash` (fallback `gemini-2.5-flash`).
- Auto-bot posts inline on first review, then evolves one summary comment on re-pushes.
- Clean PRs get an explicit "No issues found — looks good to merge" review (never silent).
- Stack: Next.js (App Router) · Vercel · Upstash Redis · NextAuth · Gemini.

## Likely questions + crisp answers
- *"Is the auto-bot weaker than the manual flow?"* → No. Same `runReview` engine,
  same model, and it defaults to **full** depth + all skills. Only difference is it
  evolves one comment on repeated pushes instead of stacking.
- *"Why no cache hits?"* → Free-tier rate limits bounce 3.5→2.5 between calls, and
  explicit caching is `limit=0` on free. Machinery is correct; the ceiling is the tier.
- *"What if Gemini is down / rate-limited?"* → Retry with backoff, then fall back to
  `gemini-2.5-flash`; never posts a partial/garbled comment.
