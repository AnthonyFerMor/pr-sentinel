'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import Aurora from '@/components/Aurora';
import Logo from '@/components/Logo';

function LoginContent() {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/';
  const error = params.get('error');
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = () => {
    setSigningIn(true);
    signIn('github', { callbackUrl });
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--surface-0)] overflow-hidden">
      <Aurora />

      <div className="relative z-10 w-full max-w-md mx-4 animate-slideUp">
        {/* Logo + brand */}
        <div className="text-center mb-10">
          <div className="inline-flex mb-5 transition-transform duration-500 hover:scale-110">
            <Logo size={64} />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">
            PR{' '}
            <span className="bg-gradient-to-r from-violet-300 via-blue-300 to-cyan-300 bg-clip-text text-transparent">
              Sentinel
            </span>
          </h1>
          <p className="text-gray-400 mt-3 text-sm max-w-sm mx-auto leading-relaxed">
            AI-powered code review for GitHub Pull Requests
          </p>
        </div>

        {/* Card */}
        <div className="glass-card p-8 relative overflow-hidden">
          {/* Decorative gradient accent in corner */}
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-violet-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative">
            {error && (
              <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200 animate-fadeIn">
                <div className="flex items-start gap-2.5">
                  <svg
                    className="w-5 h-5 text-rose-400 mt-0.5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div>
                    <p className="font-semibold">Sign-in failed</p>
                    <p className="text-xs text-rose-200/80 mt-1 leading-relaxed">
                      {error === 'AccessDenied'
                        ? 'GitHub denied access. Try again or check OAuth app settings.'
                        : `Error: ${error}`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white tracking-tight">Welcome back</h2>
              <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">
                Sign in with GitHub to get started.
              </p>
            </div>

            <button
              onClick={handleSignIn}
              disabled={signingIn}
              className="group w-full relative flex items-center justify-center gap-3 px-4 py-3.5 bg-gradient-to-br from-gray-800 to-gray-900 hover:from-gray-700 hover:to-gray-800 disabled:opacity-60 disabled:cursor-not-allowed border border-white/10 hover:border-white/20 rounded-xl text-white font-semibold transition-all duration-300 shadow-lg shadow-black/50 hover:shadow-violet-500/20"
            >
              {signingIn ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 text-violet-300"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Redirecting to GitHub...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  Continue with GitHub
                  <svg
                    className="w-4 h-4 ml-1 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </>
              )}
            </button>

            {/* Permissions explainer */}
            <div className="mt-7 pt-6 border-t border-white/[0.06]">
              <p className="text-[11px] text-gray-500 mb-3.5 uppercase tracking-[0.15em] font-semibold">
                Permissions requested
              </p>
              <ul className="space-y-2.5 text-xs text-gray-400">
                <li className="flex items-start gap-2.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15 mt-0.5 flex-shrink-0">
                    <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span className="leading-relaxed">
                    <strong className="text-gray-200">Read</strong> Pull Request diffs and metadata
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15 mt-0.5 flex-shrink-0">
                    <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span className="leading-relaxed">
                    <strong className="text-gray-200">Write</strong> review comments on PRs
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15 mt-0.5 flex-shrink-0">
                    <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span className="leading-relaxed">
                    <strong className="text-gray-200">Read</strong> your basic profile (name, avatar)
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-gray-600 text-center mt-7 leading-relaxed">
          By signing in, you agree that PR Sentinel may access your PRs to perform AI code review.
          <br />
          You bring your own Gemini API key — no shared server quota.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="relative flex min-h-screen items-center justify-center bg-[var(--surface-0)] overflow-hidden">
          <Aurora />
          <div className="relative z-10 text-gray-400 text-sm">Loading...</div>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
