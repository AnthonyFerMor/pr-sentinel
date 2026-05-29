'use client';

import { useState } from 'react';

interface Step {
  title: string;
  shortDesc: string;
  longDesc: string;
  tech: string[];
  iconPath: string;
  accentFrom: string;
  accentTo: string;
}

/**
 * Six-step explainer below the fold on the home page.
 *
 * Each step is a click-to-expand card. Closed: title + 1-line summary.
 * Open: long description + the actual tech tags. Inline SVG icons are kept
 * here (no emoji) so the cards render the same on any OS — important for
 * the "professional polished" feel.
 */
const STEPS: Step[] = [
  {
    title: 'Fetch & parse',
    shortDesc: 'Pull PR metadata and diff from GitHub.',
    longDesc:
      'Octokit fetches PR metadata, all changed files, and patches. Files are classified by priority: source code first, configs next, generated/lock/binary files skipped entirely.',
    tech: ['GitHub API', 'Octokit', 'Priority classifier'],
    iconPath: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    accentFrom: 'from-violet-500/20',
    accentTo: 'to-violet-500/0',
  },
  {
    title: 'Chunk if huge',
    shortDesc: 'Split PRs above 50K tokens to fit context limits.',
    longDesc:
      'When the diff exceeds 50K tokens, PR Sentinel groups files into priority-ordered chunks. Each chunk gets its own review pass, and findings are merged with deduplication.',
    tech: ['Token estimation', 'Priority grouping', 'Merge dedupe'],
    iconPath:
      'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
    accentFrom: 'from-blue-500/20',
    accentTo: 'to-blue-500/0',
  },
  {
    title: 'Cache the rubric',
    shortDesc: 'System prompt + rubric cached in Gemini for 1 hour.',
    longDesc:
      'The first review on a fresh skill set creates a cached primer (system prompt + active-skill rubric, ~5K tokens). Subsequent reviews reuse the cache, cutting cost and latency by ~30%. Hits/misses visible in /settings.',
    tech: ['Gemini explicit caching', 'gemini-3.5-flash', 'Stable skill key'],
    iconPath: 'M13 10V3L4 14h7v7l9-11h-7z',
    accentFrom: 'from-cyan-500/20',
    accentTo: 'to-cyan-500/0',
  },
  {
    title: 'Analyze with skills',
    shortDesc: 'Active skills shape what the model looks for.',
    longDesc:
      'Each skill (security, bugs, perf, etc.) contributes its own prompt fragment and rubric. The model follows data-flow tracing: entry → sink → guards. Output is structured JSON via response schema — no regex parsing.',
    tech: ['Structured outputs', 'Skills system', 'Data-flow tracing'],
    iconPath:
      'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
    accentFrom: 'from-emerald-500/20',
    accentTo: 'to-emerald-500/0',
  },
  {
    title: 'Stream live',
    shortDesc: 'SSE streams the review token-by-token.',
    longDesc:
      'Server-Sent Events push status messages, model chunks, and cache info to the UI in real time. You see thinking → findings → summary as they arrive — no spinner-and-wait.',
    tech: ['Server-Sent Events', 'Node runtime', 'ReadableStream'],
    iconPath: 'M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c6.04-6.04 15.83-6.04 21.87 0',
    accentFrom: 'from-amber-500/20',
    accentTo: 'to-amber-500/0',
  },
  {
    title: 'Post to GitHub',
    shortDesc: 'Review posted as a PR comment with hidden metadata.',
    longDesc:
      'The final markdown review is posted as a comment on the PR. A hidden HTML marker stores the head SHA, model, and timestamp — used to detect "needs re-review" on new commits and to recognize PR Sentinel\'s own comments.',
    tech: ['Reply mode', 'Idempotent re-reviews', 'Webhook auto-trigger'],
    iconPath: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    accentFrom: 'from-rose-500/20',
    accentTo: 'to-rose-500/0',
  },
];

export default function HowItWorks() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <section className="mt-20 mb-8 animate-slideUp" aria-labelledby="how-it-works-title" style={{ animationDelay: '0.4s' }}>
      <div className="text-center mb-8">
        <span className="step-pill mb-3 inline-flex">Architecture</span>
        <h3 id="how-it-works-title" className="text-2xl md:text-3xl font-bold text-white tracking-tight mt-3">
          How it works
        </h3>
        <p className="text-gray-400 text-sm mt-2 max-w-md mx-auto leading-relaxed">
          Six steps from PR URL to a comment posted on GitHub.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
        {STEPS.map((step, i) => {
          const isOpen = expanded === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setExpanded(isOpen ? null : i)}
              className={`text-left rounded-2xl border p-5 transition-all duration-300 group relative overflow-hidden ${
                isOpen
                  ? 'border-violet-500/40 bg-gradient-to-br from-violet-500/8 to-transparent ring-1 ring-violet-500/20 shadow-lg shadow-violet-500/10'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
              }`}
              aria-expanded={isOpen}
            >
              {/* Decorative gradient blob in corner */}
              <div
                className={`absolute -top-12 -right-12 w-24 h-24 rounded-full blur-2xl bg-gradient-to-br ${step.accentFrom} ${step.accentTo} pointer-events-none transition-opacity ${
                  isOpen ? 'opacity-100' : 'opacity-40 group-hover:opacity-70'
                }`}
              />

              <div className="relative">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                      isOpen
                        ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                        : 'border-white/10 bg-white/[0.04] text-gray-300 group-hover:border-white/20'
                    }`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={step.iconPath} />
                      </svg>
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono tabular-nums tracking-wider">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs transition ${
                      isOpen
                        ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                        : 'border-white/10 bg-white/[0.02] text-gray-500 group-hover:text-gray-300'
                    }`}
                  >
                    {isOpen ? '−' : '+'}
                  </span>
                </div>

                <h4 className="text-sm font-semibold text-white mb-1.5">{step.title}</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  {isOpen ? step.longDesc : step.shortDesc}
                </p>

                {isOpen && (
                  <div className="mt-4 pt-3 border-t border-white/[0.06] flex flex-wrap gap-1.5 animate-fadeIn">
                    {step.tech.map((t) => (
                      <span
                        key={t}
                        className="inline-block text-[10px] uppercase tracking-wider text-violet-200 bg-violet-500/10 border border-violet-500/25 rounded-full px-2 py-0.5 font-semibold"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
