'use client';

import Link from 'next/link';
import { useState } from 'react';
import Aurora from '@/components/Aurora';
import Logo from '@/components/Logo';

/**
 * /demo — Public, no-auth-required page that shows what a finished review
 * looks like. Pre-baked content so visitors can see the value before
 * committing to GitHub OAuth + adding a Gemini key.
 *
 * Content is hand-written to mirror a real review of a SQL-injection
 * vulnerability — recognizable to any backend dev. The fake PR is plausible
 * (a search endpoint patch) and the findings are concrete and grounded.
 */

const DEMO_PR = {
  title: 'Add full-text search to /api/notes',
  repo: 'example/notesy',
  number: 142,
  author: 'jane-dev',
  branch: 'feat/notes-search → main',
  filesChanged: 3,
  additions: 87,
  deletions: 12,
};

interface DemoFinding {
  category: 'security' | 'bugs' | 'performance' | 'codeQuality' | 'suggestions';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  file: string;
  lineRange: string;
  description: string;
  impact: string;
  fix: string;
  cwe?: string;
  suggestionCode?: string;
}

const FINDINGS: DemoFinding[] = [
  {
    category: 'security',
    severity: 'critical',
    title: 'SQL injection in search endpoint via unsanitized `q` parameter',
    file: 'src/app/api/notes/route.ts',
    lineRange: 'L24-L28',
    description:
      'The handler interpolates the `q` query parameter directly into the LIKE clause without binding or sanitization. Any user can craft a payload that breaks out of the string literal and runs arbitrary SQL against the SQLite database.',
    impact:
      'A request to `/api/notes?q=%27%20OR%201%3D1--` returns every note belonging to every user — full data exfiltration without authentication on the search path.',
    fix:
      'Replace the template literal with a bound parameter and escape the LIKE wildcards explicitly.',
    cwe: 'CWE-89',
    suggestionCode:
      "  const safe = q.replace(/[%_]/g, (c) => '\\\\' + c);\n  const rows = await db.prepare(\n    `SELECT id, title, body FROM notes WHERE user_id = ? AND title LIKE ? ESCAPE '\\\\' LIMIT 50`\n  ).all(userId, `%${safe}%`);",
  },
  {
    category: 'security',
    severity: 'high',
    title: 'Missing authorization on note retrieval',
    file: 'src/app/api/notes/route.ts',
    lineRange: 'L31-L35',
    description:
      'Once a note id is returned, the GET handler at /api/notes/[id] does not check that the requesting user owns the note. The route only verifies the session exists.',
    impact:
      'Any logged-in user can read any other user\'s note by guessing or enumerating ids. This is the most common form of broken object-level authorization.',
    fix:
      'Add `WHERE user_id = ?` to the SELECT, binding the session user id.',
    cwe: 'CWE-639',
  },
  {
    category: 'bugs',
    severity: 'medium',
    title: 'Search results not paginated; can return entire table',
    file: 'src/app/api/notes/route.ts',
    lineRange: 'L26',
    description:
      'The query has no LIMIT and no cursor. For users with thousands of notes the response will hold the whole table in memory before serializing.',
    impact:
      'Memory spikes on hot users, slow responses, and a trivial DoS vector. A user with 100k notes can wedge the route handler.',
    fix: 'Add LIMIT 50 and a cursor parameter for deeper paging.',
  },
  {
    category: 'performance',
    severity: 'low',
    title: 'Missing index on notes.title for LIKE queries',
    file: 'migrations/004_notes_search.sql',
    lineRange: 'L1-L8',
    description:
      'The migration introduces title-search but does not create an index. SQLite will do a full table scan for every request.',
    impact:
      'Latency grows linearly with table size. Once notes count exceeds ~10k rows, p95 search latency will degrade.',
    fix:
      'Add `CREATE INDEX idx_notes_title ON notes(user_id, title);` and consider FTS5 if substring queries dominate.',
  },
  {
    category: 'codeQuality',
    severity: 'low',
    title: 'Error message leaks the SQL into the response',
    file: 'src/app/api/notes/route.ts',
    lineRange: 'L40',
    description:
      'The catch block returns `err.message` to the client. SQLite errors usually contain the full SQL text and column names.',
    impact:
      'Eases reconnaissance for attackers — they learn the schema without needing to inject.',
    fix:
      'Log the detailed error server-side, return a generic message to the client.',
  },
];

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-rose-300 bg-rose-500/15 border-rose-500/30',
  high: 'text-orange-300 bg-orange-500/15 border-orange-500/30',
  medium: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
  low: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  info: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
};

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: 'ℹ️',
};

