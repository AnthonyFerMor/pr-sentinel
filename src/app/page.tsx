'use client';

import { useRef, useEffect, useState } from 'react';
import { useReviewStream } from '@/hooks/useReviewStream';
import ReviewForm from '@/components/ReviewForm';
import ReviewStream from '@/components/ReviewStream';
import SkillSelector, { loadStoredSkills } from '@/components/SkillSelector';
import OnboardingBanner from '@/components/OnboardingBanner';
import HowItWorks from '@/components/HowItWorks';
import Header from '@/components/Header';

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

  // Hydration-safe: load stored prefs on client after mount.
  useEffect(() => {
    setSelectedSkills(loadStoredSkills());
    const storedMode = typeof window !== 'undefined'
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
    try { localStorage.setItem('pr-sentinel:mode', next); } catch {}
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
      <main className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,80,255,0.15),transparent)] pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-4 pt-10 pb-20">
          {/* Hero */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full border border-violet-500/20 bg-violet-500/5 text-xs text-violet-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-500" />
              </span>
              Powered by Gemini 3.5 Flash
            </div>

            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight">
              Automated PR
              <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent"> Code Review</span>
            </h2>
            <p className="text-gray-400 mt-3 text-sm md:text-base max-w-xl mx-auto">
              Paste a GitHub PR URL — get a thorough security, bugs, and quality review
              streamed in real time, then posted as a comment on the PR.
            </p>
          </div>

          {/* Onboarding for new users */}
          <OnboardingBanner />

          {/* Step 1: Paste URL */}
          <section aria-labelledby="step-paste" className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">1</span>
              <h3 id="step-paste" className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Paste PR URL</h3>
            </div>
            <ReviewForm
              onSubmit={handleSubmit}
              isLoading={isLoading}
              onReset={reset}
            />
          </section>

          {/* Step 2: Configure */}
          <section aria-labelledby="step-config" className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">2</span>
              <h3 id="step-config" className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Choose depth & skills</h3>
            </div>

            {/* Mode selector — segmented control */}
            <div className="rounded-xl border border-white/10 bg-gray-900/60 p-4">
              <p className="text-xs text-gray-500 mb-3">Review depth</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Review depth">
                <button
                  type="button"
                  role="radio"
                  aria-checked={reviewMode === 'full'}
                  onClick={() => setMode('full')}
                  disabled={isLoading}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    reviewMode === 'full'
                      ? 'border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/30'
                      : 'border-white/10 bg-gray-950/40 hover:border-white/20'
                  }`}
                >
                  <span className="text-xl">🔬</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-white">Full review</span>
                    <span className="block text-xs text-gray-400 mt-0.5">
                      All skills, deeper analysis. Recommended.
                    </span>
                  </span>
                  {reviewMode === 'full' && (
                    <span className="text-violet-400">✓</span>
                  )}
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={reviewMode === 'lite'}
                  onClick={() => setMode('lite')}
                  disabled={isLoading}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    reviewMode === 'lite'
                      ? 'border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/30'
                      : 'border-white/10 bg-gray-950/40 hover:border-white/20'
                  }`}
                >
                  <span className="text-xl">⚡</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-white">Lite</span>
                    <span className="block text-xs text-gray-400 mt-0.5">
                      Faster, security + bugs only.
                    </span>
                  </span>
                  {reviewMode === 'lite' && (
                    <span className="text-amber-400">✓</span>
                  )}
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
              <section aria-labelledby="step-results">
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">3</span>
                  <h3 id="step-results" className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Results</h3>
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

        <footer className="border-t border-white/5 py-6 text-center text-xs text-gray-600">
          <p>Built with Next.js, Gemini 3.5 Flash & Tailwind CSS</p>
          <p className="mt-1">PR Sentinel — IQ Source Hackathon 2026</p>
        </footer>
      </main>
    </>
  );
}
