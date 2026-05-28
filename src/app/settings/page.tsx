'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';

interface CacheStats {
  primaryModel?: string;
  cacheMode?: 'explicit' | 'implicit';
  cacheExists?: boolean;
  cacheName?: string | null;
  cacheAgeMinutes?: number;
  cacheHitCount?: number;
  cacheMissCount?: number;
  lastUsage?: {
    cacheHit: boolean;
    cachedTokens: number;
    totalTokens: number;
    at: number;
    modelUsed: string;
  } | null;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [geminiKey, setGeminiKey] = useState('');
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Load current key status on mount
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.geminiKeySet) setMaskedKey(data.geminiKeyMasked);
      })
      .catch(() => {});

    // Load cache stats (hackathon proof-of-context-caching)
    fetch('/api/cache/stats')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setCacheStats(data); })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!geminiKey.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiApiKey: geminiKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save');
      setMaskedKey(data.geminiKeyMasked);
      setGeminiKey('');
      setMessage({ type: 'success', text: 'API key saved securely. Your reviews now use this key.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiApiKey: '' }),
      });
      if (!response.ok) throw new Error('Failed to clear');
      setMaskedKey(null);
      setGeminiKey('');
      setMessage({ type: 'success', text: 'API key removed. Server default will be used.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Clear failed' });
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading session...
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,80,255,0.15),transparent)] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-4 pt-10 pb-20">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Settings</h2>
            <p className="text-gray-400 text-sm mt-1">
              Manage your account, API keys, and view system status.
            </p>
          </div>

          {/* Account */}
          <section className="mb-6 rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Account</h3>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-emerald-400 font-medium">Connected</span>
              </span>
            </div>

            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                {session?.user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-14 h-14 rounded-full border-2 border-violet-500/30 shadow-lg shadow-violet-500/20"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-xl font-bold text-white">
                    {(session?.user?.name?.[0] || session?.user?.login?.[0] || '?').toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold truncate">
                    {session?.user?.name || session?.user?.login || 'User'}
                  </p>
                  {session?.user?.email && (
                    <p className="text-sm text-gray-400 truncate">{session.user.email}</p>
                  )}
                  {session?.user?.login && (
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">@{session.user.login}</p>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/5 grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-950/40 border border-white/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-500 uppercase tracking-wider">GitHub Token</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                      Auto
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    From OAuth. Used to read PRs and post comments.
                  </p>
                </div>
                <div className="rounded-lg bg-gray-950/40 border border-white/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-500 uppercase tracking-wider">Auth method</span>
                    <span className="text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full px-2 py-0.5">
                      GitHub OAuth
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    JWT session, scope: <code className="text-violet-300">repo</code>
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Gemini API key */}
          <section className="mb-6 rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <span className="text-violet-400">🔑</span>
                Gemini API Key
              </h3>
              {maskedKey ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="text-xs text-emerald-400 font-medium">Your key</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  <span className="text-xs text-amber-400 font-medium">Using fallback</span>
                </span>
              )}
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-400 mb-4 leading-relaxed">
                Get a free key from{' '}
                <a
                  href="https://ai.google.dev"
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-400 hover:text-violet-300 underline underline-offset-2"
                >
                  Google AI Studio
                </a>
                . Stored encrypted in an httpOnly cookie, never sent to the browser after save.
                Without your own key, reviews use the shared server fallback (slower under load).
              </p>

              {maskedKey && (
                <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-gray-950/50 border border-white/5">
                  <span className="text-violet-400">✓</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 mb-0.5">Current key</p>
                    <p className="text-sm text-gray-200 font-mono truncate">{maskedKey}</p>
                  </div>
                  <button
                    onClick={handleClear}
                    disabled={saving}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 font-medium px-3 py-1.5 rounded-md hover:bg-red-500/10 transition"
                  >
                    Remove
                  </button>
                </div>
              )}

              <label htmlFor="gemini-key" className="block text-xs text-gray-500 mb-2">
                {maskedKey ? 'Replace key' : 'Add your key'}
              </label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    id="gemini-key"
                    type={showKey ? 'text' : 'password'}
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full px-4 py-3 pr-10 bg-gray-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-sm font-mono"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300"
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? '🙈' : '👁'}
                  </button>
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving || !geminiKey.trim()}
                  className="px-5 py-3 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all text-sm shadow-lg shadow-violet-500/20 disabled:shadow-none"
                >
                  {saving ? 'Saving...' : 'Save key'}
                </button>
              </div>

              {message && (
                <div className={`mt-3 flex items-start gap-2 text-sm ${
                  message.type === 'success' ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  <span aria-hidden="true">{message.type === 'success' ? '✓' : '⚠'}</span>
                  <span>{message.text}</span>
                </div>
              )}
            </div>
          </section>

          {/* Context cache stats — proof of caching working */}
          {cacheStats && (
            <section className="mb-6 rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                  <span className="text-cyan-400">⚡</span>
                  Context cache
                </h3>
                <span className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2 py-0.5 uppercase tracking-wider">
                  {cacheStats.cacheMode === 'explicit' ? 'Explicit caching' : 'Implicit caching'}
                </span>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <CacheStat label="Hits" value={cacheStats.cacheHitCount ?? 0} color="emerald" />
                  <CacheStat label="Misses" value={cacheStats.cacheMissCount ?? 0} color="amber" />
                  <CacheStat
                    label="Cache age"
                    value={cacheStats.cacheAgeMinutes != null && cacheStats.cacheExists ? `${cacheStats.cacheAgeMinutes}m` : '—'}
                    color="violet"
                  />
                  <CacheStat
                    label="Last cached"
                    value={cacheStats.lastUsage?.cachedTokens != null ? cacheStats.lastUsage.cachedTokens.toLocaleString() : '—'}
                    color="cyan"
                  />
                </div>

                {cacheStats.cacheName && (
                  <div className="rounded-lg bg-gray-950/50 border border-white/5 p-3 mb-3">
                    <p className="text-xs text-gray-500 mb-1">Active cache name</p>
                    <code className="text-xs text-cyan-300 font-mono break-all">{cacheStats.cacheName}</code>
                  </div>
                )}

                {cacheStats.lastUsage && (
                  <div className="rounded-lg bg-gray-950/50 border border-white/5 p-3 text-xs text-gray-400">
                    <p className="text-gray-500 mb-1">Last review</p>
                    <p>
                      Cache hit: <span className={cacheStats.lastUsage.cacheHit ? 'text-emerald-400' : 'text-amber-400'}>
                        {cacheStats.lastUsage.cacheHit ? '✓ Yes' : '✗ No (miss)'}
                      </span>
                      {' · '}
                      Total tokens: <span className="text-gray-300 tabular-nums">{cacheStats.lastUsage.totalTokens.toLocaleString()}</span>
                      {' · '}
                      Model: <span className="text-violet-300 font-mono">{cacheStats.lastUsage.modelUsed}</span>
                    </p>
                  </div>
                )}

                {!cacheStats.cacheExists && (
                  <p className="text-xs text-gray-500">
                    No active cache yet. Run a review to populate it — the system prompt + rubric will be cached for ~1 hour.
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Info box */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-300">
            <p className="font-semibold mb-2 flex items-center gap-2">
              <span>🔐</span> How credentials work
            </p>
            <ul className="space-y-1.5 text-xs text-blue-300/80">
              <li className="flex gap-2">
                <span className="text-blue-400">•</span>
                Your GitHub token comes from OAuth — no PAT needed.
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400">•</span>
                Your Gemini API key is encrypted server-side and never exposed to the browser.
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400">•</span>
                Webhook and cron reviews always use the server default keys.
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400">•</span>
                No databases — sessions live in JWTs, preferences in localStorage, keys in iron-session cookies.
              </li>
            </ul>
          </div>
        </div>
      </main>
    </>
  );
}

function CacheStat({ label, value, color }: { label: string; value: string | number; color: 'emerald' | 'amber' | 'violet' | 'cyan' }) {
  const colors: Record<string, string> = {
    emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
    amber: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
    violet: 'border-violet-500/20 bg-violet-500/5 text-violet-400',
    cyan: 'border-cyan-500/20 bg-cyan-500/5 text-cyan-400',
  };
  return (
    <div className={`rounded-lg border ${colors[color]} p-3`}>
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
