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
User → [Next.js Frontend] → [/api/review SSE Stream]
                                    ↓
                            [GitHub API] → Fetch PR diff + metadata
                                    ↓
                            [Chunking Engine] → Split if > 50K tokens
                                    ↓
                            [Gemini 3.5 Flash] → Analyze with context caching
                                    ↓
                            [Structured Output] → JSON review result
                                    ↓
                            [GitHub API] → Post comment on PR
```

### Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Next.js App Router** | Server-side API routes + React frontend in one deploy |
| **SSE (Server-Sent Events)** | Real-time streaming without WebSocket complexity |
| **Explicit Context Caching** | System prompt cached = faster + cheaper subsequent reviews |
| **Structured Outputs** | JSON schema guarantees consistent review format |
| **Priority-based Chunking** | Source code analyzed first, generated/lock files skipped |
| **`@google/genai` SDK** | Official SDK with native caching support (not deprecated `@google/generative-ai`) |

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
- A [Gemini API key](https://ai.google.dev) (free tier)
- A GitHub fine-grained PAT with: Contents (read), Pull requests (read & write), Issues (read & write)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/your-user/pr-sentinel.git
cd pr-sentinel

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# Edit .env.local with your actual API keys

# 4. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste a PR URL.

### Environment Variables

| Variable | Required | Where to Get |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ | [ai.google.dev](https://ai.google.dev) → Google AI Studio → Get API Key |
| `GEMINI_MODEL` | Optional | Defaults to `gemini-3.5-flash` (required for hackathon compliance) |
| `GEMINI_MAX_RETRIES` | Optional | Defaults to `4` retries per model for temporary Gemini 429/500/503/504 errors |
| `GEMINI_FALLBACK_MODELS` | Optional | Emergency comma-separated fallback models; leave empty for strict hackathon runs |
| `PR_SENTINEL_GITHUB_TOKEN` | ✅ | GitHub → Settings → Developer Settings → Fine-grained PAT (Contents: read, Pull requests: rw, Issues: rw) |

---

## 🚀 Deploy (Vercel)

1. Import the GitHub repo into Vercel.
2. Set Vercel Environment Variables: `GEMINI_API_KEY` and `PR_SENTINEL_GITHUB_TOKEN`.
3. Deploy. The main endpoint is `POST /api/review` (SSE streaming, Node runtime).

## 🎯 Features

### Core
- ✅ End-to-end PR review from URL to posted comment
- ✅ Real-time SSE streaming of AI analysis
- ✅ Gemini 3.5 Flash with explicit context caching
- ✅ Cache hit/miss visible in UI dashboard
- ✅ Structured JSON output via response schema
- ✅ GitHub comment posting with rich Markdown formatting

### Repository Automation
- ✅ `/repositories` dashboard lists repositories accessible by the GitHub token
- ✅ Add public repositories manually by GitHub URL
- ✅ Auto-review switch per repository while the dashboard is open
- ✅ Detects PRs not reviewed by PR Sentinel
- ✅ Detects PRs updated after the last PR Sentinel review using hidden comment metadata
- ✅ One-click "review pending" action for all open PRs in a repository

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
- ✅ Responsive (mobile-friendly)
- ✅ Skeleton loading states
- ✅ Error handling with clear messages

---

## 📊 Context Caching Verification

Cache hits are verifiable in three places:

1. **UI Badge** — Green "Cache Hit" badge with token counts
2. **Server Logs** — `📊 Usage — Cached: N, Total: M, Hit: true`
3. **API Endpoint** — `GET /api/cache/stats` returns cache name/age plus hit/miss counters and last usage

---

## 📝 Cost

**$0** — Everything runs on free tiers:
- Gemini API: 1500 req/day free
- Vercel: Hobby tier free
- GitHub: PAT free

---

## 📄 License

MIT
