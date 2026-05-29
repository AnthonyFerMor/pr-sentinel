'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import { useReviewStream } from '@/hooks/useReviewStream';
import ReviewForm from '@/components/ReviewForm';
import ReviewStream from '@/components/ReviewStream';
import SkillSelector, { loadStoredSkills } from '@/components/SkillSelector';
import OnboardingBanner from '@/components/OnboardingBanner';
import HowItWorks from '@/components/HowItWorks';
import Header from '@/components/Header';
import Aurora from '@/components/Aurora';
import Logo from '@/components/Logo';

// ── Review App (authenticated) ────────────────────────────────────────────────

function ReviewApp() {
  const {
    startReview,
    isLoading,
    startedAt,
    statusMessages,
    streamedContent,
    review,
    metadata,
    cacheInfo,
    error,
    reset,
  } = useReviewStream();

  const resultsRef = useRef<HTMLDivElement>(null);
  const lastPrUrl = useRef<string>('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [reviewMode, setReviewMode] = useState<'full' | 'lite'>('full');

  useEffect(() => {
    setSelectedSkills(loadStoredSkills());
    const storedMode =
      typeof window !== 'undefined'
        ? (localStorage.getItem('pr-sentinel:mode') as 'full' | 'lite') || 'full'
        : 'full';
    setReviewMode(storedMode);
  }, []);

  const handleSubmit = async (prUrl: string) => {
    lastPrUrl.current = prUrl;
    await startReview(prUrl, selectedSkills, reviewMode);
  };

  const setMode = (next: 'full' | 'lite') => {
    setReviewMode(next);
    try {
      localStorage.setItem('pr-sentinel:mode', next);
    } catch {}
  };

  const handleRetry = () => {
    if (lastPrUrl.current) {
      void handleSubmit(lastPrUrl.current);
    }
  };

  useEffect(() => {
    if ((isLoading || review || error) && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isLoading, review, error]);

  return (
    <>
      <Header />
      <main className="relative min-h-screen bg-[var(--surface-0)] text-white overflow-hidden">
        <Aurora />

        <div className="relative z-10 max-w-4xl mx-auto px-5 sm:px-6 pt-16 sm:pt-20 pb-24">
          {/* Hero */}
          <div className="text-center mb-12 animate-slideUp">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 mb-6 rounded-full border border-violet-500/25 bg-violet-500/[0.06] backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-pulseRing absolute inline-flex h-full w-full rounded-full bg-violet-400" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-400" />
              </span>
              <span className="text-[11px] font-semibold text-violet-200 tracking-wider uppercase">
                Powered by Gemini 2.5 Flash
              </span>
            </div>

            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight leading-[1.05]">
              Production-grade
              <span className="block mt-1">
                <span className="bg-gradient-to-r from-violet-300 via-blue-300 to-cyan-300 bg-clip-text text-transparent animate-gradient">
                  AI code review
                </span>
              </span>
            </h2>
            <p className="text-gray-400 mt-5 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
              Paste a GitHub PR URL — get a streaming security, bugs, and quality review,
              posted as a comment on the PR.
            </p>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 mt-7 text-[11px] text-gray-500">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/10">
                <svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium text-gray-300">AES-256-GCM</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/10">
                <svg className="w-3 h-3 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="font-medium text-gray-300">Real-time streaming</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/10">
                <svg className="w-3 h-3 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-gray-300">9 expert skills</span>
              </span>
            </div>
          </div>

          {/* Onboarding for new users */}
          <OnboardingBanner />

          {/* Step 1: Paste URL */}
          <section aria-labelledby="step-paste" className="mb-8 animate-slideUp" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center gap-3 mb-4">
              <span className="step-pill">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-500/30 text-[10px] font-bold text-violet-100">
                  1
                </span>
                PR Source
              </span>
              <h3 id="step-paste" className="text-sm font-medium text-gray-300">
                Paste a GitHub Pull Request URL
              </h3>
            </div>
            <ReviewForm onSubmit={handleSubmit} isLoading={isLoading} onReset={reset} />
          </section>

          {/* Step 2: Configure */}
          <section aria-labelledby="step-config" className="mb-8 animate-slideUp" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center gap-3 mb-4">
              <span className="step-pill">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-500/30 text-[10px] font-bold text-violet-100">
                  2
                </span>
                Configuration
              </span>
              <h3 id="step-config" className="text-sm font-medium text-gray-300">
                Choose depth &amp; skills
              </h3>
            </div>

            {/* Mode selector */}
            <div className="glass-card p-5 mb-5">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Review depth
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Review depth">
                <button
                  type="button"
                  role="radio"
                  aria-checked={reviewMode === 'full'}
                  onClick={() => setMode('full')}
                  disabled={isLoading}
                  className={`group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                    reviewMode === 'full'
                      ? 'border-violet-500/50 bg-gradient-to-br from-violet-500/10 to-blue-500/5 ring-1 ring-violet-500/30 shadow-lg shadow-violet-500/10'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${reviewMode === 'full' ? 'bg-violet-500/20' : 'bg-white/5 group-hover:bg-white/10'}`}>
                    <svg className="w-5 h-5 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">Full review</span>
                      {reviewMode === 'full' && <span className="text-[9px] text-violet-200 bg-violet-500/20 border border-violet-500/30 rounded-full px-2 py-0.5 uppercase tracking-wider font-bold">Active</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">All skills, deeper analysis, full reasoning budget.</p>
                  </div>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={reviewMode === 'lite'}
                  onClick={() => setMode('lite')}
                  disabled={isLoading}
                  className={`group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                    reviewMode === 'lite'
                      ? 'border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-orange-500/5 ring-1 ring-amber-500/30 shadow-lg shadow-amber-500/10'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${reviewMode === 'lite' ? 'bg-amber-500/20' : 'bg-white/5 group-hover:bg-white/10'}`}>
                    <svg className="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">Lite</span>
                      {reviewMode === 'lite' && <span className="text-[9px] text-amber-200 bg-amber-500/20 border border-amber-500/30 rounded-full px-2 py-0.5 uppercase tracking-wider font-bold">Active</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">Faster · security + bugs only · lower token cost.</p>
                  </div>
                </button>
              </div>
            </div>

            <SkillSelector selected={selectedSkills} onChange={setSelectedSkills} disabled={isLoading} />
          </section>

          {/* Results */}
          <div ref={resultsRef}>
            {(isLoading || review || error) && (
              <section aria-labelledby="step-results" className="animate-slideUp" style={{ animationDelay: '0.3s' }}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="step-pill">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-500/30 text-[10px] font-bold text-violet-100">3</span>
                    Output
                  </span>
                  <h3 id="step-results" className="text-sm font-medium text-gray-300">Live review</h3>
                </div>
                <ReviewStream
                  isLoading={isLoading}
                  startedAt={startedAt}
                  statusMessages={statusMessages}
                  streamedContent={streamedContent}
                  review={review}
                  metadata={metadata}
                  cacheInfo={cacheInfo}
                  error={error}
                  onRetry={error ? handleRetry : undefined}
                />
              </section>
            )}
          </div>

          {!isLoading && !review && !error && <HowItWorks />}
        </div>

        <footer className="relative z-10 border-t border-white/[0.06] py-8 text-center">
          <div className="max-w-4xl mx-auto px-5 sm:px-6">
            <p className="text-xs text-gray-500">Built with Next.js · Gemini 2.5 Flash · Tailwind CSS</p>
            <p className="text-[10px] text-gray-600 mt-1.5 tracking-wider uppercase">PR Sentinel · IQ Source Hackathon 2026</p>
          </div>
        </footer>
      </main>
    </>
  );
}

// ── Landing Page (public, unauthenticated) ────────────────────────────────────

const FEATURES = [
  {
    icon: '🔍',
    title: 'Inline comments',
    description: 'Each finding is pinned to the exact line in the diff — like CodeRabbit, but yours.',
    color: 'from-violet-500/20 to-violet-500/0 border-violet-500/20',
  },
  {
    icon: '🔴',
    title: 'Risk score 0–100',
    description: 'Every PR gets a weighted risk score based on severity, category, and size.',
    color: 'from-rose-500/20 to-rose-500/0 border-rose-500/20',
  },
  {
    icon: '🤖',
    title: 'Auto-bot on push',
    description: 'Enable auto-review on any repo. Every new PR triggers a review automatically.',
    color: 'from-cyan-500/20 to-cyan-500/0 border-cyan-500/20',
  },
  {
    icon: '💡',
    title: 'One-click fixes',
    description: 'GitHub suggestion blocks let reviewers apply fixes with a single click.',
    color: 'from-emerald-500/20 to-emerald-500/0 border-emerald-500/20',
  },
  {
    icon: '🔒',
    title: 'Security-first',
    description: 'Detects SQL injection, IDOR, XSS, secrets leaks, OWASP top-10 and more.',
    color: 'from-orange-500/20 to-orange-500/0 border-orange-500/20',
  },
  {
    icon: '⚡',
    title: 'Prompt caching',
    description: 'Gemini prompt cache cuts latency ~30% on repeated reviews. Cache stats in dashboard.',
    color: 'from-amber-500/20 to-amber-500/0 border-amber-500/20',
  },
];

function LandingPage() {
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = () => {
    setSigningIn(true);
    signIn('github', { callbackUrl: '/' });
  };

  return (
    <main className="relative min-h-screen bg-[var(--surface-0)] text-white overflow-hidden">
      <Aurora />

      {/* Minimal nav */}
      <nav className="relative z-10 sticky top-0 border-b border-white/[0.06] bg-[rgba(5,5,7,0.80)] backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="text-sm font-bold text-white tracking-tight">PR Sentinel</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/demo" className="text-sm text-gray-400 hover:text-white transition hidden sm:block">
              Live demo
            </Link>
            <button
              onClick={handleSignIn}
              disabled={signingIn}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 hover:from-violet-400 hover:to-blue-500 disabled:opacity-60 px-3.5 py-1.5 text-xs font-semibold text-white transition shadow-lg shadow-violet-500/20"
            >
              {signingIn ? 'Redirecting…' : 'Sign in with GitHub'}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-5 sm:px-6 pt-20 sm:pt-28 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 mb-6 rounded-full border border-violet-500/25 bg-violet-500/[0.06]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-pulseRing absolute inline-flex h-full w-full rounded-full bg-violet-400" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-400" />
          </span>
          <span className="text-[11px] font-semibold text-violet-200 tracking-wider uppercase">
            Built for IQ Source Hackathon 2026
          </span>
        </div>

        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-white tracking-tight leading-[1.03] mb-6">
          AI code review
          <span className="block mt-2 bg-gradient-to-r from-violet-300 via-blue-300 to-cyan-300 bg-clip-text text-transparent">
            that actually ships
          </span>
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto leading-relaxed mb-10">
          Paste a GitHub PR URL and get a streaming security, bugs, and quality review — posted
          as inline comments directly on the PR. Free Gemini tier is enough for daily use.
        </p>

        <div className="flex flex-wrap gap-4 justify-center">
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 hover:from-violet-400 hover:to-blue-500 disabled:opacity-60 px-7 py-4 text-base font-semibold text-white transition shadow-xl shadow-violet-500/30 hover:shadow-violet-500/50"
          >
            {signingIn ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Redirecting…
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                Start with GitHub — it&apos;s free
              </>
            )}
          </button>
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.07] px-7 py-4 text-base font-semibold text-white transition"
          >
            See a live demo →
          </Link>
        </div>

        {/* Quick stats */}
        <div className="mt-14 grid grid-cols-3 gap-4 max-w-lg mx-auto">
          {[
            { value: '< 60s', label: 'Time to first review' },
            { value: '9', label: 'Expert skill categories' },
            { value: '0$', label: 'Server cost to you' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-white/[0.08] bg-white/[0.03] py-4 px-2">
              <p className="text-2xl font-bold text-white tabular-nums">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 sm:px-6 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-white tracking-tight">
            Everything a senior reviewer would catch
          </h2>
          <p className="text-gray-400 text-base mt-3 max-w-xl mx-auto">
            PR Sentinel is not just a linter. It reasons about your code like a human reviewer would.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`rounded-2xl border bg-gradient-to-br ${f.color} p-5 backdrop-blur-sm`}
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-base font-semibold text-white mb-1.5">{f.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 max-w-4xl mx-auto px-5 sm:px-6 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-white tracking-tight">Up and running in 3 steps</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { step: '01', title: 'Sign in with GitHub', desc: 'OAuth — no password, no extra permissions beyond what you choose to grant.' },
            { step: '02', title: 'Add your Gemini key', desc: 'Free from Google AI Studio. Encrypted with AES-256-GCM. Never shared.' },
            { step: '03', title: 'Paste any PR URL', desc: 'Get a full review posted as inline comments directly on the GitHub PR.' },
          ].map((s) => (
            <div key={s.step} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
              <p className="text-4xl font-bold text-violet-500/40 tabular-nums mb-4">{s.step}</p>
              <h3 className="text-base font-semibold text-white mb-2">{s.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-4xl mx-auto px-5 sm:px-6 pb-24">
        <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-blue-500/5 to-transparent p-10 text-center">
          <h2 className="text-3xl font-bold text-white tracking-tight mb-3">
            Ready to review your first PR?
          </h2>
          <p className="text-gray-400 text-base max-w-md mx-auto mb-7 leading-relaxed">
            Sign in with GitHub, grab a free Gemini key, and you&apos;re reviewing in 60 seconds.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button
              onClick={handleSignIn}
              disabled={signingIn}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 hover:from-violet-400 hover:to-blue-500 disabled:opacity-60 px-6 py-3 text-sm font-semibold text-white transition shadow-lg shadow-violet-500/30"
            >
              Sign in with GitHub →
            </button>
            <Link href="/demo" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.07] px-6 py-3 text-sm font-semibold text-white transition">
              Live demo (no signup)
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.06] py-8 text-center">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <p className="text-xs text-gray-500">Built with Next.js · Gemini 2.5 Flash · Tailwind CSS · GitHub OAuth</p>
          <p className="text-[10px] text-gray-600 mt-1.5 tracking-wider uppercase">PR Sentinel · IQ Source Hackathon 2026</p>
        </div>
      </footer>
    </main>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function Home() {
  const { status } = useSession();

  // Show landing while loading session (avoids flash of review form)
  if (status === 'loading') {
    return (
      <main className="relative min-h-screen bg-[var(--surface-0)] flex items-center justify-center overflow-hidden">
        <Aurora />
        <div className="relative z-10 flex items-center gap-3 text-gray-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return <LandingPage />;
  }

  return <ReviewApp />;
}
