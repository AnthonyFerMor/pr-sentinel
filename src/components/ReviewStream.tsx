'use client';

import { ReviewResult, PRMetadata, ReviewFinding } from '@/lib/types';

interface ReviewStreamProps {
  isLoading: boolean;
  statusMessages: string[];
  streamedContent: string;
  review: ReviewResult | null;
  metadata: PRMetadata | null;
  cacheInfo: { cached: boolean; cachedTokens: number; totalTokens: number } | null;
  error: string | null;
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

function FindingCard({ finding, category }: { finding: ReviewFinding; category: string }) {
  const sev = sevConfig[finding.severity] ?? sevConfig.info;

  return (
    <div className={`${sev.bg} ${sev.border} border rounded-xl p-4 md:p-5 animate-fadeIn`}>
      <div className="flex items-start gap-3">
        <span className="text-lg mt-0.5">{sev.emoji}</span>
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
  statusMessages,
  review,
  metadata,
  cacheInfo,
  error,
}: ReviewStreamProps) {
  return (
    <div className="mt-6 space-y-4">
      {/* Status log */}
      {statusMessages.length > 0 && (
        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl">
          <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
            {isLoading && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
              </span>
            )}
            Activity Log
          </h3>
          <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
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
        <div className="flex items-center gap-3 flex-wrap">
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

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 animate-fadeIn">
          <h3 className="text-red-400 font-semibold flex items-center gap-2">
            <span>❌</span> Error
          </h3>
          <p className="text-sm text-red-300 mt-2">{error}</p>
        </div>
      )}

      {/* Review result */}
      {review && (
        <div className="space-y-4 animate-fadeIn">
          {/* Summary card */}
          <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
            {/* PR info */}
            {metadata && (
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                <span>📋</span>
                <span className="font-mono">{metadata.title}</span>
                <span>by {metadata.author}</span>
                <span>•</span>
                <span>{metadata.headBranch} → {metadata.baseBranch}</span>
              </div>
            )}

            {/* Risk level */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">{riskConfig[review.overallRiskLevel]?.emoji ?? '❓'}</span>
              <div>
                <h2 className={`text-xl font-bold ${riskConfig[review.overallRiskLevel]?.color ?? 'text-gray-400'}`}>
                  Overall Risk: {riskConfig[review.overallRiskLevel]?.label ?? review.overallRiskLevel}
                </h2>
                <p className="text-sm text-gray-400 mt-1">{review.summary}</p>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/5">
              <StatBox label="Model" value={review.metadata.modelUsed} />
              <StatBox label="Processing" value={`${(review.metadata.processingTimeMs / 1000).toFixed(1)}s`} />
              <StatBox label="Tokens" value={review.metadata.totalTokens.toLocaleString()} />
              <StatBox label="Chunks" value={String(review.metadata.chunksProcessed)} />
            </div>
          </div>

          {/* Findings by category */}
          {renderCategory('🔒 Security', review.categories.security, 'security')}
          {renderCategory('🐛 Bugs', review.categories.bugs, 'bugs')}
          {renderCategory('⚡ Performance', review.categories.performance, 'performance')}
          {renderCategory('🧹 Code Quality', review.categories.codeQuality, 'codeQuality')}
          {renderCategory('💡 Suggestions', review.categories.suggestions, 'suggestions')}

          {/* Positive aspects */}
          {review.positiveAspects.length > 0 && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
              <h3 className="text-emerald-400 font-semibold mb-3">✨ Positive Aspects</h3>
              <ul className="space-y-1">
                {review.positiveAspects.map((a, i) => (
                  <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">•</span>
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
        <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
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

function renderCategory(title: string, findings: ReviewFinding[], category: string) {
  if (findings.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
        {title}
        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-500">
          {findings.length}
        </span>
      </h3>
      {findings.map((f, i) => (
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
