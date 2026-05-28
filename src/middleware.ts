// ============================================================
// MIDDLEWARE.TS — Auth gating for protected routes
// Redirects unauthenticated users to /login.
// Allows public access to: /login, /api/auth, /api/webhooks, /api/cron, static assets.
// ============================================================

export { auth as middleware } from '@/lib/auth';

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /login (public login page)
     * - /api/auth (NextAuth routes)
     * - /api/webhooks (GitHub webhook — no user session)
     * - /api/cron (Vercel Cron — bearer token auth)
     * - /api/cache (cache stats — public)
     * - /_next (Next.js internals)
     * - /favicon.ico, /robots.txt, etc.
     */
    '/((?!login|api/auth|api/webhooks|api/cron|api/cache|_next|favicon\\.ico|robots\\.txt).*)',
  ],
};
