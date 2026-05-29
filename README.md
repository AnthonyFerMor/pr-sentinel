# PR Sentinel — AI Code Review for GitHub PRs

> Paste a GitHub Pull Request URL. PR Sentinel reads the diff and posts a review — security findings, bugs, code quality notes, and suggested fixes — as inline comments directly on the PR.

**App:** [pr-sentinel-sigma.vercel.app](https://pr-sentinel-sigma.vercel.app)  
**Live demo (no signup):** [/demo](https://pr-sentinel-sigma.vercel.app/demo)

Built for IQ Source Hackathon 2026.

---

## What it does

1. You paste a GitHub PR URL (or enable auto-review on a repo)
2. PR Sentinel fetches the diff and sends it to Gemini
3. Findings are posted as **inline review comments** on the exact lines that have issues
4. Each finding includes: severity, category, description, impact, and a suggested fix
5. When the fix is mechanical, a **GitHub suggestion block** is included so the reviewer can apply it in one click

### Review categories (9 skills)

| Skill | What it catches |
|-------|----------------|
| 🔒 Security | SQL injection, IDOR, XSS, secrets in code, OWASP issues |
| 🐛 Bugs | Logic errors, null dereferences, race conditions |
| ⚡ Performance | N+1 queries, missing indexes, blocking I/O |
| ✅ Best practices | DRY violations, missing types, naming |
| ♿ Accessibility | Missing ARIA labels, keyboard navigation |
| 🧪 Testing | Untested branches, missing assertions |
| 📦 Dependencies | Outdated or vulnerable packages |
| 🗄️ Migrations | Backwards-incompatible DB changes |
| 🔌 API contracts | Breaking changes in public APIs |

### Risk score

Every PR gets a risk score from 0 to 100, calculated from the severity and category of findings plus the PR size. Shown as a badge: Safe → Review → Risky → Blocked.

### Auto-bot

Enable auto-review on any repo from the **Auto-bot** page. PR Sentinel installs a webhook and reviews every PR automatically when it's opened or updated. Uses your GitHub PAT for the webhook and your Gemini key for the AI.

### Conversational replies

Mention `@pr-sentinel` in a PR comment and it replies in context, answering questions about its own findings or the diff.

---

## Architecture

```
User browser
  ├── / (landing or review form, depends on auth state)
  ├── /demo — public, no login, pre-baked review example
  ├── /dashboard — per-user stats (reviews, findings, time saved)
  ├── /repositories — auto-bot management
  └── /settings — Gemini key + GitHub PAT + review preferences

API
  ├── /api/review — POST → SSE stream of review progress + result
  ├── /api/settings — GET/POST per-user config from Upstash KV
  ├── /api/stats — aggregated review statistics
  ├── /api/github/repos — list user's GitHub repos
  ├── /api/repos/enable|disable — create/delete GitHub webhooks
  └── /api/webhooks/github — receives pull_request, issue_comment,
                             pull_request_review_comment events

Storage
  ├── Upstash Redis (Vercel KV) — encrypted user configs, review stats
  └── NextAuth JWT cookie — GitHub session token

AI pipeline (src/lib/)
  ├── parser.ts — parse GitHub PR URL
  ├── github.ts — fetch diff, post inline review, post comments
  ├── gemini.ts — call Gemini with explicit context caching
  ├── prompt.ts — build system prompt + per-finding formatters
  ├── patch-lines.ts — validate Gemini's line numbers against the real diff
  ├── risk-score.ts — weighted 0-100 score
  ├── run-review.ts — orchestrate the full review pipeline
  └── conversational.ts — generate replies to @pr-sentinel mentions
```

### Key decisions

| Decision | Why |
|----------|-----|
| Per-user Gemini key (BYOK) | No shared quota → no server cost. Key encrypted AES-256-GCM before storage. |
| GitHub OAuth token for reading | Users already have one from sign-in. No extra token needed just to read diffs. |
| GitHub PAT for auto-bot | OAuth tokens can expire. Webhooks need a stable credential. PAT is optional — only for auto-bot. |
| SSE (Server-Sent Events) | Real-time streaming without WebSockets. Works on Vercel serverless. |
| Inline review comments (GitHub Reviews API) | Comments land on the exact diff line, not at the bottom of the PR. |
| Upstash Redis for config | The webhook handler runs server-side with no user cookie. KV is the only way to look up per-user credentials. |
| Priority-based file chunking | Source code reviewed first, generated/lock/binary files skipped. Keeps token use focused. |
| Gemini context caching | The stable ~4K-token review rubric is sent as a fixed request **prefix** so Gemini's **implicit caching** can reuse it across reviews. `cachedContentTokenCount` is surfaced in logs, the PR comment, and `/api/cache/stats`. We deliberately use implicit (not explicit `caches.create`): the **free tier caps explicit cache storage at 0 tokens** (`limit=0`), so explicit caching 429s on free keys. An explicit-cache path exists behind `GEMINI_EXPLICIT_CACHE=true` for paid keys. |

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/<you>/pr-sentinel
cd pr-sentinel
npm install
```

### 2. Environment variables

Create `.env.local`:

```env
# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random 32+ char string>

# GitHub OAuth App (create at github.com/settings/developers)
GITHUB_CLIENT_ID=<your client id>
GITHUB_CLIENT_SECRET=<your client secret>

# Webhook secret (used to verify GitHub webhook payloads)
GITHUB_WEBHOOK_SECRET=<random string>

# Optional: Vercel KV / Upstash Redis (for stats + auto-bot)
KV_REST_API_URL=<upstash url>
KV_REST_API_TOKEN=<upstash token>
```

Each user provides their own Gemini key at `/settings`. There is no server-side Gemini key.

### 3. GitHub OAuth App

- Homepage URL: `http://localhost:3000`
- Callback URL: `http://localhost:3000/api/auth/callback/github`

### 4. Run locally

```bash
npm run dev
```

### 5. Deploy to Vercel

```bash
npx vercel deploy --prod
```

Set all env vars in the Vercel dashboard. For the OAuth App, update the URLs to your production domain.

---

## Project structure

```
src/
  app/
    page.tsx          — landing (unauthenticated) or review form (authenticated)
    demo/page.tsx     — public demo with pre-baked findings
    dashboard/page.tsx
    repositories/page.tsx
    settings/page.tsx
    login/page.tsx
    api/
      review/route.ts
      settings/route.ts
      stats/route.ts
      webhooks/github/route.ts
      repos/enable|disable|status/route.ts
      github/repos|pulls|comment/route.ts
  components/
    Header.tsx
    ReviewForm.tsx
    ReviewStream.tsx
    SkillSelector.tsx
    OnboardingBanner.tsx
    Aurora.tsx / Logo.tsx
  lib/
    auth.ts, github.ts, gemini.ts, prompt.ts
    run-review.ts, patch-lines.ts, risk-score.ts
    conversational.ts, review-diff.ts
    storage.ts, session.ts, parser.ts, types.ts
```

---

## Cost

Everything runs on free tiers:
- Gemini API: each user brings their own key (free tier: 1,500 req/day)
- Vercel: Hobby (free)
- Upstash Redis: free tier (10,000 req/day)
- GitHub: OAuth app + PAT (free)

---

## Verifying context caching

Three independent surfaces report `cachedContentTokenCount` from Gemini:

- **PR comment metadata table** — every posted review includes `Model | Cache Hit | Cached Tokens | Total Tokens`.
- **Runtime logs** — every Gemini stream chunk logs `Gemini usage - Model: X, Cached: N, Total: M, Hit: true|false`. Visible in `vercel logs`.
- **Live endpoint** — `GET /api/cache/stats` returns `cacheMode`, `cacheHitCount`, `cacheMissCount`, and `lastUsage`.

Honest free-tier note: implicit hits depend on consecutive requests using the **same model** within the implicit-cache window. `gemini-3.5-flash` rate-limits aggressively on the free tier, which causes the request to fall back to `gemini-2.5-flash` — a different model = no implicit reuse. The caching machinery is correct; the hit ratio in production is bounded by free-tier rate limits, not by the implementation.

## Limitations

- Review quality depends on Gemini's output — treat findings as a second opinion, not ground truth
- Very large PRs (>50K tokens) are chunked; some context between files may be lost
- Auto-bot requires a GitHub PAT with **webhook + repo** permissions (classic `repo` scope, or fine-grained with **Webhooks: Read & write**)
- Inline comments require the PR to be a proper diff (not a force-push that squashed history)
- Explicit context caches (`caches.create`) are unavailable on the Gemini free tier (`TotalCachedContentStorageTokensPerModelFreeTier limit=0`); the explicit-cache path is feature-flagged for paid keys
- This is a hackathon project built in a few days. There will be edge cases.

---

## License

MIT
