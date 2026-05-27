// ============================================================
// useReviewStream.ts — Hook para consumir el SSE stream
// ============================================================
'use client';

import { useState, useCallback, useRef } from 'react';
import { StreamEvent, ReviewResult, PRMetadata } from '@/lib/types';

export interface UseReviewStreamReturn {
  startReview: (prUrl: string, skills?: string[]) => Promise<void>;
  isLoading: boolean;
  startedAt: number | null;
  statusMessages: string[];
  streamedContent: string;
  review: ReviewResult | null;
  metadata: PRMetadata | null;
  cacheInfo: { cached: boolean; cachedTokens: number; totalTokens: number } | null;
  error: string | null;
  reset: () => void;
}

export function useReviewStream(): UseReviewStreamReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const [streamedContent, setStreamedContent] = useState('');
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [metadata, setMetadata] = useState<PRMetadata | null>(null);
  const [cacheInfo, setCacheInfo] = useState<{
    cached: boolean; cachedTokens: number; totalTokens: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setStartedAt(null);
    setStatusMessages([]);
    setStreamedContent('');
    setReview(null);
    setMetadata(null);
    setCacheInfo(null);
    setError(null);
  }, []);

  const startReview = useCallback(async (prUrl: string, skills?: string[]) => {
    abortRef.current?.abort();
    setIsLoading(true);
    setStartedAt(Date.now());
    setStatusMessages([]);
    setStreamedContent('');
    setReview(null);
    setMetadata(null);
    setCacheInfo(null);
    setError(null);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skills ? { prUrl, skills } : { prUrl }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const event: StreamEvent = JSON.parse(line.slice(6));

            switch (event.type) {
              case 'status':
                setStatusMessages((prev) => [...prev, event.message]);
                break;
              case 'metadata':
                setMetadata(event.data);
                break;
              case 'chunk':
                setStreamedContent((prev) => prev + event.content);
                break;
              case 'cache_info':
                setCacheInfo((prev) => ({
                  cached: (prev?.cached ?? false) && event.cached,
                  cachedTokens: (prev?.cachedTokens ?? 0) + event.cachedTokens,
                  totalTokens: (prev?.totalTokens ?? 0) + event.totalTokens,
                }));
                break;
              case 'complete':
                setReview(event.data);
                break;
              case 'error':
                setError(event.message);
                break;
            }
          } catch {
            // Malformed SSE line, skip
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    startReview, isLoading, startedAt, statusMessages, streamedContent,
    review, metadata, cacheInfo, error, reset,
  };
}
