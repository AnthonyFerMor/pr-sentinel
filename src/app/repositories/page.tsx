'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Aurora from '@/components/Aurora';
import { PullRequestSummary, RepositorySummary } from '@/lib/types';

type RepoSource = 'github' | 'manual';
type RepoItem = RepositorySummary & { source: RepoSource };

type JobState = {
  status: 'queued' | 'running' | 'done' | 'error';
  message: string;
  commentUrl?: string;
};

const STORAGE_REPOS = 'pr-sentinel:manual-repos';
const STORAGE_MONITORED = 'pr-sentinel:monitored-repos';
const POLL_INTERVAL_MS = 60_000;

function repoKey(repo: Pick<RepositorySummary, 'owner' | 'name'>) {
  return `${repo.owner}/${repo.name}`;
}

function parseRepoInput(input: string): Pick<RepositorySummary, 'owner' | 'name' | 'fullName' | 'htmlUrl'> {
  const normalized = input.trim().startsWith('http') ? input.trim() : `https://${input.trim()}`;
  const match = normalized.match(/github\.com\/([^/]+)\/([^/#?]+)/);
  if (!match) throw new Error('Use a GitHub repo URL like https://github.com/owner/repo');

  const owner = match[1];
  const name = match[2].replace(/\.git$/, '');
  return {
    owner,
    name,
    fullName: `${owner}/${name}`,
    htmlUrl: `https://github.com/${owner}/${name}`,
  };
}

function statusLabel(state: PullRequestSummary['reviewState']) {
  if (state === 'reviewed') return 'Reviewed';
  if (state === 'needs_update') return 'Updated since review';
  return 'Needs review';
}

function statusClass(state: PullRequestSummary['reviewState']) {
  if (state === 'reviewed') return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25';
  if (state === 'needs_update') return 'bg-amber-500/10 text-amber-300 border-amber-500/25';
  return 'bg-rose-500/10 text-rose-300 border-rose-500/25';
}

async function readSseReview(prUrl: string): Promise<string> {
  const response = await fetch('/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prUrl }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const eventLine of events) {
      if (!eventLine.startsWith('data: ')) continue;
      const event = JSON.parse(eventLine.slice(6));

      if (event.type === 'error') {
        throw new Error(event.message);
      }

      if (event.type === 'complete') {
        return event.data.metadata.commentUrl ?? prUrl;
      }
    }
  }

  throw new Error('Review stream ended before completion');
}

export default function RepositoriesPage() {
  const [repositories, setRepositories] = useState<RepoItem[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [pullsByRepo, setPullsByRepo] = useState<Record<string, PullRequestSummary[]>>({});
  const [monitored, setMonitored] = useState<Record<string, boolean>>({});
  const [repoErrors, setRepoErrors] = useState<Record<string, string>>({});
  const [jobs, setJobs] = useState<Record<string, JobState>>({});
  const [isLoadingRepos, setIsLoadingRepos] = useState(true);
  const inFlight = useRef<Set<string>>(new Set());

  const [autoBotRepos, setAutoBotRepos] = useState<Set<string>>(new Set());
  const [autoBotPending, setAutoBotPending] = useState<Record<string, boolean>>({});
  const [autoBotErrors, setAutoBotErrors] = useState<Record<string, string>>({});
  const [autoBotAvailable, setAutoBotAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/repos/status')
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.storageAvailable === 'boolean') setAutoBotAvailable(data.storageAvailable);
        if (Array.isArray(data.enabledRepos)) {
          const set = new Set<string>(
            data.enabledRepos.map((r: { owner: string; repo: string }) => `${r.owner}/${r.repo}`),
          );
          setAutoBotRepos(set);
        }
      })
      .catch(() => setAutoBotAvailable(false));
  }, []);

  const toggleAutoBot = useCallback(
    async (repo: RepoItem) => {
      const key = repoKey(repo);
      const currentlyEnabled = autoBotRepos.has(key);
      setAutoBotPending((p) => ({ ...p, [key]: true }));
      setAutoBotErrors((e) => ({ ...e, [key]: '' }));

      try {
        const endpoint = currentlyEnabled ? '/api/repos/disable' : '/api/repos/enable';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner: repo.owner, repo: repo.name }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);

        setAutoBotRepos((prev) => {
          const next = new Set(prev);
          if (currentlyEnabled) next.delete(key);
          else next.add(key);
          return next;
        });
      } catch (err) {
        setAutoBotErrors((e) => ({
          ...e,
          [key]: err instanceof Error ? err.message : 'Failed to toggle auto-bot',
        }));
      } finally {
        setAutoBotPending((p) => ({ ...p, [key]: false }));
      }
    },
    [autoBotRepos],
  );

  useEffect(() => {
    const storedRepos = JSON.parse(localStorage.getItem(STORAGE_REPOS) ?? '[]') as RepoItem[];
    const storedMonitored = JSON.parse(localStorage.getItem(STORAGE_MONITORED) ?? '{}') as Record<string, boolean>;
    setRepositories(storedRepos);
    setMonitored(storedMonitored);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_MONITORED, JSON.stringify(monitored));
  }, [monitored]);

  const loadRepositories = useCallback(async () => {
    setIsLoadingRepos(true);
    try {
      const response = await fetch('/api/github/repos');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not load repositories');

      setRepositories((previous) => {
        const manualRepos = previous.filter((repo) => repo.source === 'manual');
        const githubRepos = (data.repositories as RepositorySummary[]).map((repo) => ({
          ...repo,
          source: 'github' as const,
        }));

        const merged = [...githubRepos, ...manualRepos].filter(
          (repo, index, all) => all.findIndex((item) => repoKey(item) === repoKey(repo)) === index,
        );

        localStorage.setItem(STORAGE_REPOS, JSON.stringify(merged.filter((repo) => repo.source === 'manual')));
        return merged;
      });
    } catch (error) {
      setRepoErrors((previous) => ({
        ...previous,
        global: error instanceof Error ? error.message : 'Could not load repositories',
      }));
    } finally {
      setIsLoadingRepos(false);
    }
  }, []);

  const loadPulls = useCallback(async (repo: RepoItem) => {
    const key = repoKey(repo);
    setRepoErrors((previous) => ({ ...previous, [key]: '' }));

    try {
      const params = new URLSearchParams({ owner: repo.owner, repo: repo.name });
      const response = await fetch(`/api/github/pulls?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not load pull requests');
      setPullsByRepo((previous) => ({ ...previous, [key]: data.pullRequests }));
      return data.pullRequests as PullRequestSummary[];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load pull requests';
      setRepoErrors((previous) => ({ ...previous, [key]: message }));
      return [];
    }
  }, []);

  const reviewPull = useCallback(async (pull: PullRequestSummary) => {
    const jobKey = pull.url;
    if (inFlight.current.has(jobKey)) return;

    inFlight.current.add(jobKey);
    setJobs((previous) => ({
      ...previous,
      [jobKey]: { status: 'running', message: `Reviewing PR #${pull.number}` },
    }));

    try {
      const commentUrl = await readSseReview(pull.url);
      setJobs((previous) => ({
        ...previous,
        [jobKey]: { status: 'done', message: 'Comment posted', commentUrl },
      }));
    } catch (error) {
      setJobs((previous) => ({
        ...previous,
        [jobKey]: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Review failed',
        },
      }));
    } finally {
      inFlight.current.delete(jobKey);
    }
  }, []);

  const reviewPendingForRepo = useCallback(
    async (repo: RepoItem) => {
      const pulls = await loadPulls(repo);
      const pending = pulls.filter((pull) => pull.reviewState !== 'reviewed');

      for (const pull of pending) {
        await reviewPull(pull);
      }

      await loadPulls(repo);
    },
    [loadPulls, reviewPull],
  );

  useEffect(() => {
    void loadRepositories();
  }, [loadRepositories]);

  useEffect(() => {
    const activeRepos = repositories.filter((repo) => monitored[repoKey(repo)]);
    if (activeRepos.length === 0) return;

    const tick = async () => {
      for (const repo of activeRepos) {
        const pulls = await loadPulls(repo);
        const pending = pulls.filter((pull) => pull.reviewState !== 'reviewed');
        for (const pull of pending) {
          await reviewPull(pull);
        }
      }
    };

    void tick();
    const interval = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [repositories, monitored, loadPulls, reviewPull]);

  const totals = useMemo(() => {
    const pulls = Object.values(pullsByRepo).flat();
    return {
      open: pulls.length,
      pending: pulls.filter((pull) => pull.reviewState !== 'reviewed').length,
      monitored: Object.values(monitored).filter(Boolean).length,
      autobot: autoBotRepos.size,
    };
  }, [pullsByRepo, monitored, autoBotRepos]);

  const addManualRepo = () => {
    try {
      const parsed = parseRepoInput(manualInput);
      const repo: RepoItem = {
        id: Date.now(),
        owner: parsed.owner,
        name: parsed.name,
        fullName: parsed.fullName,
        htmlUrl: parsed.htmlUrl,
        private: false,
        defaultBranch: 'main',
        updatedAt: null,
        description: 'Added manually',
        source: 'manual',
      };

      setRepositories((previous) => {
        const merged = [repo, ...previous].filter(
          (item, index, all) => all.findIndex((candidate) => repoKey(candidate) === repoKey(item)) === index,
        );
        localStorage.setItem(STORAGE_REPOS, JSON.stringify(merged.filter((item) => item.source === 'manual')));
        return merged;
      });
      setManualInput('');
      void loadPulls(repo);
    } catch (error) {
      setRepoErrors((previous) => ({
        ...previous,
        global: error instanceof Error ? error.message : 'Invalid repository URL',
      }));
    }
  };

  return (
    <>
      <Header />
      <main className="relative min-h-screen bg-[var(--surface-0)] text-white overflow-hidden">
        <Aurora />

        {/* Hero */}
        <section className="relative z-10 border-b border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-5 sm:px-6 py-10 sm:py-14">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between animate-slideUp">
              <div className="max-w-2xl">
                <span className="step-pill mb-3">Automation Center</span>
                <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-tight">
                  Repository{' '}
                  <span className="bg-gradient-to-r from-violet-300 via-blue-300 to-cyan-300 bg-clip-text text-transparent">
                    watchlist
                  </span>
                </h2>
                <p className="mt-3 text-base text-gray-400 leading-relaxed">
                  Monitor GitHub repositories, detect open PRs that need review, and post
                  PR Sentinel comments automatically.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 stagger">
                <Stat label="Auto-bot" value={String(totals.autobot)} accent="amber" />
                <Stat label="Monitored" value={String(totals.monitored)} accent="cyan" />
                <Stat label="Open PRs" value={String(totals.open)} accent="violet" />
                <Stat label="Pending" value={String(totals.pending)} accent="rose" />
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 mx-auto max-w-6xl px-5 sm:px-6 py-8">
          {/* Add repo bar */}
          <div className="glass-card p-3 flex flex-col gap-2 md:flex-row animate-slideUp" style={{ animationDelay: '0.1s' }}>
            <div className="relative flex-1">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <input
                value={manualInput}
                onChange={(event) => setManualInput(event.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addManualRepo()}
                placeholder="https://github.com/owner/repo"
                className="field-input pl-10 !py-2.5"
              />
            </div>
            <button type="button" onClick={addManualRepo} className="btn-primary !py-2.5 whitespace-nowrap">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add repo
            </button>
            <button
              type="button"
              onClick={() => void loadRepositories()}
              className="btn-secondary !py-2.5 whitespace-nowrap"
            >
              <svg
                className={`w-4 h-4 ${isLoadingRepos ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync from GitHub
            </button>
          </div>

          {repoErrors.global && (
            <div className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-300 animate-fadeIn">
              <p className="font-semibold mb-1">⚠ Could not load repositories</p>
              <p className="text-rose-200/80 text-xs leading-relaxed">{repoErrors.global}</p>
              {repoErrors.global.includes('PAT') || repoErrors.global.includes('configured') ? (
                <Link href="/settings" className="inline-flex items-center gap-1 mt-2 text-xs text-rose-200 underline underline-offset-2 hover:text-white transition">
                  Go to Settings →
                </Link>
              ) : (
                <button type="button" onClick={() => void loadRepositories()} className="mt-2 text-xs text-rose-200 underline underline-offset-2 hover:text-white transition">
                  Try again
                </button>
              )}
            </div>
          )}

          <div className="mt-7 space-y-4">
            {isLoadingRepos && repositories.length === 0 && (
              <div className="glass-card p-6 flex items-center gap-3 text-sm text-gray-400">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading repositories from GitHub...
              </div>
            )}

            {!isLoadingRepos && repositories.length === 0 && (
              <div className="glass-card p-10 text-center animate-fadeIn">
                <div className="inline-flex w-16 h-16 mb-5 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/10 border border-white/10 items-center justify-center">
                  <svg className="w-7 h-7 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">No repositories found</h3>
                <p className="text-sm text-gray-400 max-w-md mx-auto mb-2 leading-relaxed">
                  No repos from your GitHub account were found. You can sync again or paste any
                  GitHub repo URL you have read access to.
                </p>
                <p className="text-xs text-gray-500 max-w-sm mx-auto mb-6 leading-relaxed">
                  If your repos aren&apos;t showing, make sure you authorized PR Sentinel with the
                  correct GitHub account. You can also add any public repo by pasting its URL above.
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <button type="button" onClick={() => void loadRepositories()} className="btn-primary">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Sync from GitHub
                  </button>
                  <Link href="/" className="btn-secondary">
                    Review a PR manually →
                  </Link>
                </div>
              </div>
            )}

            {repositories.map((repo, idx) => {
              const key = repoKey(repo);
              const pulls = pullsByRepo[key] ?? [];
              const pending = pulls.filter((pull) => pull.reviewState !== 'reviewed');
              const autobotEnabled = autoBotRepos.has(key);
              const autobotDisabled = autoBotAvailable === false || repo.source === 'manual';

              return (
                <article
                  key={key}
                  className="glass-card glass-card-hover p-5 sm:p-6 animate-slideUp"
                  style={{ animationDelay: `${0.05 * idx}s` }}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <a
                          href={repo.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-lg font-semibold text-white hover:text-cyan-300 transition truncate"
                        >
                          {repo.fullName}
                        </a>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            repo.source === 'github'
                              ? 'border-violet-500/25 bg-violet-500/10 text-violet-300'
                              : 'border-white/10 bg-white/[0.03] text-gray-400'
                          }`}
                        >
                          {repo.source === 'github' ? 'GitHub' : 'Manual'}
                        </span>
                        {repo.private && (
                          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                            Private
                          </span>
                        )}
                        {autobotEnabled && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                            <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                            Auto-bot live
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 line-clamp-2">
                        {repo.description ?? 'No description'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0">
                      {/* Local poll toggle */}
                      <label
                        className="group flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] px-3 py-2 text-xs text-gray-300 cursor-pointer transition"
                        title="Polls every 60s while this tab is open"
                      >
                        <input
                          type="checkbox"
                          checked={monitored[key] ?? false}
                          onChange={(event) =>
                            setMonitored((previous) => ({ ...previous, [key]: event.target.checked }))
                          }
                          className="h-3.5 w-3.5 accent-cyan-400 cursor-pointer"
                        />
                        <span className="font-medium">Local poll</span>
                      </label>

                      {/* Auto-bot toggle (server-side webhook) */}
                      <label
                        className={`group flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition ${
                          autobotEnabled
                            ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-orange-500/5 text-amber-200 shadow-sm shadow-amber-500/10'
                            : 'border-white/10 bg-white/[0.02] text-gray-300 hover:bg-white/[0.04]'
                        } ${autobotDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        title={
                          repo.source === 'manual'
                            ? 'Auto-bot is only available for GitHub-linked repos.'
                            : autoBotAvailable === false
                              ? 'KV not configured on this deployment.'
                              : 'Install a webhook. Reviews fire on every new PR / commit, even offline.'
                        }
                      >
                        <input
                          type="checkbox"
                          checked={autobotEnabled}
                          disabled={autoBotPending[key] || autobotDisabled}
                          onChange={() => void toggleAutoBot(repo)}
                          className="h-3.5 w-3.5 accent-amber-400 cursor-pointer"
                        />
                        <span className="flex items-center gap-1.5 font-semibold">
                          🤖 Auto-bot
                          {autoBotPending[key] && (
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" aria-hidden="true">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          )}
                        </span>
                      </label>

                      <button
                        type="button"
                        onClick={() => void loadPulls(repo)}
                        className="btn-secondary !text-xs !py-2 !px-3"
                      >
                        Check PRs
                      </button>
                      <button
                        type="button"
                        onClick={() => void reviewPendingForRepo(repo)}
                        disabled={pending.length === 0 && pulls.length > 0}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 transition shadow-lg shadow-emerald-500/20 disabled:shadow-none"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Review pending
                      </button>
                    </div>
                  </div>

                  {repoErrors[key] && (
                    <p className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-300">
                      {repoErrors[key]}
                    </p>
                  )}

                  {autoBotErrors[key] && (
                    <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200">
                      <p>🤖 Auto-bot: {autoBotErrors[key]}</p>
                      {(autoBotErrors[key].includes('PAT') || autoBotErrors[key].includes('Settings')) && (
                        <Link href="/settings" className="inline-flex items-center gap-1 mt-1.5 text-amber-300 hover:text-white underline underline-offset-2 transition font-medium">
                          Go to Settings → Add GitHub PAT
                        </Link>
                      )}
                    </div>
                  )}

                  {/* PRs list */}
                  <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.06] bg-black/30">
                    {pulls.length === 0 ? (
                      <div className="p-4 text-sm text-gray-500 flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        No PR data loaded yet. Use{' '}
                        <span className="text-gray-300 font-medium">Check PRs</span> or enable{' '}
                        <span className="text-gray-300 font-medium">Local poll</span>.
                      </div>
                    ) : (
                      pulls.map((pull) => {
                        const job = jobs[pull.url];
                        return (
                          <div
                            key={pull.url}
                            className="border-b border-white/[0.05] p-4 last:border-b-0 hover:bg-white/[0.02] transition"
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <a
                                    href={pull.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-white hover:text-cyan-300 transition truncate"
                                  >
                                    <span className="text-gray-500">#{pull.number}</span> {pull.title}
                                  </a>
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusClass(pull.reviewState)}`}
                                  >
                                    {statusLabel(pull.reviewState)}
                                  </span>
                                </div>
                                <p className="mt-1 text-[11px] text-gray-500 font-mono">
                                  @{pull.author} · {pull.headSha.slice(0, 8)}
                                  {pull.lastReviewSha ? ` · reviewed ${pull.lastReviewSha.slice(0, 8)}` : ''}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {pull.lastReviewUrl && (
                                  <a
                                    href={pull.lastReviewUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn-secondary !text-[11px] !py-1.5 !px-2.5"
                                  >
                                    Last comment ↗
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void reviewPull(pull)}
                                  disabled={job?.status === 'running'}
                                  className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:cursor-wait disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-400 transition shadow-sm shadow-cyan-500/20"
                                >
                                  {job?.status === 'running' ? (
                                    <>
                                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                      </svg>
                                      Reviewing
                                    </>
                                  ) : (
                                    <>Review now</>
                                  )}
                                </button>
                              </div>
                            </div>

                            {job && (
                              <p
                                className={`mt-3 rounded-lg border p-2.5 text-[11px] ${
                                  job.status === 'error'
                                    ? 'border-rose-500/25 bg-rose-500/10 text-rose-300'
                                    : job.status === 'done'
                                      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                                      : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-200'
                                }`}
                              >
                                {job.message}
                                {job.commentUrl && (
                                  <a
                                    href={job.commentUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="ml-2 underline underline-offset-2"
                                  >
                                    Open comment ↗
                                  </a>
                                )}
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'violet' | 'cyan' | 'amber' | 'rose';
}) {
  const colors: Record<string, string> = {
    violet: 'from-violet-500/15 to-violet-500/5 border-violet-500/25 text-violet-300',
    cyan: 'from-cyan-500/15 to-cyan-500/5 border-cyan-500/25 text-cyan-300',
    amber: 'from-amber-500/15 to-amber-500/5 border-amber-500/25 text-amber-300',
    rose: 'from-rose-500/15 to-rose-500/5 border-rose-500/25 text-rose-300',
  };
  return (
    <div
      className={`min-w-[88px] rounded-xl border bg-gradient-to-br backdrop-blur-sm px-3 py-2.5 ${colors[accent]}`}
    >
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</p>
      <p className="mt-0.5 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
