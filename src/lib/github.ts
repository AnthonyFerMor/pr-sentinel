// ============================================================
// GITHUB.TS — Servicio de interacción con GitHub API
// ============================================================

import { Octokit } from 'octokit';
import {
  PRInfo,
  PRMetadata,
  DiffFile,
  RepositorySummary,
  PullRequestSummary,
} from './types';
import { parseReviewMarker } from './review-marker';

async function withConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const taskIndex = index++;
      results[taskIndex] = await tasks[taskIndex]();
    }
  }

  const workers = Array(Math.min(limit, tasks.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}

function getOctokit(): Octokit {
  const token = process.env.PR_SENTINEL_GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error(
      'PR_SENTINEL_GITHUB_TOKEN is not configured. ' +
      'Set it in .env.local or Vercel Environment Variables.'
    );
  }
  return new Octokit({ 
    auth: token,
    request: {
      fetch: (url: string, opts: RequestInit) => {
        return fetch(url, { ...opts, cache: 'no-store' });
      }
    }
  });
}

/**
 * Obtiene la metadata de un Pull Request.
 */
export async function fetchPRMetadata(pr: PRInfo): Promise<PRMetadata> {
  const octokit = getOctokit();

  const { data } = await octokit.rest.pulls.get({
    owner: pr.owner,
    repo: pr.repo,
    pull_number: pr.pullNumber,
  });

  return {
    title: data.title,
    body: data.body,
    author: data.user?.login ?? 'unknown',
    baseBranch: data.base.ref,
    headBranch: data.head.ref,
    headSha: data.head.sha,
    htmlUrl: data.html_url,
    filesChanged: data.changed_files,
    additions: data.additions,
    deletions: data.deletions,
    state: data.state,
    createdAt: data.created_at,
  };
}

/**
 * Obtiene los archivos cambiados en un PR con sus diffs (patches).
 * Usa paginación automática para obtener TODOS los archivos.
 */
export async function fetchPRFiles(pr: PRInfo): Promise<DiffFile[]> {
  const octokit = getOctokit();

  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner: pr.owner,
    repo: pr.repo,
    pull_number: pr.pullNumber,
    per_page: 100,
  });

  return files.map((file) => {
    const isBinary = !file.patch;
    const isLockFile = checkIsLockFile(file.filename);
    const isGenerated = checkIsGeneratedFile(file.filename);

    return {
      filename: file.filename,
      status: file.status as DiffFile['status'],
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch ?? '',
      isBinary,
      isLockFile,
      isGenerated,
      priority: calculatePriority(file.filename, isBinary, isLockFile, isGenerated),
    };
  });
}

/**
 * Postea el review como comentario en el PR.
 */
export async function postReviewComment(
  pr: PRInfo,
  reviewMarkdown: string
): Promise<{ commentUrl: string }> {
  const octokit = getOctokit();

  const { data } = await octokit.rest.issues.createComment({
    owner: pr.owner,
    repo: pr.repo,
    issue_number: pr.pullNumber,
    body: reviewMarkdown,
  });

  return { commentUrl: data.html_url };
}

export async function listAccessibleRepositories(): Promise<RepositorySummary[]> {
  const octokit = getOctokit();

  const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
    affiliation: 'owner,collaborator,organization_member',
    sort: 'updated',
    per_page: 100,
  });

  return repos.map((repo) => ({
    id: repo.id,
    owner: repo.owner.login,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    htmlUrl: repo.html_url,
    defaultBranch: repo.default_branch,
    updatedAt: repo.updated_at ?? null,
    description: repo.description ?? null,
  }));
}

export async function listOpenPullRequests(
  owner: string,
  repo: string
): Promise<PullRequestSummary[]> {
  const octokit = getOctokit();

  const pulls = await octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo,
    state: 'open',
    sort: 'updated',
    direction: 'desc',
    per_page: 100,
  });

  const withReviewState = await withConcurrencyLimit(
    pulls.map((pull) => async () => {
      const comments = await octokit.paginate(octokit.rest.issues.listComments, {
        owner,
        repo,
        issue_number: pull.number,
        per_page: 100,
      });

      const sentinelComments = comments
        .map((comment) => ({
          htmlUrl: comment.html_url,
          marker: parseReviewMarker(comment.body ?? ''),
        }))
        .filter((comment) => comment.marker !== null);

      const lastReview = sentinelComments.at(-1);
      const lastReviewSha = lastReview?.marker?.headSha ?? null;
      const reviewState =
        lastReviewSha === null
          ? 'needs_review'
          : lastReviewSha === pull.head.sha
            ? 'reviewed'
            : 'needs_update';

      return {
        number: pull.number,
        title: pull.title,
        author: pull.user?.login ?? 'unknown',
        url: pull.html_url,
        headSha: pull.head.sha,
        createdAt: pull.created_at,
        updatedAt: pull.updated_at,
        reviewState,
        lastReviewSha,
        lastReviewUrl: lastReview?.htmlUrl ?? null,
        lastReviewAt: lastReview?.marker?.generatedAt ?? null,
      } satisfies PullRequestSummary;
    }),
    5
  );

  return withReviewState;
}

// === File classification helpers ===

function checkIsLockFile(filename: string): boolean {
  const lockPatterns = [
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'Gemfile.lock', 'Cargo.lock', 'poetry.lock',
    'composer.lock', 'Pipfile.lock', 'go.sum',
  ];
  return lockPatterns.some((p) => filename.endsWith(p));
}

function checkIsGeneratedFile(filename: string): boolean {
  const patterns = [
    '.min.js', '.min.css', '.map',
    '.generated.', '.g.dart',
    'dist/', 'build/', '.next/',
    '__snapshots__/',
    '.svg', '.ico', '.png', '.jpg', '.gif', '.jpeg', '.webp',
    '.woff', '.woff2', '.ttf', '.eot',
  ];
  return patterns.some((p) => filename.includes(p));
}

function calculatePriority(
  filename: string,
  isBinary: boolean,
  isLockFile: boolean,
  isGenerated: boolean
): DiffFile['priority'] {
  if (isBinary || isLockFile || isGenerated) return 'skip';

  const highExts = [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go', '.rs',
    '.java', '.kt', '.cs', '.php', '.sql', '.prisma',
  ];
  const highPaths = [
    'api/', 'server/', 'routes/', 'middleware', 'auth/',
    'lib/', 'utils/', 'services/', 'database/', 'db/', 'models/',
  ];

  const ext = '.' + (filename.split('.').pop() ?? '');
  if (highExts.includes(ext) || highPaths.some((p) => filename.includes(p))) return 'high';

  const medPatterns = [
    '.json', '.yaml', '.yml', '.toml',
    '.test.', '.spec.', '.md', '.env',
    'Dockerfile', 'docker-compose',
  ];
  if (medPatterns.some((p) => filename.includes(p))) return 'medium';

  return 'low';
}
