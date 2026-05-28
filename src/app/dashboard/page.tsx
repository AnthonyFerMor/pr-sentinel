'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import Aurora from '@/components/Aurora';

interface DashboardData {
  stats: {
    totalReviews: number;
    totalFindings: number;
    bySeverity: { critical: number; high: number; medium: number; low: number; info: number };
    byCategory: { security: number; bugs: number; performance: number; codeQuality: number; suggestions: number };
    totalTokensUsed: number;
    totalCacheHits: number;
    totalCacheMisses: number;
    firstReviewAt?: number;
    lastReviewAt?: number;
  };
  recent: Array<{
    prUrl: string;
    prTitle: string;
    owner: string;
    repo: string;
    pullNumber: number;
    riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'clean';
    riskScore?: number;
    findingsCount: number;
    reviewedAt: number;
    commentUrl?: string;
  }>;
  derived: { timeSavedMinutes: number; cacheHitRate: number };
  storageAvailable: boolean;
}

const RISK_COLOR: Record<string, string> = {
  critical: 'text-rose-300 bg-rose-500/15 border-rose-500/30',
  high: 'text-orange-300 bg-orange-500/15 border-orange-500/30',
  medium: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
  low: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  clean: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
};

const RISK_EMOJI: Record<string, string> = {
  critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', clean: '✅',
};

