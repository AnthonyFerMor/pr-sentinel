'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

const DISMISS_KEY = 'pr-sentinel:onboarding-dismissed';

/**
 * Shows a friendly banner when:
 * - User is logged in
 * - User has NOT set their own Gemini API key in /settings
 * - User hasn't dismissed the banner this session
 *
 * Server falls back to its own default key, so reviews still work, but
 * users should set their own to avoid sharing rate-limit quotas.
 */
export default function OnboardingBanner() {
  const { status } = useSession();
  const [show, setShow] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'unknown' | 'set' | 'missing'>('unknown');

  useEffect(() => {
    if (status !== 'authenticated') return;

    // Honor dismissal for the current session.
    if (typeof window !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1') {
      return;
    }

    fetch('/api/settings')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && !data.geminiKeySet) {
          setKeyStatus('missing');
          setShow(true);
        } else if (data?.geminiKeySet) {
          setKeyStatus('set');
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

  if (!show || keyStatus !== 'missing') return null;

  return (
    <div className="mb-6 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/10 p-5 backdrop-blur-sm">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-0.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 text-amber-300 text-xl">
            🔑
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-white">
            Add your Gemini API key
          </h3>
          <p className="mt-1 text-sm text-amber-100/80">
            You're using PR Sentinel's shared default key. For your own quota and faster reviews,
            add your own free key from{' '}
            <a
              href="https://ai.google.dev"
              target="_blank"
              rel="noreferrer"
              className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
            >
              Google AI Studio
            </a>
            .
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-sm font-semibold text-amber-950 transition"
            >
              Open settings
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-amber-200/60 hover:text-amber-200 transition"
            >
              Not now
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="flex-shrink-0 text-amber-200/40 hover:text-amber-200 transition"
          aria-label="Dismiss"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