const CATEGORY_LABEL: Record<string, string> = {
  security: '🔒 Security',
  bugs: '🐛 Bug',
  performance: '⚡ Performance',
  codeQuality: '🧹 Code quality',
  suggestions: '💡 Suggestion',
};

export default function DemoPage() {
  const [selected, setSelected] = useState(0);
  const finding = FINDINGS[selected];

  // Risk score for the demo: 1 critical + 1 high + 1 medium + 2 low.
  const riskScore = 78;

  return (
    <main className="relative min-h-screen bg-[var(--surface-0)] text-white overflow-hidden">
      <Aurora />

      {/* Minimal top bar — no Header component so this page works without auth */}
      <div className="relative z-10 sticky top-0 border-b border-white/[0.06] bg-[rgba(5,5,7,0.75)] backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition">
            <Logo size={28} />
            <span className="text-sm font-semibold text-white tracking-tight">PR Sentinel</span>
            <span className="text-[10px] text-violet-300 bg-violet-500/15 border border-violet-500/30 rounded-full px-2 py-0.5 uppercase tracking-wider ml-1">
              Demo
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-300 hover:text-white transition">
              Sign in
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 hover:from-violet-400 hover:to-blue-500 px-3.5 py-1.5 text-xs font-semibold text-white transition shadow-lg shadow-violet-500/20"
            >
              Try it on your PR
            </Link>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-6 pt-10 sm:pt-12 pb-24">
        {/* Hero */}
        <div className="mb-8 animate-slideUp text-center">
          <span className="step-pill mb-3 inline-flex">Live demo · no signup required</span>
          <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight mt-3">
            See what PR Sentinel{' '}
            <span className="bg-gradient-to-r from-violet-300 via-blue-300 to-cyan-300 bg-clip-text text-transparent">
              catches
            </span>
          </h1>
          <p className="text-gray-400 text-base mt-3 leading-relaxed max-w-2xl mx-auto">
            This is a real review structure on a simulated PR adding search to a notes API. Click
            any finding to see its full breakdown, fix suggestion, and CWE classification.
          </p>
        </div>

        {/* Faux PR card */}
        <section className="mb-6 rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5 uppercase tracking-wider font-semibold">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" /> Open
                </span>
                <span className="text-xs text-gray-500 font-mono">
                  {DEMO_PR.repo}#{DEMO_PR.number}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-white truncate">{DEMO_PR.title}</h2>
              <p className="text-xs text-gray-400 mt-1">
                by <span className="text-gray-300">@{DEMO_PR.author}</span> · {DEMO_PR.branch} ·{' '}
                <span className="text-emerald-300">+{DEMO_PR.additions}</span>{' '}
                <span className="text-rose-300">-{DEMO_PR.deletions}</span> across{' '}
                {DEMO_PR.filesChanged} files
              </p>
            </div>
            <RiskScoreBadge score={riskScore} />
          </div>

          <div className="grid lg:grid-cols-3 gap-0">
            {/* Findings list */}
            <div className="lg:col-span-1 lg:border-r border-white/5">
              <div className="p-4 border-b border-white/5">
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">
                  {FINDINGS.length} findings · click to inspect
                </p>
              </div>
              <ul className="divide-y divide-white/5">
                {FINDINGS.map((f, i) => {
                  const active = selected === i;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => setSelected(i)}
                        className={`w-full text-left px-4 py-3 transition ${
                          active
                            ? 'bg-violet-500/10 border-l-2 border-violet-500'
                            : 'hover:bg-white/[0.03] border-l-2 border-transparent'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-base mt-0.5 flex-shrink-0">
                            {SEVERITY_EMOJI[f.severity]}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-medium truncate ${active ? 'text-white' : 'text-gray-200'}`}>
                              {f.title}
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5 truncate font-mono">
                              {f.file}:{f.lineRange}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className={`inline-flex text-[10px] rounded-full border px-1.5 py-0.5 ${SEVERITY_COLOR[f.severity]}`}>
                                {f.severity}
                              </span>
                              <span className="text-[10px] text-gray-400">{CATEGORY_LABEL[f.category]}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Selected finding detail */}
            <div className="lg:col-span-2 p-6">
              <div className="flex items-start gap-3 mb-4 flex-wrap">
                <span className={`inline-flex text-xs font-semibold uppercase tracking-wider rounded-full border px-2 py-0.5 ${SEVERITY_COLOR[finding.severity]}`}>
                  {SEVERITY_EMOJI[finding.severity]} {finding.severity}
                </span>
                <span className="text-xs text-gray-400">{CATEGORY_LABEL[finding.category]}</span>
                {finding.cwe && (
                  <span className="text-[10px] text-violet-300 bg-violet-500/10 border border-violet-500/30 rounded-full px-2 py-0.5 font-mono">
                    {finding.cwe}
                  </span>
                )}
                <span className="ml-auto text-[11px] text-gray-500 font-mono truncate max-w-[260px]">
                  {finding.file}:{finding.lineRange}
                </span>
              </div>

              <h3 className="text-xl font-semibold text-white tracking-tight mb-3">
                {finding.title}
              </h3>

              <p className="text-sm text-gray-300 leading-relaxed mb-4">
                {finding.description}
              </p>

              <div className="mb-4 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
                <p className="text-xs uppercase tracking-wider text-orange-300 font-semibold mb-1.5">
                  ⚠️ Impact
                </p>
                <p className="text-sm text-orange-100/85 leading-relaxed">{finding.impact}</p>
              </div>

              <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2 mt-5">
                💡 Suggested fix
              </p>
              <p className="text-sm text-gray-300 leading-relaxed mb-3">{finding.fix}</p>

              {finding.suggestionCode && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
                  <div className="px-4 py-2 border-b border-emerald-500/20 flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-emerald-300 font-semibold">
                      Apply suggestion
                    </span>
                    <span className="text-[10px] text-emerald-300/60">one-click commit on GitHub</span>
                  </div>
                  <pre className="text-xs text-emerald-100 p-4 overflow-x-auto font-mono leading-relaxed whitespace-pre">
                    {finding.suggestionCode}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-10 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-blue-500/5 to-transparent p-8 text-center">
          <h3 className="text-2xl font-bold text-white tracking-tight">
            Ready to review your own PR?
          </h3>
          <p className="text-gray-400 text-sm mt-2 max-w-md mx-auto leading-relaxed">
            Sign in with GitHub, add your free Gemini key, and paste a PR URL.
            The free Gemini tier is enough for everyday use.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 hover:from-violet-400 hover:to-blue-500 px-5 py-3 text-sm font-semibold text-white transition shadow-lg shadow-violet-500/30"
            >
              Sign in with GitHub
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
            <a
              href="https://ai.google.dev"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.07] px-5 py-3 text-sm font-semibold text-white transition"
            >
              Get a free Gemini key
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}

function RiskScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75
      ? 'from-rose-500/30 to-rose-500/0 border-rose-500/40 text-rose-200'
      : score >= 45
        ? 'from-orange-500/30 to-orange-500/0 border-orange-500/40 text-orange-200'
        : score >= 20
          ? 'from-amber-500/30 to-amber-500/0 border-amber-500/40 text-amber-200'
          : 'from-emerald-500/30 to-emerald-500/0 border-emerald-500/40 text-emerald-200';
  const label = score >= 75 ? 'High risk' : score >= 45 ? 'Risky' : score >= 20 ? 'Review' : 'Safe';
  return (
    <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${color} px-4 py-2.5`}>
      <p className="text-[10px] uppercase tracking-wider text-gray-300 font-semibold">Risk score</p>
      <p className="text-2xl font-bold tabular-nums leading-none mt-0.5">{score}<span className="text-xs text-gray-400">/100</span></p>
      <p className="text-[11px] mt-1 font-semibold">{label}</p>
    </div>
  );
}
