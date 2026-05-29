// ============================================================
// ERROR-MESSAGES.TS — Map raw review errors to friendly, actionable UI text.
//
// The /api/review stream and fetch can fail for many reasons. Raw messages
// like "HTTP 401" or a Gemini SDK stack trace are useless to a user. This
// maps the common failure modes to a clear title, an explanation, and an
// optional call-to-action link (usually Settings).
// ============================================================

export interface FriendlyError {
  title: string;
  message: string;
  action?: { label: string; href: string };
}

/**
 * Turn a raw error string into a friendly, actionable message.
 * Falls back to the raw string when nothing matches.
 */
export function humanizeReviewError(raw: string): FriendlyError {
  const e = (raw || '').toLowerCase();

  // No Gemini key configured
  if (
    e.includes('gemini') &&
    (e.includes('not configured') || e.includes('no api key') || e.includes('missing') || e.includes('required'))
  ) {
    return {
      title: 'No Gemini API key',
      message:
        'PR Sentinel needs your own Gemini API key to run a review. Add it in Settings — the free tier is enough for everyday use.',
      action: { label: 'Add Gemini key in Settings', href: '/settings' },
    };
  }

  // Invalid / unauthorized Gemini key
  if (
    (e.includes('api key') || e.includes('api_key') || e.includes('apikey')) &&
    (e.includes('invalid') || e.includes('not valid') || e.includes('unauthorized') || e.includes('401') || e.includes('permission denied'))
  ) {
    return {
      title: 'Gemini key rejected',
      message:
        'Google rejected your Gemini API key. Double-check you copied it correctly and that the Generative Language API is enabled for it.',
      action: { label: 'Update key in Settings', href: '/settings' },
    };
  }

  // Quota / rate limit
  if (e.includes('quota') || e.includes('429') || e.includes('rate limit') || e.includes('resource_exhausted')) {
    return {
      title: 'Gemini quota reached',
      message:
        'Your Gemini key hit its rate or daily quota. Wait a bit and try again, or use a key with higher limits. The free tier resets daily.',
      action: { label: 'Check your key', href: '/settings' },
    };
  }

  // GitHub auth / token problems
  if (
    (e.includes('github') || e.includes('octokit') || e.includes('token')) &&
    (e.includes('401') || e.includes('403') || e.includes('bad credentials') || e.includes('unauthorized'))
  ) {
    return {
      title: 'GitHub access problem',
      message:
        'GitHub rejected the request. Your session may have expired — try signing out and back in. For private repos, make sure you granted access.',
      action: { label: 'Open Settings', href: '/settings' },
    };
  }

  // PR not found / no access
  if (e.includes('404') || e.includes('not found')) {
    return {
      title: 'PR not found',
      message:
        'That Pull Request could not be found. Check the URL, and make sure the repo is public or that you have access to it.',
    };
  }

  // Invalid URL (should be caught client-side, but just in case)
  if (e.includes('invalid pr url') || e.includes('expected format')) {
    return {
      title: 'Invalid PR URL',
      message: 'Use a URL like https://github.com/owner/repo/pull/123.',
    };
  }

  // Unauthorized to the app itself (session lost)
  if (e.includes('unauthorized') || e === 'http 401') {
    return {
      title: 'Session expired',
      message: 'Your session expired. Sign in again to continue.',
      action: { label: 'Sign in', href: '/login' },
    };
  }

  // Timeout / deadline
  if (e.includes('timeout') || e.includes('deadline') || e.includes('aborted')) {
    return {
      title: 'Review timed out',
      message:
        'The review took too long — this can happen on very large PRs. Try again, or switch to Lite mode for a faster pass.',
    };
  }

  // Fallback: show the raw message but with a generic title
  return {
    title: 'Review failed',
    message: raw || 'Something went wrong while running the review. Please try again.',
  };
}
