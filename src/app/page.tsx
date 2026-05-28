'use client';

import { useRef, useEffect, useState } from 'react';
import { useReviewStream } from '@/hooks/useReviewStream';
import ReviewForm from '@/components/ReviewForm';
import ReviewStream from '@/components/ReviewStream';
import SkillSelector, { loadStoredSkills } from '@/components/SkillSelector';
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

  // Cargar selección guardada en el cliente (evita mismatch de hidratación).
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

  const toggleMode = () => {
    const next = reviewMode === 'full' ? 'lite' : 'full';
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
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Automated PR
              <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent"> Code Review</span>
            </h2>
            <p className="text-gray-400 mt-2 text-sm md:text-base max-w-lg mx-auto">
              Paste a GitHub PR URL and get an instant, thorough review powered by Gemini 3.5 Flash with context caching.
            </p>
          </div>

          <ReviewForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            onReset={reset}
          />

          {/* Mode toggle */}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={toggleMode}
              disabled={isLoading}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${
                reviewMode === 'lite'
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-violet-500/40 bg-violet-500/10 text-violet-300'
              }`}
            >
              {reviewMode === 'lite' ? '⚡' : '🔬'}
              {reviewMode === 'lite' ? 'Lite mode' : 'Full mode'}
            </button>
            <span className="text-xs text-gray-500">
              {reviewMode === 'lite'
                ? 'Faster, lower token usage. Security + bugs only.'
                : 'All skills, deep analysis with thinking.'}
            </span>
          </div>

          <SkillSelector
            selected={selectedSkills}
            onChange={setSelectedSkills}
            disabled={isLoading}
          />

          <div ref={resultsRef}>
            {(isLoading || review || error) && (
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
            )}
          </div>
        </div>

        <footer className="border-t border-white/5 py-6 text-center text-xs text-gray-600">
          <p>Built with Next.js, Gemini 3.5 Flash & Tailwind CSS</p>
          <p className="mt-1">PR Sentinel — IQ Source Hackathon 2026</p>
        </footer>
      </main>
    </>
  );
}
