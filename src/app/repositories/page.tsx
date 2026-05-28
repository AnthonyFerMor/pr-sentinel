'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from '@/components/Header';
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
  if (state === 'needs_update') return 'Updated after review';
  return 'Needs review';
}

function statusClass(state: PullRequestSummary['reviewState']) {
  if (state === 'reviewed') return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
  if (state === 'needs_update') return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
  return 'bg-rose-500/10 text-rose-300 border-rose-500/20';
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
          (repo, index, all) => all.findIndex((item) => repoKey(item) === repoKey(repo)) === index
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

  const reviewPendingForRepo = useCallback(async (repo: RepoItem) => {
    const pulls = await loadPulls(repo);
    const pending = pulls.filter((pull) => pull.reviewState !== 'reviewed');

    for (const pull of pending) {
      await reviewPull(pull);
    }

    await loadPulls(repo);
  }, [loadPulls, reviewPull]);

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
    };
  }, [pullsByRepo, monitored]);

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
          (item, index, all) => all.findIndex((candidate) => repoKey(candidate) === repoKey(item)) === index
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
      <main className="min-h-screen bg-gray-950 text-white">
        <section className="border-b border-white/5 bg-gray-900/40">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Automation Center</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight">Repository watchlist</h2>
              <p className="mt-2 max-w-2xl text-sm text-gray-400">
                Monitor GitHub repositories, detect open PRs that need a review, and post PR Sentinel comments automatically.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Monitored" value={String(totals.monitored)} />
              <Stat label="Open PRs" value={String(totals.open)} />
              <Stat label="Pending" value={String(totals.pending)} />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-gray-900/60 p-4 md:flex-row">
            <input
              value={manualInput}
              onChange={(event) => setManualInput(event.target.value)}
              placeholder="https://github.com/owner/repo"
              className="min-h-11 flex-1 rounded-md border border-white/10 bg-gray-950 px-3 text-sm text-white outline-none focus:border-cyan-400/50"
            />
            <button
              type="button"
              onClick={addManualRepo}
              className="min-h-11 rounded-md bg-cyan-500 px-4 text-sm font-semibold text-gray-950 hover:bg-cyan-400"
            >
              Add public repo
            </button>
            <button
              type="button"
              onClick={() => void loadRepositories()}
              className="min-h-11 rounded-md border border-white/10 px-4 text-sm font-semibold text-gray-200 hover:bg-white/5"
            >
              Refresh GitHub repos
            </button>
          </div>

          {repoErrors.global && (
            <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              {repoErrors.global}
            </p>
          )}

          <div className="mt-6 space-y-4">
            {isLoadingRepos && repositories.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-gray-900/60 p-6 flex items-center gap-3 text-sm text-gray-400">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading repositories from GitHub...
              </div>
            )}

            {!isLoadingRepos && repositories.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-gray-900/40 p-10 text-center">
                <div className="text-5xl mb-4" aria-hidden="true">📦</div>
                <h3 className="text-lg font-semibold text-white mb-2">No repositories yet</h3>
                <p className="text-sm text-gray-400 max-w-md mx-auto mb-6">
                  Add a public repository above or refresh to load the ones your GitHub account has access to.
                  Toggle <span className="text-cyan-300">Auto-review</span> on any repo to monitor its open PRs.
                </p>
                <button
                  type="button"
                  onClick={() => void loadRepositories()}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 px-4 py-2 text-sm font-semibold text-gray-950"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh from GitHub
                </button>
              </div>
            )}

            {repositories.map((repo) => {
              const key = repoKey(repo);
              const pulls = pullsByRepo[key] ?? [];
              const pending = pulls.filter((pull) => pull.reviewState !== 'reviewed');

              return (
                <article key={key} className="rounded-lg border border-white/10 bg-gray-900/60 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={repo.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-lg font-semibold text-white hover:text-cyan-300"
                        >
                          {repo.fullName}
                        </a>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-gray-400">
                          {repo.source === 'github' ? 'GitHub access' : 'Manual'}
                        </span>
                        {repo.private && (
                          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                            Private
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-400">{repo.description ?? 'No description'}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-gray-300">
                        <input
                          type="checkbox"
                          checked={monitored[key] ?? false}
                          onChange={(event) =>
                            setMonitored((previous) => ({ ...previous, [key]: event.target.checked }))
                          }
                          className="h-4 w-4 accent-cyan-400"
                        />
                        Auto-review
                      </label>
                      <button
                        type="button"
                        onClick={() => void loadPulls(repo)}
                        className="rounded-md border border-white/10 px-3 py-2 text-sm text-gray-300 hover:bg-white/5"
                      >
                        Check PRs
                      </button>
                      <button
                        type="button"
                        onClick={() => void reviewPendingForRepo(repo)}
                        disabled={pending.length === 0 && pulls.length > 0}
                        className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-gray-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
                      >
                        Review pending
                      </button>
                    </div>
                  </div>

                  {repoErrors[key] && (
                    <p className="mt-4 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                      {repoErrors[key]}
                    </p>
                  )}

                  <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
                    {pulls.length === 0 ? (
                      <div className="bg-gray-950/60 p-4 text-sm text-gray-500">
                        No PR data loaded yet. Use Check PRs or enable Auto-review.
                      </div>
                    ) : (
                      pulls.map((pull) => {
                        const job = jobs[pull.url];
                        return (
                          <div key={pull.url} className="border-b border-white/5 bg-gray-950/50 p-4 last:border-b-0">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <a
                                    href={pull.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-white hover:text-cyan-300"
                                  >
                                    #{pull.number} {pull.title}
                                  </a>
                                  <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(pull.reviewState)}`}>
                                    {statusLabel(pull.reviewState)}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                  {pull.author} · head {pull.headSha.slice(0, 8)}
                                  {pull.lastReviewSha ? ` · last reviewed ${pull.lastReviewSha.slice(0, 8)}` : ''}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {pull.lastReviewUrl && (
                                  <a
                                    href={pull.lastReviewUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-md border border-white/10 px-3 py-2 text-xs text-gray-300 hover:bg-white/5"
                                  >
                                    Last comment
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void reviewPull(pull)}
                                  disabled={job?.status === 'running'}
                                  className="rounded-md bg-cyan-500 px-3 py-2 text-xs font-semibold text-gray-950 hover:bg-cyan-400 disabled:cursor-wait disabled:bg-gray-700 disabled:text-gray-400"
                                >
                                  {job?.status === 'running' ? 'Reviewing...' : 'Review now'}
                                </button>
                              </div>
                            </div>

                            {job && (
                              <p
                                className={`mt-3 rounded-md border p-2 text-xs ${
                                  job.status === 'error'
                                    ? 'border-red-500/20 bg-red-500/10 text-red-300'
                                    : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200'
                                }`}
                              >
                                {job.message}
                                {job.commentUrl && (
                                  <a href={job.commentUrl} target="_blank" rel="noreferrer" className="ml-2 underline">
                                    Open comment
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 rounded-lg border border-white/10 bg-gray-950/70 px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
    </div>
  );
}
