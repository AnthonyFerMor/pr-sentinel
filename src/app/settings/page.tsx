'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Aurora from '@/components/Aurora';

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

  // GitHub PAT (only needed for auto-bot on user's own repos)
  const [pat, setPat] = useState('');
  const [maskedPat, setMaskedPat] = useState<string | null>(null);
  const [showPat, setShowPat] = useState(false);
  const [savingPat, setSavingPat] = useState(false);
  const [patMessage, setPatMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [storageAvailable, setStorageAvailable] = useState<boolean | null>(null);

  // Review style preference: full (default markdown) | lite | caveman (ultra-terse, token-saving)
  type ReviewStyle = 'full' | 'lite' | 'caveman';
  const [reviewStyle, setReviewStyle] = useState<ReviewStyle>('full');
  const [savingStyle, setSavingStyle] = useState(false);
  const [styleMessage, setStyleMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Inline mode: inline review comments per line (default) vs. single bottom comment.
  const [inlineMode, setInlineMode] = useState<boolean>(true);
  const [savingInline, setSavingInline] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
        if (data.githubPATSet) setMaskedPat(data.githubPATMasked);
        if (typeof data.storageAvailable === 'boolean') setStorageAvailable(data.storageAvailable);
        if (data.reviewStyle === 'full' || data.reviewStyle === 'lite' || data.reviewStyle === 'caveman') {
          setReviewStyle(data.reviewStyle);
        }
        if (typeof data.inlineMode === 'boolean') {
          setInlineMode(data.inlineMode);
        }
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
      setMessage({ type: 'success', text: 'API key removed. You must add a new one before running reviews.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Clear failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleSavePat = async () => {
    if (!pat.trim()) return;
    setSavingPat(true);
    setPatMessage(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubPAT: pat }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save');
      setMaskedPat(data.githubPATMasked);
      setPat('');
      setPatMessage({ type: 'success', text: 'PAT saved. You can now enable the auto-bot on your repos.' });
    } catch (err) {
      setPatMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSavingPat(false);
    }
  };

  const handleSaveStyle = async (newStyle: ReviewStyle) => {
    setSavingStyle(true);
    setStyleMessage(null);
    const prev = reviewStyle;
    setReviewStyle(newStyle); // optimistic
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewStyle: newStyle }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save');
      const styleLabel = newStyle === 'caveman' ? 'Caveman (token-saving)' : newStyle === 'lite' ? 'Lite' : 'Full markdown';
      setStyleMessage({ type: 'success', text: `Review style set to ${styleLabel}. Applies to all new reviews.` });
    } catch (err) {
      setReviewStyle(prev); // revert on error
      setStyleMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSavingStyle(false);
    }
  };

  const handleSaveInlineMode = async (next: boolean) => {
    setSavingInline(true);
    setInlineMessage(null);
    const prev = inlineMode;
    setInlineMode(next); // optimistic
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inlineMode: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save');
      setInlineMessage({
        type: 'success',
        text: next
          ? 'Inline comments enabled. Each finding will appear next to its line on the PR diff.'
          : 'Inline comments disabled. Reviews will post as a single bottom-of-PR comment.',
      });
    } catch (err) {
      setInlineMode(prev); // revert on error
      setInlineMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSavingInline(false);
    }
  };

  const handleClearPat = async () => {
    setSavingPat(true);
    setPatMessage(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubPAT: '' }),
      });
      if (!response.ok) throw new Error('Failed to clear');
      setMaskedPat(null);
      setPat('');
      setPatMessage({ type: 'success', text: 'PAT removed. Auto-bot will no longer fire on your repos.' });
    } catch (err) {
      setPatMessage({ type: 'error', text: err instanceof Error ? err.message : 'Clear failed' });
    } finally {
      setSavingPat(false);
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
      <main className="relative min-h-screen bg-[var(--surface-0)] text-white overflow-hidden">
        <Aurora />

        <div className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 pt-12 sm:pt-14 pb-24">
          {/* Header */}
          <div className="mb-10 animate-slideUp">
            <span className="step-pill mb-3">Account Configuration</span>
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight mt-2">
              Settings
            </h2>
            <p className="text-gray-400 text-base mt-2 leading-relaxed">
              Manage your account, API keys, and review preferences.
            </p>

            {/* Setup checklist — quick visual on what's configured */}
            <div className="mt-6 flex flex-wrap gap-2">
              <SetupChip done={true} label="GitHub OAuth" />
              <SetupChip done={!!maskedKey} label="Gemini key" required={!maskedKey} />
              <SetupChip done={!!maskedPat} label="GitHub PAT" optional={!maskedPat} />
            </div>
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
                  <span className="text-xs text-emerald-400 font-medium">Active</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-xs text-rose-400 font-medium">Required</span>
                </span>
              )}
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-400 mb-4 leading-relaxed">
                <strong className="text-gray-200">Required.</strong> PR Sentinel runs on your own
                Gemini quota — no shared server key. Get a free key at{' '}
                <a
                  href="https://ai.google.dev"
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-400 hover:text-violet-300 underline underline-offset-2"
                >
                  Google AI Studio
                </a>
                . Stored encrypted server-side (AES-256-GCM), never exposed to the browser after save.
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

          {/* GitHub PAT — required only for auto-bot on user's repos */}
          <section className="mb-6 rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <span className="text-amber-400">🤖</span>
                GitHub PAT (Auto-bot)
              </h3>
              {maskedPat ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="text-xs text-emerald-400 font-medium">PAT set</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-500/10 border border-gray-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-500" />
                  <span className="text-xs text-gray-400 font-medium">Not configured</span>
                </span>
              )}
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-400 mb-3 leading-relaxed">
                Optional. <strong className="text-gray-200">Only needed to enable the auto-bot</strong> on your repositories.
                Generate a fine-grained PAT at{' '}
                <a
                  href="https://github.com/settings/tokens?type=beta"
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-400 hover:text-amber-300 underline underline-offset-2"
                >
                  github.com/settings/tokens
                </a>{' '}
                with scopes: <code className="text-amber-300 text-xs">repo</code>,{' '}
                <code className="text-amber-300 text-xs">webhook (read &amp; write)</code>.
                Stored encrypted server-side (AES-256-GCM).
              </p>

              {storageAvailable === false && (
                <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                  ⚠ Persistent storage (Vercel KV) is not configured on this deployment.
                  Auto-bot features are disabled. Manual reviews still work normally.
                </div>
              )}

              {maskedPat && (
                <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-gray-950/50 border border-white/5">
                  <span className="text-amber-400">✓</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 mb-0.5">Current PAT</p>
                    <p className="text-sm text-gray-200 font-mono truncate">{maskedPat}</p>
                  </div>
                  <button
                    onClick={handleClearPat}
                    disabled={savingPat}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 font-medium px-3 py-1.5 rounded-md hover:bg-red-500/10 transition"
                  >
                    Remove
                  </button>
                </div>
              )}

              <label htmlFor="gh-pat" className="block text-xs text-gray-500 mb-2">
                {maskedPat ? 'Replace PAT' : 'Add your PAT'}
              </label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    id="gh-pat"
                    type={showPat ? 'text' : 'password'}
                    value={pat}
                    onChange={(e) => setPat(e.target.value)}
                    placeholder="github_pat_... or ghp_..."
                    disabled={storageAvailable === false}
                    className="w-full px-4 py-3 pr-10 bg-gray-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm font-mono disabled:opacity-50"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPat((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300"
                    aria-label={showPat ? 'Hide PAT' : 'Show PAT'}
                  >
                    {showPat ? '🙈' : '👁'}
                  </button>
                </div>
                <button
                  onClick={handleSavePat}
                  disabled={savingPat || !pat.trim() || storageAvailable === false}
                  className="px-5 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all text-sm shadow-lg shadow-amber-500/20 disabled:shadow-none"
                >
                  {savingPat ? 'Saving...' : 'Save PAT'}
                </button>
              </div>

              {patMessage && (
                <div className={`mt-3 flex items-start gap-2 text-sm ${
                  patMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  <span aria-hidden="true">{patMessage.type === 'success' ? '✓' : '⚠'}</span>
                  <span>{patMessage.text}</span>
                </div>
              )}
            </div>
          </section>

          {/* Inline comments toggle — anchor findings to specific diff lines */}
          <section className="mb-6 rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <span className="text-violet-400">💬</span>
                Comment Placement
              </h3>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                <span className="text-xs text-violet-300 font-medium">{inlineMode ? 'Inline' : 'Single comment'}</span>
              </span>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-400 mb-4 leading-relaxed">
                Where PR Sentinel attaches its findings. Inline mode posts each finding as a comment
                next to the exact line in the &quot;Files changed&quot; view — much faster to act on. Single
                comment mode posts everything at the bottom of the PR (legacy behavior).
              </p>

              <div className="grid sm:grid-cols-2 gap-2">
                {([
                  {
                    id: true,
                    label: 'Inline comments',
                    icon: '🎯',
                    desc: 'One review with each finding anchored to its line in the diff. Recommended.',
                    pill: 'Recommended',
                  },
                  {
                    id: false,
                    label: 'Single bottom comment',
                    icon: '📜',
                    desc: 'All findings collected into one comment at the bottom of the PR.',
                  },
                ] as const).map((opt) => {
                  const active = inlineMode === opt.id;
                  return (
                    <button
                      key={String(opt.id)}
                      type="button"
                      onClick={() => !savingInline && opt.id !== inlineMode && handleSaveInlineMode(opt.id)}
                      disabled={savingInline}
                      className={`text-left flex items-start gap-3 p-3 rounded-xl border transition disabled:opacity-50 ${
                        active
                          ? 'border-violet-500/50 bg-violet-500/10'
                          : 'border-white/10 bg-gray-950/40 hover:border-white/20 hover:bg-gray-900/60'
                      }`}
                    >
                      <span className="text-xl mt-0.5" aria-hidden="true">{opt.icon}</span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-semibold ${active ? 'text-violet-200' : 'text-gray-200'}`}>
                            {opt.label}
                          </span>
                          {'pill' in opt && opt.pill && (
                            <span className="text-[10px] text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-2 py-0.5 uppercase tracking-wider">
                              {opt.pill}
                            </span>
                          )}
                          {active && (
                            <span className="text-[10px] text-violet-300 bg-violet-500/15 border border-violet-500/30 rounded-full px-2 py-0.5 uppercase tracking-wider">
                              Active
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-gray-400 mt-0.5 leading-relaxed">{opt.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-lg border border-white/5 bg-gray-950/40 p-3 text-xs text-gray-400 leading-relaxed">
                <span className="font-semibold text-gray-300">Note:</span> Inline mode only applies
                to first-time reviews. When PR Sentinel re-reviews a PR after new commits, it edits
                the existing single comment (GitHub doesn&apos;t allow editing inline reviews).
              </div>

              {inlineMessage && (
                <div className={`mt-3 flex items-start gap-2 text-sm ${
                  inlineMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  <span aria-hidden="true">{inlineMessage.type === 'success' ? '✓' : '⚠'}</span>
                  <span>{inlineMessage.text}</span>
                </div>
              )}
            </div>
          </section>

          {/* Review Style — opt-in token-saving caveman mode */}
          <section className="mb-6 rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <span className="text-pink-400">🪶</span>
                Review Output Style
              </h3>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pink-500/10 border border-pink-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-pink-500" />
                <span className="text-xs text-pink-400 font-medium capitalize">{reviewStyle}</span>
              </span>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-400 mb-4 leading-relaxed">
                How PR Sentinel formats the review comment it posts on your PRs. Caveman mode is
                opt-in and trades verbose markdown for a one-line-per-finding format. Faster to read
                for experienced devs and uses ~70% fewer output tokens (cheaper).
              </p>

              <div className="grid gap-2">
                {([
                  {
                    id: 'full' as const,
                    label: 'Full markdown',
                    icon: '📄',
                    desc: 'Detailed review with metadata table, expanded fix explanations. Default.',
                  },
                  {
                    id: 'lite' as const,
                    label: 'Lite',
                    icon: '⚡',
                    desc: 'Same markdown shape, but the analysis itself uses fewer skills + chunks to save tokens.',
                  },
                  {
                    id: 'caveman' as const,
                    label: 'Caveman (token-saving)',
                    icon: '🦴',
                    desc: 'One line per finding: file:L42 severity: problem. Fix: ... Tally at end. ~70% fewer output tokens.',
                  },
                ]).map((opt) => {
                  const active = reviewStyle === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => !savingStyle && handleSaveStyle(opt.id)}
                      disabled={savingStyle}
                      className={`text-left flex items-start gap-3 p-3 rounded-xl border transition disabled:opacity-50 ${
                        active
                          ? 'border-pink-500/50 bg-pink-500/10'
                          : 'border-white/10 bg-gray-950/40 hover:border-white/20 hover:bg-gray-900/60'
                      }`}
                    >
                      <span className="text-xl mt-0.5" aria-hidden="true">{opt.icon}</span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className={`text-sm font-semibold ${active ? 'text-pink-300' : 'text-gray-200'}`}>
                            {opt.label}
                          </span>
                          {active && (
                            <span className="text-[10px] text-pink-400 bg-pink-500/15 border border-pink-500/30 rounded-full px-2 py-0.5 uppercase tracking-wider">
                              Active
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-gray-400 mt-0.5 leading-relaxed">{opt.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {storageAvailable === false && (
                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                  ⚠ Persistent storage (Vercel KV) is not configured. Your style choice will not
                  persist across sessions and the auto-bot will fall back to Full markdown.
                </div>
              )}

              {styleMessage && (
                <div className={`mt-3 flex items-start gap-2 text-sm ${
                  styleMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  <span aria-hidden="true">{styleMessage.type === 'success' ? '✓' : '⚠'}</span>
                  <span>{styleMessage.text}</span>
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
                Auto-bot webhooks fire with <em>your</em> PAT + Gemini key. No shared server quota.
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400">•</span>
                Sessions live in JWTs, preferences in localStorage, secrets encrypted in Vercel KV.
              </li>
            </ul>
          </div>
        </div>
      </main>
    </>
  );
}

function SetupChip({
  done,
  label,
  required,
  optional,
}: {
  done: boolean;
  label: string;
  required?: boolean;
  optional?: boolean;
}) {
  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-medium text-emerald-300">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        {label}
      </span>
    );
  }
  if (required) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/25 text-[11px] font-medium text-rose-300">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-pulseRing absolute inline-flex h-full w-full rounded-full bg-rose-400" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-400" />
        </span>
        {label} required
      </span>
    );
  }
  if (optional) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-medium text-gray-400">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-500" />
        {label} (optional)
      </span>
    );
  }
  return null;
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