export default function DashboardPage() {
  const { status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/dashboard');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d) => setData(d as DashboardData))
      .catch((e) => setError(typeof e === 'string' ? e : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [status]);

  if (status === 'loading' || loading) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading dashboard...
          </div>
        </main>
      </>
    );
  }

  const empty = !data || data.stats.totalReviews === 0;

  return (
    <>
      <Header />
      <main className="relative min-h-screen bg-[var(--surface-0)] text-white overflow-hidden">
        <Aurora />

        <div className="relative z-10 max-w-6xl mx-auto px-5 sm:px-6 pt-12 sm:pt-14 pb-24">
          {/* Hero */}
          <div className="mb-10 animate-slideUp">
            <span className="step-pill mb-3">Insights</span>
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight mt-2">
              Your review dashboard
            </h2>
            <p className="text-gray-400 text-base mt-2 leading-relaxed max-w-2xl">
              Every Pull Request you&apos;ve reviewed with PR Sentinel — what got caught, how much
              time it saved, and which categories are most active.
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
              ⚠ Failed to load stats: {error}
            </div>
          )}

          {data && !data.storageAvailable && (
            <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              ⚠ Persistent storage (Vercel KV) is not configured — stats won&apos;t accumulate across
              sessions. Provision Upstash Redis in your environment to enable analytics.
            </div>
          )}

          {empty ? (
            <EmptyState />
          ) : (
            <>
              {/* Big number cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 stagger">
                <BigStat
                  label="Reviews"
                  value={data!.stats.totalReviews.toLocaleString()}
                  hint="Total PRs analyzed"
                  color="violet"
                  icon="📋"
                />
                <BigStat
                  label="Findings"
                  value={data!.stats.totalFindings.toLocaleString()}
                  hint={`${data!.stats.bySeverity.critical} critical + ${data!.stats.bySeverity.high} high`}
                  color="cyan"
                  icon="🔍"
                />
                <BigStat
                  label="Time saved"
                  value={formatTime(data!.derived.timeSavedMinutes)}
                  hint="Estimated dev hours saved"
                  color="emerald"
                  icon="⏱️"
                />
                <BigStat
                  label="Cache hit rate"
                  value={`${data!.derived.cacheHitRate}%`}
                  hint={`${data!.stats.totalCacheHits}/${data!.stats.totalCacheHits + data!.stats.totalCacheMisses} hits`}
                  color="amber"
                  icon="⚡"
                />
              </div>

              {/* Severity breakdown */}
              <section className="mb-6 rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-xl p-6">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="text-orange-400">🎯</span>
                  Findings by severity
                </h3>
                <SeverityBars sev={data!.stats.bySeverity} total={data!.stats.totalFindings} />
              </section>

              {/* Category breakdown */}
              <section className="mb-6 rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-xl p-6">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="text-violet-400">🗂️</span>
                  Findings by category
                </h3>
                <CategoryBars cats={data!.stats.byCategory} total={data!.stats.totalFindings} />
              </section>

              {/* Recent reviews */}
              <section className="mb-6 rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                    <span className="text-cyan-400">🕒</span>
                    Recent reviews
                  </h3>
                  <span className="text-xs text-gray-500">Last 20</span>
                </div>
                {data!.recent.length === 0 ? (
                  <p className="text-sm text-gray-400">No recent reviews yet.</p>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {data!.recent.map((r) => (
                      <li key={`${r.prUrl}-${r.reviewedAt}`} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <a
                            href={r.commentUrl || r.prUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-white hover:text-violet-300 transition truncate block font-medium"
                          >
                            {r.prTitle || `PR #${r.pullNumber}`}
                          </a>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {r.owner}/{r.repo} · #{r.pullNumber} · {formatRelativeTime(r.reviewedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {typeof r.riskScore === 'number' && (
                            <span className="text-[10px] text-gray-400 bg-white/5 border border-white/10 rounded-full px-2 py-0.5 font-mono">
                              {r.riskScore}/100
                            </span>
                          )}
                          <span className={`text-[10px] font-semibold uppercase tracking-wider rounded-full border px-2 py-0.5 ${RISK_COLOR[r.riskLevel] ?? 'text-gray-400 bg-white/5 border-white/10'}`}>
                            {RISK_EMOJI[r.riskLevel] ?? '❓'} {r.riskLevel}
                          </span>
                          <span className="text-xs text-gray-400 hidden sm:inline">
                            {r.findingsCount} finding{r.findingsCount === 1 ? '' : 's'}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-xl p-12 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/10 border border-violet-500/20">
        <svg className="w-7 h-7 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
      <h3 className="text-white text-lg font-semibold tracking-tight">No reviews yet</h3>
      <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto leading-relaxed">
        Run your first PR review to start seeing stats here. You can paste a PR URL on the home
        page or enable auto-review on a repository.
      </p>
      <div className="mt-6 flex flex-wrap gap-3 justify-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 hover:from-violet-400 hover:to-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition shadow-lg shadow-violet-500/30"
        >
          Run a review
        </Link>
        <Link
          href="/repositories"
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.07] px-4 py-2.5 text-sm font-semibold text-white transition"
        >
          Enable a repo
        </Link>
      </div>
    </div>
  );
}

function BigStat({
  label,
  value,
  hint,
  color,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  color: 'violet' | 'cyan' | 'emerald' | 'amber';
  icon: string;
}) {
  const colorMap = {
    violet: 'from-violet-500/15 to-violet-500/0 border-violet-500/25 text-violet-200',
    cyan: 'from-cyan-500/15 to-cyan-500/0 border-cyan-500/25 text-cyan-200',
    emerald: 'from-emerald-500/15 to-emerald-500/0 border-emerald-500/25 text-emerald-200',
    amber: 'from-amber-500/15 to-amber-500/0 border-amber-500/25 text-amber-200',
  } as const;

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${colorMap[color]} p-5`}>
      <div className="absolute -top-8 -right-8 text-5xl opacity-20" aria-hidden="true">{icon}</div>
      <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">{label}</p>
      <p className="text-3xl font-bold text-white mt-2 tabular-nums">{value}</p>
      <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">{hint}</p>
    </div>
  );
}

function SeverityBars({
  sev,
  total,
}: {
  sev: { critical: number; high: number; medium: number; low: number; info: number };
  total: number;
}) {
  const rows = [
    { key: 'critical', label: 'Critical', value: sev.critical, color: 'bg-rose-500' },
    { key: 'high', label: 'High', value: sev.high, color: 'bg-orange-500' },
    { key: 'medium', label: 'Medium', value: sev.medium, color: 'bg-amber-500' },
    { key: 'low', label: 'Low', value: sev.low, color: 'bg-emerald-500' },
    { key: 'info', label: 'Info', value: sev.info, color: 'bg-cyan-500' },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const pct = total > 0 ? (r.value / total) * 100 : 0;
        return (
          <div key={r.key}>
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="text-gray-300 font-medium">{r.label}</span>
              <span className="text-gray-400 tabular-nums">{r.value} ({pct.toFixed(0)}%)</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full ${r.color} transition-all duration-700 ease-out`}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryBars({
  cats,
  total,
}: {
  cats: { security: number; bugs: number; performance: number; codeQuality: number; suggestions: number };
  total: number;
}) {
  const rows = [
    { key: 'security', label: '🔒 Security', value: cats.security, color: 'bg-rose-500/70' },
    { key: 'bugs', label: '🐛 Bugs', value: cats.bugs, color: 'bg-amber-500/70' },
    { key: 'performance', label: '⚡ Performance', value: cats.performance, color: 'bg-blue-500/70' },
    { key: 'codeQuality', label: '🧹 Code quality', value: cats.codeQuality, color: 'bg-violet-500/70' },
    { key: 'suggestions', label: '💡 Suggestions', value: cats.suggestions, color: 'bg-cyan-500/70' },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const pct = total > 0 ? (r.value / total) * 100 : 0;
        return (
          <div key={r.key}>
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="text-gray-300 font-medium">{r.label}</span>
              <span className="text-gray-400 tabular-nums">{r.value}</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full ${r.color} transition-all duration-700 ease-out`}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTime(minutes: number): string {
  if (minutes === 0) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return `${h}h${m ? ` ${m}m` : ''}`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return `${d}d${hh ? ` ${hh}h` : ''}`;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
