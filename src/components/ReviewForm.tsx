'use client';

import { useState, FormEvent } from 'react';

interface ReviewFormProps {
  onSubmit: (prUrl: string) => void;
  isLoading: boolean;
  onReset: () => void;
}

// Mirrors the server-side regex in src/lib/parser.ts so we reject obviously
// invalid input before making a request.
const PR_URL_RE = /github\.com\/[^/]+\/[^/]+\/pull\/\d+/;

function isValidPrUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const withProto = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  return PR_URL_RE.test(withProto);
}

export default function ReviewForm({
  onSubmit,
  isLoading,
  onReset,
}: ReviewFormProps) {
  const [url, setUrl] = useState('');
  const [touched, setTouched] = useState(false);

  const valid = isValidPrUrl(url);
  const showError = touched && url.trim().length > 0 && !valid;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (valid && !isLoading) {
      onSubmit(url.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative" role="search" aria-label="PR review form">
      {/* Glow border effect */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500 rounded-2xl blur opacity-30 group-hover:opacity-50 transition" />

      <div className="relative bg-gray-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl">
        <label htmlFor="pr-url" className="block text-sm font-medium text-gray-300 mb-2">
          Pull Request URL
        </label>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943" />
              </svg>
            </div>
            <input
              id="pr-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="https://github.com/owner/repo/pull/123"
              aria-invalid={showError}
              aria-describedby={showError ? 'pr-url-error' : undefined}
              className={`w-full pl-12 pr-4 py-3.5 bg-gray-800/50 border rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all text-sm md:text-base ${
                showError
                  ? 'border-rose-500/50 focus:ring-rose-500/50 focus:border-rose-500/50'
                  : 'border-white/10 focus:ring-violet-500/50 focus:border-violet-500/50'
              }`}
              disabled={isLoading}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !valid}
            className="px-6 py-3.5 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 disabled:shadow-none flex items-center justify-center gap-2 min-w-[140px]"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Review PR
              </>
            )}
          </button>
        </div>

        {showError && (
          <p id="pr-url-error" role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-rose-300 animate-fadeIn">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
            That doesn&apos;t look like a PR URL. Expected: github.com/owner/repo/pull/123
          </p>
        )}

        {/* Comment posting is mandatory for the hackathon deliverable. */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            Posts as a PR comment
          </div>

          {isLoading && (
            <button
              type="button"
              onClick={onReset}
              className="text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
