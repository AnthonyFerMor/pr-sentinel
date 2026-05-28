'use client';

import { useRef, useEffect, useState } from 'react';
import { useReviewStream } from '@/hooks/useReviewStream';
import ReviewForm from '@/components/ReviewForm';
import ReviewStream from '@/components/ReviewStream';
import SkillSelector, { loadStoredSkills } from '@/components/SkillSelector';
import OnboardingBanner from '@/components/OnboardingBanner';
import HowItWorks from '@/components/HowItWorks';
import Header from '@/components/Header';
import Aurora from '@/components/Aurora';

export default function Home() {
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
                Powered by Gemini 3.5 Flash
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
                Choose depth & skills
              </h3>
            </div>

            {/* Mode selector — segmented control */}
            <div className="glass-card p-5 mb-5">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Review depth
              </p>
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                role="radiogroup"
                aria-label="Review depth"
              >
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
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
                      reviewMode === 'full' ? 'bg-violet-500/20' : 'bg-white/5 group-hover:bg-white/10'
                    }`}
                  >
                    <svg className="w-5 h-5 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">Full review</span>
                      {reviewMode === 'full' && (
                        <span className="text-[9px] text-violet-200 bg-violet-500/20 border border-violet-500/30 rounded-full px-2 py-0.5 uppercase tracking-wider font-bold">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      All skills, deeper analysis, full reasoning budget.
                    </p>
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
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
                      reviewMode === 'lite' ? 'bg-amber-500/20' : 'bg-white/5 group-hover:bg-white/10'
                    }`}
                  >
                    <svg className="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">Lite</span>
                      {reviewMode === 'lite' && (
                        <span className="text-[9px] text-amber-200 bg-amber-500/20 border border-amber-500/30 rounded-full px-2 py-0.5 uppercase tracking-wider font-bold">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      Faster · security + bugs only · lower token cost.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            <SkillSelector
              selected={selectedSkills}
              onChange={setSelectedSkills}
              disabled={isLoading}
            />
          </section>

          {/* Results */}
          <div ref={resultsRef}>
            {(isLoading || review || error) && (
              <section
                aria-labelledby="step-results"
                className="animate-slideUp"
                style={{ animationDelay: '0.3s' }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="step-pill">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-500/30 text-[10px] font-bold text-violet-100">
                      3
                    </span>
                    Output
                  </span>
                  <h3 id="step-results" className="text-sm font-medium text-gray-300">
                    Live review
                  </h3>
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

          {/* How it works — only show when no review is happening */}
          {!isLoading && !review && !error && <HowItWorks />}
        </div>

        <footer className="relative z-10 border-t border-white/[0.06] py-8 text-center">
          <div className="max-w-4xl mx-auto px-5 sm:px-6">
            <p className="text-xs text-gray-500">
              Built with Next.js 16 · Gemini 3.5 Flash · Tailwind CSS
            </p>
            <p className="text-[10px] text-gray-600 mt-1.5 tracking-wider uppercase">
              PR Sentinel · IQ Source Hackathon 2026
            </p>
          </div>
        </footer>
      </main>
    </>
  );
}
