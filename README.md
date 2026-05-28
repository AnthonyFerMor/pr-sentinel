# 🛡️ PR Sentinel — AI-Powered Code Review Agent

> Automated pull request reviews powered by **Gemini 3.5 Flash** with context caching, streaming, and intelligent diff analysis.

**Deploy (Vercel):** `https://<your-app>.vercel.app`  
**Repo (public):** `https://github.com/<you>/pr-sentinel`

---

## ✨ What It Does

Paste a **GitHub PR URL** → Get an **instant, thorough code review** that finds:

- 🔒 **Security vulnerabilities** — SQL injection, XSS, CSRF, exposed secrets
- 🐛 **Bugs & correctness issues** — logic errors, race conditions, null crashes
- ⚡ **Performance problems** — N+1 queries, memory leaks, blocking I/O
- 🧹 **Code quality issues** — code smells, DRY violations, missing types
- 💡 **Actionable suggestions** — concrete fixes with code examples

The review is **streamed in real-time** and **posted as a comment** on the PR itself.

---

## 🏗️ Architecture

```
┌─ GitHub OAuth
│  └─ User login → JWT session + GitHub token
├─ Next.js Frontend
│  ├─ Home: paste PR URL → manual review
│  ├─ Settings: manage Gemini API key (encrypted cookie)
│  └─ Lite mode toggle: ⚡ (security+bugs only) or 🔬 (all skills)
├─ /api/review (SSE stream)
│  └─ Per-user Gemini key + GitHub token
├─ GitHub Webhook (pull_request / issue_comment / pull_request_review_comment)
│  ├─ Auto-review on PR open/update
│  └─ Bot replies to @pr-sentinel mentions
└─ Review pipeline
   ├─ Fetch PR diff → Chunk if > 50K tokens
   ├─ Gemini 3.5 Flash with context caching
   ├─ 6 review skills: security, bugs, performance, code quality, accessibility, testing
   └─ Post comment + re-verification summary on re-review
```

### Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Next.js App Router** | Full-stack with auth + real-time |
| **NextAuth.js v5** | GitHub OAuth, JWT sessions, no DB needed |
| **Per-user credentials** | Gemini key in encrypted httpOnly cookie, GitHub token from OAuth |
| **SSE (Server-Sent Events)** | Real-time streaming without WebSocket |
| **Webhook events** | Auto-review + bot replies on PR events |
| **Lite mode** | 1024 token budget, 2 chunks max, security+bugs only |
| **Structured Outputs** | JSON schema = consistent review format |
| **Priority-based Chunking** | Source code first, skip binary/lock/generated |
| **`@google/genai` SDK** | Official SDK with context caching |

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| AI Model | Gemini 3.5 Flash via `@google/genai` |
| GitHub Integration | Octokit |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel (Hobby tier) |

---

## 🔧 Run Locally

