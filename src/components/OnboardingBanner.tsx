'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

const DISMISS_KEY = 'pr-sentinel:onboarding-dismissed';

/**
 * Onboarding banner — shown when the user is logged in but hasn't yet added
 * their own Gemini API key.
 *
 * Since the server no longer ships a fallback key, reviews will fail without
 * one. The banner is more of a "you must do this" gate than a friendly nudge:
 * the wording is direct and the CTA is prominent. We still allow dismissing
 * per-session because we don't want to be obnoxious about it on every page
 * load — the empty state on /settings will surface the requirement again.
 */
export default function OnboardingBanner() {
  const { status } = useSession();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;

    if (typeof window !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1') {
      return;
    }

    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !data.geminiKeySet) {
          setShow(true);
        }
      })
      .catch(() => {
        // Silent fail — banner is optional UX, not critical.
      });
  }, [status]);

  const dismiss = () => {
    setShow(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore quota errors
    }
  };

  if (!show) return null;

  return (
    <div className="relative mb-8 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-5 sm:p-6 backdrop-blur-sm animate-slideUp">
      {/* Decorative shimmer */}
      <div className="absolute inset-0 animate-shimmer pointer-events-none" />

      <div className="relative flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/30 to-orange-500/20 border border-amber-400/30 shadow-lg shadow-amber-500/20">
            <svg className="w-5 h-5 text-amber-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base sm:text-lg font-semibold text-white">
              Add your Gemini API key to get started
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-200 uppercase tracking-wider">
              Required
            </span>
          </div>
          <p className="mt-1.5 text-sm text-amber-100/85 leading-relaxed max-w-2xl">
            PR Sentinel runs on your own Gemini quota — no shared server key. Grab a free key from{' '}
            <a
              href="https://ai.google.dev"
              target="_blank"
              rel="noreferrer"
              className="text-amber-200 hover:text-amber-100 font-medium underline underline-offset-2 decoration-amber-400/40"
            >
              Google AI Studio
            </a>{' '}
            (takes 30 seconds). It's encrypted server-side and never leaves your account.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 px-4 py-2.5 text-sm font-semibold text-amber-950 transition shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50"
            >
              Open settings
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-amber-200/60 hover:text-amber-200 transition font-medium"
            >
              Dismiss for now
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="flex-shrink-0 text-amber-200/40 hover:text-amber-200 transition p-1 rounded-md hover:bg-amber-500/10"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
