'use client';

import { useState } from 'react';

interface Step {
  icon: string;
  title: string;
  shortDesc: string;
  longDesc: string;
  tech: string[];
}

const STEPS: Step[] = [
  {
    icon: '🔍',
    title: 'Fetch & parse',
    shortDesc: 'Pull PR metadata and diff from GitHub.',
    longDesc:
      'Octokit fetches PR metadata, all changed files, and patches. Files are classified by priority: source code first, configs next, generated/lock/binary files skipped entirely.',
    tech: ['GitHub API', 'Octokit', 'Priority classifier'],
  },
  {
    icon: '🧩',
    title: 'Chunk if huge',
    shortDesc: 'Split PRs above 50K tokens to fit context limits.',
    longDesc:
      'When the diff exceeds 50K tokens, PR Sentinel groups files into priority-ordered chunks. Each chunk gets its own review pass, and findings are merged with deduplication.',
    tech: ['Token estimation', 'Priority grouping', 'Merge dedupe'],
  },
  {
    icon: '⚡',
    title: 'Cache the rubric',
    shortDesc: 'System prompt + rubric live in Gemini cache for 1 hour.',
    longDesc:
      'The first review on a fresh skill set creates a cached primer (system prompt + active-skill rubric, ~5K tokens). Subsequent reviews reuse the cache, cutting cost and latency by ~30%. Hits/misses visible in /settings.',
    tech: ['Gemini explicit caching', 'gemini-3.5-flash', 'Stable skill key'],
  },
  {
    icon: '🤖',
    title: 'Analyze with skills',
    shortDesc: 'Active skills shape what the model looks for.',
    longDesc:
      'Each skill (security, bugs, perf, etc.) contributes its own prompt fragment and rubric. The model follows data-flow tracing: entry → sink → guards. Output is structured JSON via response schema — no regex parsing.',
    tech: ['Structured outputs', 'Skills system', 'Data-flow tracing'],
  },
  {
    icon: '📡',
    title: 'Stream live',
    shortDesc: 'SSE streams the review token-by-token.',
    longDesc:
      'Server-Sent Events push status messages, model chunks, and cache info to the UI in real time. You see thinking → findings → summary as they arrive — no spinner-and-wait.',
    tech: ['Server-Sent Events', 'Node runtime', 'ReadableStream'],
  },
  {
    icon: '💬',
    title: 'Post to GitHub',
    shortDesc: 'Review posted as a PR comment with hidden metadata.',
    longDesc:
      'The final markdown review is posted as a comment on the PR. A hidden HTML marker stores the head SHA, model, and timestamp — used to detect "needs re-review" on new commits and to recognize PR Sentinel\'s own comments.',
    tech: ['Reply mode', 'Idempotent re-reviews', 'Webhook auto-trigger'],
  },
];

export default function HowItWorks() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <section className="mt-16 mb-8" aria-labelledby="how-it-works-title">
      <div className="text-center mb-6">
        <h3 id="how-it-works-title" className="text-xl md:text-2xl font-bold text-white tracking-tight">
          How it works
        </h3>
        <p className="text-gray-400 text-sm mt-1">
          Six steps from PR URL to a comment posted on GitHub
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {STEPS.map((step, i) => {
          const isOpen = expanded === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setExpanded(isOpen ? null : i)}
              className={`text-left rounded-xl border p-4 transition group ${
                isOpen
                  ? 'border-violet-500/40 bg-violet-500/5 ring-1 ring-violet-500/20'
                  : 'border-white/10 bg-gray-900/40 hover:border-white/20 hover:bg-gray-900/60'
              }`}
              aria-expanded={isOpen}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl" aria-hidden="true">{step.icon}</span>
                  <span className="text-xs text-gray-500 font-mono">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <span className="text-xs text-gray-600 group-hover:text-gray-400 transition">
                  {isOpen ? '−' : '+'}
                </span>
              </div>

              <h4 className="text-sm font-semibold text-white mb-1">{step.title}</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                {isOpen ? step.longDesc : step.shortDesc}
              </p>

              {isOpen && (
                <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-1.5">
                  {step.tech.map((t) => (
                    <span
                      key={t}
                      className="inline-block text-[10px] uppercase tracking-wider text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-full px-2 py-0.5"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
