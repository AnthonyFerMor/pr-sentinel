# PR Sentinel — Loom script (3–5 min)

Target: ~4 min. Talk to decisions and trade-offs, not a feature tour.

---

## 0:00 — Hook + live demo (45s)
- "PR Sentinel: paste a public GitHub PR URL, it reviews the diff with Gemini and posts findings as **inline comments on the exact lines**."
- Live: paste a Notesy PR URL → hit Review → show the **SSE stream** (status events: parsing, fetching diff, chunking, AI analysis) → open the PR → show inline comments with severity, CWE id, impact, and a one-click **suggestion block**.
- "End-to-end against a real PR — that's the floor; everything else is how."

## 0:45 — Architecture (45s)
- Next.js App Router on Vercel. Two entry points share one core (`run-review.ts`): the **SSE manual flow** (`/api/review`) and the **webhook auto-bot** (`/api/webhooks/github`).
- Auth: **GitHub OAuth** for reading diffs (users already have it on sign-in); a separate **PAT only for the auto-bot** because webhooks need a durable credential OAuth tokens can't guarantee.
- **BYOK Gemini**: each user brings their own key, encrypted AES-256-GCM in Upstash Redis. No shared server quota, no server cost, no shared-key exhaustion.

## 1:30 — Prompt design (60s)
- **Modular skills** (`skills.ts`): security, bugs, performance, deps, migrations, API-contract. Each contributes a prompt fragment + a rubric fragment, composed dynamically from the user's selection.
- **Structured output**: Gemini `responseSchema` (JSON) → parsed straight into sections. No regex over free text.
- **Severity calibration + evidence standards** in the cached rubric: a finding needs a real data/control path in the diff, an impact, and a concrete fix. "Fewer real findings beats a noisy review."
- **False-positive guardrails** (added after benchmarking vs. competitors): don't flag `new URL(req.url)` in Next route handlers; don't raise CSRF on endpoints with no auth at all; a non-awaited analytics call is "may be dropped," not "blocking." These cut the exact noise I saw competitors emit.

## 2:30 — Context caching, honestly (45s)
- The stable ~4K-token rubric is the **request prefix** so Gemini **implicit caching** can reuse it; `cachedContentTokenCount` shows in logs, the PR comment metadata, and `/api/cache/stats`.
- Honest constraint: I tried **explicit** `caches.create` — the **free tier caps explicit cache storage at 0 tokens** (`TotalCachedContentStorageTokensPerModelFreeTier limit=0` → 429). So explicit is impossible on free keys; the path exists behind a flag for paid keys. On free tier, hits also depend on the model not rate-limit-bouncing between calls.
- "I'd rather show you the real free-tier behavior than a fake HIT badge."

## 3:15 — Large PRs + edge cases (30s)
- Classify every file: skip binaries (no patch), lock files, generated/build/images; **prioritize** source + sensitive paths (api/auth/db) over config/docs.
- Chunk over 50K tokens; a **never-fail budget plan** truncates a huge PR to the highest-priority slice so a serverless function always returns a real (partial) review instead of timing out.

## 3:45 — What I cut for time (15s)
- Cross-instance explicit-cache reuse via KV (built, dormant — free tier blocks explicit anyway).
- Auto-bot is wired (webhook install + per-user credential lookup) but needs a webhook-scoped PAT to finish end-to-end.
- "Picked a solid, honest core over half-features."

---

### Numbers to have on screen
- Model: `gemini-3.5-flash` (fallback `gemini-2.5-flash`).
- `/api/cache/stats` open in a tab.
- A PR with a planted SQLi/XSS so the inline finding + suggestion is visible.
