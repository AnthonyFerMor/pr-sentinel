'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [geminiKey, setGeminiKey] = useState('');
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
        if (data.geminiKeySet) {
          setMaskedKey(data.geminiKeyMasked);
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
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
      setMessage({ type: 'success', text: 'API key saved securely.' });
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
          <p className="text-gray-400">Loading...</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,80,255,0.15),transparent)] pointer-events-none" />

        <div className="relative max-w-2xl mx-auto px-4 pt-10 pb-20">
          <h2 className="text-2xl font-bold text-white tracking-tight mb-1">Settings</h2>
          <p className="text-gray-400 text-sm mb-8">
            Configure your API keys and preferences. Keys are encrypted and stored securely.
          </p>

          {/* Account info */}
          <section className="bg-gray-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Account</h3>
            <div className="flex items-center gap-4">
              {session?.user?.image && (
                <img src={session.user.image} alt="" className="w-12 h-12 rounded-full border border-white/10" />
              )}
              <div>
                <p className="text-white font-medium">{session?.user?.name || session?.user?.login || 'User'}</p>
                <p className="text-sm text-gray-400">{session?.user?.email || 'GitHub OAuth'}</p>
              </div>
              <span className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-emerald-400 font-medium">Connected</span>
              </span>
            </div>

            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-300 font-medium">GitHub Token</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Provided by OAuth. Used to read PRs and post comments.
                  </p>
                </div>
                <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">
                  Auto
                </span>
              </div>
            </div>
          </section>

          {/* Gemini API key */}
          <section className="bg-gray-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Gemini API Key</h3>
            <p className="text-sm text-gray-400 mb-4">
              Enter your own Gemini API key from{' '}
              <a href="https://ai.google.dev" target="_blank" rel="noreferrer" className="text-violet-400 hover:text-violet-300 underline">
                Google AI Studio
              </a>
              . If empty, the server default key is used.
            </p>

            {maskedKey && (
              <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-gray-800/50 border border-white/5">
                <span className="text-sm text-gray-300 font-mono">{maskedKey}</span>
                <button
                  onClick={handleClear}
                  disabled={saving}
                  className="ml-auto text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            )}

            <div className="flex gap-3">
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder={maskedKey ? 'Enter new key to replace...' : 'AIzaSy...'}
                className="flex-1 px-4 py-3 bg-gray-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-sm font-mono"
              />
              <button
                onClick={handleSave}
                disabled={saving || !geminiKey.trim()}
                className="px-5 py-3 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all text-sm"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>

            {message && (
              <p className={`mt-3 text-sm ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                {message.text}
              </p>
            )}
          </section>

          {/* Info box */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-300">
            <p className="font-medium mb-1">How credentials work</p>
            <ul className="list-disc list-inside text-xs text-blue-300/80 space-y-1">
              <li>Your GitHub token comes from OAuth — no need to paste a PAT.</li>
              <li>Your Gemini API key is encrypted server-side and never exposed to the browser.</li>
              <li>Webhook and cron reviews always use the server default keys.</li>
            </ul>
          </div>
        </div>
      </main>
    </>
  );
}
