'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

const DISMISS_KEY = 'pr-sentinel:onboarding-v2-dismissed';

interface SetupStatus {
  geminiKeySet: boolean;
  githubPATSet: boolean;
}

/**
 * Onboarding banner — shown when the user is logged in but hasn't yet
 * completed the required setup steps (Gemini key + GitHub PAT).
 *
 * Shows a visual 3-step checklist:
 *   1. ✓ Sign in with GitHub (always done when this renders)
 *   2. Add Gemini API key (required for all reviews)
 *   3. Add GitHub PAT (optional — only needed for auto-bot)
 *
 * Dismissed per-session once the user clicks "Got it" or completes step 2.
 */
export default function OnboardingBanner() {
  const { status } = useSession();
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;

    if (typeof window !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1') {
      setDismissed(true);
      return;
    }

    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { geminiKeySet?: boolean; githubPATSet?: boolean } | null) => {
        if (data) {
          setSetup({
            geminiKeySet: !!data.geminiKeySet,
            githubPATSet: !!data.githubPATSet,
          });
        }
      })
      .catch(() => {
        // Silent fail — banner is optional UX.
      });
  }, [status]);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
  };

  // Hide if: not authenticated, dismissed, loading, or fully configured (both keys set)
  if (status !== 'authenticated' || dismissed || !setup) return null;
  if (setup.geminiKeySet && setup.githubPATSet) return null;
  // Only show if Gemini key is missing (PAT alone won't block basic reviews)
  if (setup.geminiKeySet && !setup.githubPATSet) {
    // Show a smaller hint, not the full banner
  }

  const steps = [
    {
      label: 'Sign in with GitHub',
      done: true,
      required: true,
      description: 'Your account is connected.',
    },
    {
      label: 'Add your Gemini API key',
      done: setup.geminiKeySet,
      required: true,
      description: setup.geminiKeySet
        ? 'Gemini key configured ✓'
        : 'Free at ai.google.dev — takes 30 seconds.',
    },
    {
      label: 'Add a GitHub PAT',
      done: setup.githubPATSet,
      required: false,
      description: setup.githubPATSet
        ? 'GitHub PAT configured ✓'
        : 'Only needed for Auto-bot (auto-review on push).',
    },
  ];

  const allRequired = setup.geminiKeySet;

  if (allRequired) {
    // Gemini key set, PAT missing — show a small PAT hint
    return (
      <div className="relative mb-6 overflow-hidden rounded-xl border border-blue-500/20 bg-blue-500/[0.06] px-5 py-3.5 backdrop-blur-sm animate-slideUp flex items-center gap-3 flex-wrap">
        <svg className="w-4 h-4 text-blue-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-blue-100/80 flex-1">
          <strong className="text-blue-200">Want auto-reviews on push?</strong>{' '}
          Add a GitHub PAT in{' '}
          <Link href="/settings" className="underline underline-offset-2 text-blue-200 hover:text-white">
            Settings
          </Link>{' '}
          to enable the Auto-bot on your repos.
        </p>
        <button type="button" onClick={dismiss} className="text-xs text-blue-400/60 hover:text-blue-200 transition flex-shrink-0">
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="relative mb-8 overflow-hidden rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-blue-500/5 to-transparent p-5 sm:p-6 backdrop-blur-sm animate-slideUp">
      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">👋</span>
              <h3 className="text-base sm:text-lg font-semibold text-white">
                Welcome! Let&apos;s get you set up
              </h3>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              3 quick steps — you&apos;ll be reviewing PRs in under 2 minutes.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="flex-shrink-0 text-gray-500 hover:text-gray-300 transition p-1 rounded-md hover:bg-white/5"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Steps */}
        <div className="space-y-3 mb-5">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 rounded-xl p-3.5 border transition ${
                step.done
                  ? 'border-emerald-500/20 bg-emerald-500/[0.06]'
                  : step.required
                  ? 'border-amber-500/25 bg-amber-500/[0.06]'
                  : 'border-white/[0.06] bg-white/[0.02]'
              }`}
            >
              {/* Step number / checkmark */}
              <div
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold border ${
                  step.done
                    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                    : step.required
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-white/5 border-white/10 text-gray-400'
                }`}
              >
                {step.done ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-semibold ${step.done ? 'text-emerald-200' : 'text-white'}`}>
                    {step.label}
                  </p>
                  {step.required && !step.done && (
                    <span className="inline-flex rounded-full bg-rose-500/15 border border-rose-500/25 px-1.5 py-0.5 text-[9px] font-bold text-rose-300 uppercase tracking-wider">
                      Required
                    </span>
                  )}
                  {!step.required && !step.done && (
                    <span className="inline-flex rounded-full bg-white/5 border border-white/10 px-1.5 py-0.5 text-[9px] text-gray-400 uppercase tracking-wider">
                      Optional
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 hover:from-violet-400 hover:to-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition shadow-lg shadow-violet-500/25"
          >
            Open Settings
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
          {!setup.geminiKeySet && (
            <a
              href="https://ai.google.dev/gemini-api/docs/api-key"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-violet-300 hover:text-violet-200 transition underline underline-offset-2"
            >
              Get a free Gemini key →
            </a>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