### Prerequisites
- Node.js 18+
- npm
- A GitHub OAuth App (created locally or on GitHub)
- A [Gemini API key](https://ai.google.dev) (free tier, optional — can use server default or per-user)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/AnthonyFerMor/pr-sentinel.git
cd pr-sentinel

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# Edit .env.local (see table below)

# 4. Run the dev server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) → redirects to `/login` → click "Sign in with GitHub".

### Environment Variables

**Authentication (required for multi-user):**

| Variable | Where to Get |
|----------|-------------|
| `NEXTAUTH_SECRET` | Generate: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3001` (dev) or `https://<your-app>.vercel.app` (prod) |
| `GITHUB_CLIENT_ID` | GitHub → Settings → Developer Settings → OAuth Apps → Create New |
| `GITHUB_CLIENT_SECRET` | (same location as above) |

**Review & API (optional defaults, users can override in Settings):**

| Variable | Optional? | Default | Where to Get |
|----------|-----------|---------|-------------|
| `GEMINI_API_KEY` | ✅ Yes | None (users must set in Settings) | [ai.google.dev](https://ai.google.dev) |
| `GEMINI_MODEL` | ✅ Yes | `gemini-3.5-flash` | (leave as-is) |
| `GEMINI_FALLBACK_MODELS` | ✅ Yes | `gemini-2.5-flash` | (leave as-is) |
| `PR_SENTINEL_GITHUB_TOKEN` | ✅ Yes | None (OAuth token used instead) | Fine-grained PAT only if needed |

**Webhooks (optional):**

| Variable | Description |
|----------|-------------|
| `GITHUB_WEBHOOK_SECRET` | Generate: `openssl rand -base64 32`, set in GitHub repo webhook settings |
| `CRON_SECRET` | Generate: `openssl rand -base64 32`, set in Vercel Cron job |
| `CRON_REPOS` | Comma-separated `owner/repo` for scheduled reviews |

### GitHub OAuth App Setup (Local)

1. Go to **GitHub → Settings → Developer Settings → OAuth Apps → New OAuth App**
2. Fill in:
   - **Application name:** PR Sentinel
   - **Homepage URL:** `http://localhost:3001`
   - **Authorization callback URL:** `http://localhost:3001/api/auth/callback/github`
3. Copy **Client ID** and **Client Secret** into `.env.local`
4. Run `npm run dev` and login

---

## 🚀 Deploy (Vercel)

1. Push branch to GitHub (already done: `feat/phase-3-automation`)
2. Import repo into Vercel
3. Set Vercel Environment Variables:
   - `NEXTAUTH_SECRET` (generate locally)
   - `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` (from GitHub OAuth App)
   - `GEMINI_API_KEY` (fallback for webhook reviews; users set personal key in Settings)
   - `NEXTAUTH_URL` (your Vercel app URL, e.g., `https://pr-sentinel.vercel.app`)
4. Deploy
5. Create GitHub OAuth App with callback URL = `https://pr-sentinel.vercel.app/api/auth/callback/github`
6. Set up webhook: GitHub repo → Settings → Webhooks → Add
   - Payload URL: `https://pr-sentinel.vercel.app/api/webhooks/github`
   - Events: `Pull requests`, `Issue comments`, `Pull request review comments`
   - Secret: same as `GITHUB_WEBHOOK_SECRET` in Vercel env

## 🎯 Features

### Authentication & Multi-User
- ✅ GitHub OAuth login (no password storage)
- ✅ Per-user Gemini API key (encrypted httpOnly cookie)
- ✅ Auth middleware gates `/`, `/settings`, `/repositories`
- ✅ Settings page to manage API keys
- ✅ Public webhook/cron endpoints use server default keys

### Core Review
- ✅ End-to-end PR review from URL to posted comment
- ✅ Real-time SSE streaming of AI analysis
- ✅ Gemini 3.5 Flash with explicit context caching
- ✅ Cache hit/miss visible in UI dashboard
- ✅ Structured JSON output via response schema
- ✅ **6 review skills:** security, bugs, performance, code quality, accessibility, testing (all default ON)
- ✅ **Lite mode** (⚡): 1024 token budget, 2 chunks, security+bugs only

### Automation & Bot
- ✅ **GitHub Webhook:** auto-review on PR open/update/new commits
- ✅ **Conversational bot:** replies to @pr-sentinel mentions in PR comments
- ✅ **Re-verification summary:** posts update notification when review is refreshed on new commits
- ✅ **Self-loop guard:** bot ignores its own comments (prevents infinite reply loops)

### Smart Diff Handling
- ✅ Priority-based file analysis (source > config > assets)
- ✅ Automatic chunking for PRs > 50K tokens
- ✅ Skip binary files, lock files, and generated code
- ✅ Single-file truncation for extremely large files

### UI/UX
- ✅ Dark mode design with glassmorphism
- ✅ Real-time activity log during analysis
- ✅ Severity-coded finding cards
- ✅ Cache hit badge with token metrics
- ✅ Mode toggle: Full (deep) ↔ Lite (fast)
- ✅ Skill selector with all 6 skills
- ✅ Responsive (mobile-friendly)
- ✅ Error handling with retry buttons

---

## 🧪 Testing Locally

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Sign in:**
   - Visit [http://localhost:3001](http://localhost:3001)
   - Click "Sign in with GitHub"
   - Authorize OAuth (uses your GitHub account)

3. **Configure API key (optional):**
   - Go to [/settings](http://localhost:3001/settings)
   - Paste your Gemini API key (from ai.google.dev)
   - Save (encrypted in cookie)

4. **Review a PR:**
   - Paste a GitHub PR URL on the home page
   - Toggle **Lite mode** (⚡) to test faster reviews
   - Select skills (all default ON)
   - Click Review

5. **Test webhook (requires public tunnel):**
   ```bash
   # In another terminal, expose local server
   ngrok http 3001
   ```
   - GitHub repo → Settings → Webhooks → Add webhook
   - Payload URL: `https://<your-ngrok-url>/api/webhooks/github`
   - Events: Pull requests, Issue comments, Pull request review comments
   - Secret: random (set in `.env.local` as `GITHUB_WEBHOOK_SECRET`)
   - Create a test PR → bot auto-reviews

---

## 📊 Context Caching Verification

Cache hits are visible in:

1. **UI Badge** — Green "Cache Hit" badge with token counts
2. **Server Logs** — `📊 Usage — Cached: N, Total: M, Hit: true`
3. **API Endpoint** — `GET /api/cache/stats` returns cache metrics

---

## 🎯 Testing with Notesy PRs

Test suite: https://github.com/iqsource/hackathon-2026-05-notesy

Paste one of the test PR URLs into PR Sentinel to verify:
- Review finds intentional bugs
- Findings are accurate
- Formatting is clean
- Performance is acceptable

---

## 📝 Cost

**$0** — Everything runs on free tiers:
- Gemini API: 1500 req/day free
- Vercel: Hobby tier free
- GitHub: OAuth + PAT free

---

## 📄 License

MIT

---

## 🔍 Debugging

**Local dev logs:**
```bash
npm run dev
# Tail server output for [webhook], [conversational], [review] prefixes
```

**Build verification:**
```bash
npm run build
# Checks TypeScript + Next.js compilation
```

**Environment check:**
```bash
cat .env.local | grep -E "NEXTAUTH|GEMINI|GITHUB"
# Verify keys are set (values hidden)
```

**Webhook test (after deployment):**
```bash
curl -X POST https://<app-url>/api/webhooks/github \
  -H "x-github-event: ping" \
  -H "x-hub-signature-256: sha256=unused" \
  -H "Content-Type: application/json" \
  -d '{"zen":"test"}'
# Should return 200 OK with {"ok":true,"pong":true}
```
