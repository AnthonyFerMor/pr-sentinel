'use client';

import { useState } from 'react';
import { useReviewStream } from '@/hooks/useReviewStream';
import ReviewForm from '@/components/ReviewForm';
import ReviewStream from '@/components/ReviewStream';
import Header from '@/components/Header';

export default function Home() {
  const {
    startReview,
    isLoading,
    statusMessages,
    streamedContent,
    review,
    metadata,
    cacheInfo,
    error,
    reset,
  } = useReviewStream();

  const [postToGitHub, setPostToGitHub] = useState(true);

  const handleSubmit = async (prUrl: string) => {
    await startReview(prUrl, postToGitHub);
  };

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        {/* Hero gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,80,255,0.15),transparent)] pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-4 pt-10 pb-20">
          {/* Hero text */}
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Automated PR
              <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent"> Code Review</span>
            </h2>
            <p className="text-gray-400 mt-2 text-sm md:text-base max-w-lg mx-auto">
              Paste a GitHub PR URL and get an instant, thorough review powered by Gemini 3.5 Flash with context caching.
            </p>
          </div>

          {/* Form */}
          <ReviewForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            postToGitHub={postToGitHub}
            onTogglePost={setPostToGitHub}
            onReset={reset}
          />

          {/* Results */}
          {(isLoading || review || error) && (
            <ReviewStream
              isLoading={isLoading}
              statusMessages={statusMessages}
              streamedContent={streamedContent}
              review={review}
              metadata={metadata}
              cacheInfo={cacheInfo}
              error={error}
            />
          )}
        </div>
      </main>
    </>
  );
}
