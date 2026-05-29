'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ReviewResult, PRMetadata, ReviewFinding } from '@/lib/types';
import { humanizeReviewError } from '@/lib/error-messages';

interface ReviewStreamProps {
  isLoading: boolean;
  startedAt: number | null;
  statusMessages: string[];
  streamedContent: string;
  review: ReviewResult | null;
  metadata: PRMetadata | null;
  cacheInfo: { cached: boolean; cachedTokens: number; totalTokens: number } | null;
  error: string | null;
  onRetry?: () => void;
}

const sevConfig: Record<string, { emoji: string; color: string; bg: string; border: string }> = {
  critical: { emoji: '🔴', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  high: { emoji: '🟠', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  medium: { emoji: '🟡', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  low: { emoji: '🔵', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  info: { emoji: 'ℹ️', color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20' },
};

const riskConfig: Record<string, { emoji: string; color: string; label: string }> = {
  critical: { emoji: '🔴', color: 'text-red-400', label: 'CRITICAL' },
  high: { emoji: '🟠', color: 'text-orange-400', label: 'HIGH' },
  medium: { emoji: '🟡', color: 'text-yellow-400', label: 'MEDIUM' },
  low: { emoji: '🟢', color: 'text-green-400', label: 'LOW' },
  clean: { emoji: '✅', color: 'text-emerald-400', label: 'CLEAN' },
};

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <span className="text-xs text-gray-500 font-mono tabular-nums">
      {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
    </span>
  );
}

function FindingsSummary({ review }: { review: ReviewResult }) {
  const counts = {
    security: review.categories.security.length,
    bugs: review.categories.bugs.length,
    performance: review.categories.performance.length,
    codeQuality: review.categories.codeQuality.length,
    suggestions: review.categories.suggestions.length,
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-gray-400 font-medium">{total} findings:</span>
      {counts.security > 0 && <Badge label={`${counts.security} security`} color="red" />}
      {counts.bugs > 0 && <Badge label={`${counts.bugs} bugs`} color="orange" />}
      {counts.performance > 0 && <Badge label={`${counts.performance} perf`} color="yellow" />}
      {counts.codeQuality > 0 && <Badge label={`${counts.codeQuality} quality`} color="blue" />}
      {counts.suggestions > 0 && <Badge label={`${counts.suggestions} suggestions`} color="gray" />}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  const colors: Record<string, string> = {
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    gray: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full border ${colors[color] ?? colors.gray}`}>
      {label}
    </span>
  );
}

const SEV_EMOJI: Record<string, string> = {
  critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: 'ℹ️',
};

/** Build a human-readable Markdown version of the review for pasting elsewhere. */
function reviewToMarkdown(review: ReviewResult): string {
  const lines: string[] = [];
  lines.push(`# PR Sentinel review`);
  lines.push('');
  lines.push(`**Overall risk:** ${review.overallRiskLevel}`);
  lines.push('');
  lines.push(review.summary);
  lines.push('');

  const sections: Array<[string, ReviewFinding[]]> = [
    ['🔒 Security', review.categories.security],
    ['🐛 Bugs', review.categories.bugs],
    ['⚡ Performance', review.categories.performance],
    ['🧹 Code Quality', review.categories.codeQuality],
    ['💡 Suggestions', review.categories.suggestions],
  ];

  for (const [title, findings] of sections) {
    if (findings.length === 0) continue;
    lines.push(`## ${title} (${findings.length})`);
    lines.push('');
    for (const f of findings) {
      const loc = f.lineNumber ? `${f.file}:${f.lineNumber}` : f.lineRange ? `${f.file} ${f.lineRange}` : f.file;
      lines.push(`### ${SEV_EMOJI[f.severity] ?? ''} ${f.severity.toUpperCase()} — ${f.title}`);
      lines.push(`- **Location:** \`${loc}\`${f.cweId ? ` · ${f.cweId}` : ''}`);
      lines.push(`- **What:** ${f.description}`);
      if (f.impact) lines.push(`- **Impact:** ${f.impact}`);
      if (f.suggestion) lines.push(`- **Fix:** ${f.suggestion}`);
      if (f.replacementCode) {
        lines.push('');
        lines.push('```suggestion');
        lines.push(f.replacementCode);
        lines.push('```');
      }
      lines.push('');
    }
  }

  if (review.positiveAspects.length > 0) {
    lines.push(`## ✅ Positive aspects`);
    lines.push('');
    for (const p of review.positiveAspects) lines.push(`- ${p}`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`_Generated by PR Sentinel · model ${review.metadata.modelUsed}_`);
  return lines.join('\n');
}

function CopyButton({
  review,
  format,
  label,
}: {
  review: ReviewResult;
  format: 'json' | 'markdown';
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text =
      format === 'markdown' ? reviewToMarkdown(review) : JSON.stringify(review, null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/10 transition-colors"
      aria-label={`Copy review as ${format}`}
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

function FindingCard({ finding, category }: { finding: ReviewFinding; category: string }) {
  const sev = sevConfig[finding.severity] ?? sevConfig.info;

  return (
    <div className={`${sev.bg} ${sev.border} border rounded-xl p-4 md:p-5 animate-fadeIn`} role="article" aria-label={`${finding.severity} finding: ${finding.title}`}>
      <div className="flex items-start gap-3">
        <span className="text-lg mt-0.5" aria-hidden="true">{sev.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className={`font-semibold ${sev.color}`}>{finding.title}</h4>
            <span className={`text-xs px-2 py-0.5 rounded-full ${sev.bg} ${sev.color} border ${sev.border}`}>
              {finding.severity.toUpperCase()}
            </span>
            {finding.cweId && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                {finding.cweId}
              </span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/20 capitalize">
              {category}
            </span>
          </div>

          <p className="text-xs text-gray-500 mt-1 font-mono">
            📄 {finding.file}
            {finding.lineRange && <span> ({finding.lineRange})</span>}
          </p>

          <p className="text-sm text-gray-300 mt-2 leading-relaxed">{finding.description}</p>

          {finding.impact && (
            <div className="mt-2 bg-red-500/5 rounded-lg p-2.5 border border-red-500/10">
              <p className="text-xs text-red-300/80"><span className="font-semibold text-red-400">Impact:</span> {finding.impact}</p>
            </div>
          )}

          <div className="mt-3 bg-gray-900/50 rounded-lg p-3 border border-white/5">
            <p className="text-xs text-gray-400 mb-1 font-semibold">💡 Suggested fix:</p>
            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono overflow-x-auto">{finding.suggestion}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReviewStream({
  isLoading,
  startedAt,
  statusMessages,
  streamedContent,
  review,
  metadata,
  cacheInfo,
  error,
  onRetry,
}: ReviewStreamProps) {
  const liveText =
    streamedContent.length > 15_000 ? streamedContent.slice(-15_000) : streamedContent;

  // Severity filter for the findings list. Empty set = show all.
  const [sevFilter, setSevFilter] = useState<Set<string>>(new Set());
  const toggleSev = (s: string) =>
    setSevFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  const passesFilter = (f: ReviewFinding) => sevFilter.size === 0 || sevFilter.has(f.severity);

  return (
    <div className="mt-6 space-y-4" role="region" aria-label="Review results" aria-live="polite">
      {/* Status log */}
      {statusMessages.length > 0 && (
        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl">
          <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
            {isLoading && (
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
              </span>
            )}
            Activity Log
            {isLoading && startedAt && (
              <span className="ml-auto">
                <ElapsedTimer startedAt={startedAt} />
              </span>
            )}
          </h3>
          <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin" role="log">
            {statusMessages.map((msg, i) => (
              <p key={i} className="text-xs text-gray-400 font-mono animate-fadeIn">
                {msg}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Cache info badge */}
      {cacheInfo && (
        <div className="flex items-center gap-3 flex-wrap" aria-label="Cache information">
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
            cacheInfo.cached
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
          }`}>
            {cacheInfo.cached ? '✅ Cache Hit' : '❌ Cache Miss'}
          </div>
          <span className="text-xs text-gray-500">
            Cached: {cacheInfo.cachedTokens.toLocaleString()} tokens | Total: {cacheInfo.totalTokens.toLocaleString()} tokens
          </span>
        </div>
      )}

      {/* Live streamed model output */}
      {isLoading && !review && !error && streamedContent.trim().length > 0 && (
        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-semibold text-gray-400">Live Output</h3>
            {streamedContent.length > liveText.length && (
              <span className="text-xs text-gray-500">Showing last 15k chars</span>
            )}
          </div>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono max-h-72 overflow-y-auto">
            {liveText}
          </pre>
        </div>
      )}

      {/* Error */}
      {error && (() => {
        const friendly = humanizeReviewError(error);
        return (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 animate-fadeIn" role="alert">
            <h3 className="text-red-400 font-semibold flex items-center gap-2">
              <span aria-hidden="true">⚠️</span> {friendly.title}
            </h3>
            <p className="text-sm text-red-200/90 mt-2 leading-relaxed">{friendly.message}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-500/20 border border-red-500/30 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/30 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Try again
                </button>
              )}
              {friendly.action && (
                <Link
                  href={friendly.action.href}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white hover:bg-white/[0.08] transition-colors"
                >
                  {friendly.action.label}
                  <span aria-hidden="true">→</span>
                </Link>
              )}
            </div>
            {/* Raw error available for debugging without dominating the UI */}
            {friendly.title !== 'Review failed' && (
              <details className="mt-3">
                <summary className="text-xs text-red-300/50 cursor-pointer hover:text-red-300/80 transition">
                  Technical details
                </summary>
                <p className="text-xs text-red-300/60 mt-1.5 font-mono break-words">{error}</p>
              </details>
            )}
          </div>
        );
      })()}

      {/* Review result */}
      {review && (
        <div className="space-y-4 animate-fadeIn">
          {/* Summary card */}
          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
            {/* PR info */}
            {metadata && (
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                <span aria-hidden="true">📋</span>
                <span className="font-mono">{metadata.title}</span>
                <span>by {metadata.author}</span>
                <span>•</span>
                <span>{metadata.headBranch} → {metadata.baseBranch}</span>
              </div>
            )}

            {/* Risk level */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl" aria-hidden="true">{riskConfig[review.overallRiskLevel]?.emoji ?? '❓'}</span>
              <div>
                <h2 className={`text-xl font-bold ${riskConfig[review.overallRiskLevel]?.color ?? 'text-gray-400'}`}>
                  Overall Risk: {riskConfig[review.overallRiskLevel]?.label ?? review.overallRiskLevel}
                </h2>
                <p className="text-sm text-gray-400 mt-1">{review.summary}</p>
              </div>
            </div>

            {/* Findings summary */}
            <FindingsSummary review={review} />

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3 mt-4">
              {review.metadata.commentUrl && (
                <a
                  href={review.metadata.commentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/15 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336" />
                  </svg>
                  View GitHub Comment
                </a>
              )}
              <CopyButton review={review} format="markdown" label="Copy Markdown" />
              <CopyButton review={review} format="json" label="Copy JSON" />
            </div>

            {review.metadata.commentError && (
              <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200" role="alert">
                GitHub comment was not posted. Check token repository access and Issues write permission.
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/5">
              <StatBox label="Model" value={review.metadata.modelUsed} />
              <StatBox label="Processing" value={`${(review.metadata.processingTimeMs / 1000).toFixed(1)}s`} />
              <StatBox label="Tokens" value={review.metadata.totalTokens.toLocaleString()} />
              <StatBox label="Chunks" value={String(review.metadata.chunksProcessed)} />
            </div>
          </div>

          {/* Clean PR — no findings of any severity */}
          {(() => {
            const totalFindings =
              review.categories.security.length +
              review.categories.bugs.length +
              review.categories.performance.length +
              review.categories.codeQuality.length +
              review.categories.suggestions.length;
            if (totalFindings === 0) {
              return (
                <div className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 border border-emerald-500/30 rounded-2xl p-8 text-center" role="status">
                  <div className="text-5xl mb-3" aria-hidden="true">✨</div>
                  <h3 className="text-xl font-bold text-emerald-300">No issues found</h3>
                  <p className="text-sm text-emerald-200/70 mt-2 max-w-md mx-auto">
                    PR Sentinel analyzed the diff and found no security, correctness, performance, or quality issues to flag. Ship it!
                  </p>
                </div>
              );
            }
            return null;
          })()}

          {/* Severity filter */}
          {(() => {
            const all = [
              ...review.categories.security,
              ...review.categories.bugs,
              ...review.categories.performance,
              ...review.categories.codeQuality,
              ...review.categories.suggestions,
            ];
            if (all.length === 0) return null;
            const counts: Record<string, number> = {};
            for (const f of all) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
            const order = ['critical', 'high', 'medium', 'low', 'info'];
            const present = order.filter((s) => counts[s] > 0);
            if (present.length <= 1) return null; // nothing to filter

            const matched = all.filter(passesFilter).length;
            return (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter findings by severity">
                <span className="text-xs text-gray-500 mr-1">Filter:</span>
                {present.map((s) => {
                  const active = sevFilter.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSev(s)}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        active
                          ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                          : 'border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.07]'
                      }`}
                    >
                      <span aria-hidden="true">{SEV_EMOJI[s]}</span>
                      <span className="capitalize">{s}</span>
                      <span className="tabular-nums opacity-70">{counts[s]}</span>
                    </button>
                  );
                })}
                {sevFilter.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSevFilter(new Set())}
                    className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 ml-1"
                  >
                    Clear ({matched} shown)
                  </button>
                )}
              </div>
            );
          })()}

          {/* Findings by category */}
          {renderCategory('🔒 Security', review.categories.security, 'security', passesFilter)}
          {renderCategory('🐛 Bugs', review.categories.bugs, 'bugs', passesFilter)}
          {renderCategory('⚡ Performance', review.categories.performance, 'performance', passesFilter)}
          {renderCategory('🧹 Code Quality', review.categories.codeQuality, 'codeQuality', passesFilter)}
          {renderCategory('💡 Suggestions', review.categories.suggestions, 'suggestions', passesFilter)}

          {/* Positive aspects */}
          {review.positiveAspects.length > 0 && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
              <h3 className="text-emerald-400 font-semibold mb-3">✨ Positive Aspects</h3>
              <ul className="space-y-1">
                {review.positiveAspects.map((a, i) => (
                  <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5" aria-hidden="true">•</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && !review && !error && (
        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl" aria-busy="true">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-violet-500/20 animate-pulse" />
              <div className="absolute inset-0 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
            </div>
            <div>
              <div className="h-4 w-48 bg-gray-700 rounded animate-pulse" />
              <div className="h-3 w-32 bg-gray-800 rounded animate-pulse mt-2" />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-800/50 rounded-xl animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function renderCategory(
  title: string,
  findings: ReviewFinding[],
  category: string,
  passesFilter: (f: ReviewFinding) => boolean = () => true,
) {
  if (findings.length === 0) return null;
  const visible = findings.filter(passesFilter);
  if (visible.length === 0) return null; // all filtered out

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
        {title}
        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-500">
          {visible.length === findings.length ? findings.length : `${visible.length}/${findings.length}`}
        </span>
      </h3>
      {visible.map((f, i) => (
        <FindingCard key={i} finding={f} category={category} />
      ))}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/40 rounded-lg p-3 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
    </div>
  );
}
