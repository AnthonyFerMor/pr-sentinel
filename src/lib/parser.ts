// ============================================================
// PARSER.TS — Parseo de URLs de Pull Requests de GitHub
// ============================================================

import { PRInfo } from './types';

/**
 * Parsea una URL de PR de GitHub y extrae owner, repo, y número de PR.
 *
 * URLs válidas:
 *   https://github.com/owner/repo/pull/123
 *   http://github.com/owner/repo/pull/123
 *   github.com/owner/repo/pull/123
 *   https://github.com/owner/repo/pull/123/files
 *   https://github.com/owner/repo/pull/123/commits
 *
 * @throws Error si la URL no es válida
 */
export function parsePRUrl(url: string): PRInfo {
  let cleanUrl = url.trim();

  if (!cleanUrl.startsWith('http')) {
    cleanUrl = 'https://' + cleanUrl;
  }

  const match = cleanUrl.match(
    /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
  );

  if (!match) {
    throw new Error(
      `Invalid PR URL. Expected format: https://github.com/owner/repo/pull/123\n` +
      `Received: ${url}`
    );
  }

  const [, owner, repo, pullNumberStr] = match;
  const pullNumber = parseInt(pullNumberStr, 10);

  if (isNaN(pullNumber) || pullNumber <= 0) {
    throw new Error(`Invalid PR number: ${pullNumberStr}`);
  }

  return {
    owner,
    repo,
    pullNumber,
    url: `https://github.com/${owner}/${repo}/pull/${pullNumber}`,
  };
}
