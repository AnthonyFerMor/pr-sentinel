'use client';

export interface PreflightData {
  filesChanged: number;
  analyzableFiles: number;
  skippedFiles: number;
  estimatedTokens: number;
  plannedChunks: number;
  sizeCategory: 'small' | 'medium' | 'large' | 'huge';
  fitsFull: boolean;
  recommendedMode: 'full' | 'lite';
  recommendedMaxChunks: number;
  message: string;
  alreadyReviewed?: { headSha: string; url: string } | null;
}

interface PreflightPanelProps {
  data: PreflightData;
  /** Run with the recommended (fitting) configuration. */
  onRunRecommended: () => void;
  /** Run with whatever mode/skills the user currently has selected. */
  onRunAnyway: () => void;
  onCancel: () => void;
}

const CATEGORY_STYLE: Record<PreflightData['sizeCategory'], string> = {
  small: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  medium: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
  large: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
  huge: 'text-rose-300 bg-rose-500/15 border-rose-500/30',
};

export default function PreflightPanel({
  data,
  onRunRecommended,
  onRunAnyway,
  onCancel,
}: PreflightPanelProps) {
  return (
    <div
      className="mt-4 rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.07] to-orange-500/[0.03] p-5 animate-fadeIn"
      role="region"
      aria-label="PR size pre-check"
    >
      <div className="flex items-center gap-2 mb-3">
        <span aria-hidden="true">📐</span>
        <h4 className="text-sm font-semibold text-white">Pre-check: PR size</h4>
        <span
          className={`ml-auto text-[10px] font-semibold uppercase tracking-wider rounded-full border px-2 py-0.5 ${CATEGORY_STYLE[data.sizeCategory]}`}
        >
          {data.sizeCategory}
        </span>
      </div>

      {data.alreadyReviewed && (
        <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm text-gray-300">
          PR Sentinel already reviewed this exact commit.{' '}
          <a
            href={data.alreadyReviewed.url}
            target="_blank"
            rel="noreferrer"
            className="text-violet-300 hover:text-violet-200 underline underline-offset-2"
          >
            View the existing review
          </a>
          . Running again will refresh it in place (no duplicate).
        </div>
      )}

      <p className="text-sm text-gray-300 leading-relaxed">{data.message}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
        <Stat label="Files" value={`${data.analyzableFiles}/${data.filesChanged}`} hint="analyzable" />
        <Stat label="Est. tokens" value={data.estimatedTokens.toLocaleString()} />
        <Stat label="Chunks" value={String(data.plannedChunks)} />
        <Stat label="Recommended" value={data.recommendedMode === 'lite' ? 'Lite' : 'Full'} hint={`${data.recommendedMaxChunks} chunk(s)`} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onRunRecommended}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 hover:from-violet-400 hover:to-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition shadow-lg shadow-violet-500/30"
        >
          Run recommended ({data.recommendedMode === 'lite' ? 'Lite' : 'Full'})
        </button>
        <button
          type="button"
          onClick={onRunAnyway}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] px-4 py-2.5 text-sm font-semibold text-white transition"
        >
          Run with my settings
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-400 hover:text-gray-200 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-center">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</p>
      <p className="text-sm font-bold text-white mt-0.5 tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}
