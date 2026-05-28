// ============================================================
// MIDDLEWARE.TS — Auth gating for protected routes
// Simple cookie-based check (avoids NextAuth Edge runtime issues in Next.js 16).
// Redirects unauthenticated users to /login.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

// Paths that do NOT require auth
const PUBLIC_PREFIXES = [
  '/login',
  '/demo',
  '/api/auth',
  '/api/webhooks',
  '/api/cron',
  '/api/cache',
  '/_next',
  '/favicon.ico',
  '/robots.txt',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // NextAuth v5 stores the session token in a secure cookie prefixed with authjs
  const sessionToken =
    request.cookies.get('authjs.session-token')?.value ||
    request.cookies.get('__Secure-authjs.session-token')?.value ||
    request.cookies.get('next-auth.session-token')?.value ||
    request.cookies.get('__Secure-next-auth.session-token')?.value;

  if (!sessionToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!login|demo|api/auth|api/webhooks|api/cron|api/cache|_next|favicon\\.ico|robots\\.txt).*)',
  ],
};
