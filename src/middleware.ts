// ============================================================
// MIDDLEWARE.TS — Auth gating for protected routes
// Simple cookie-based check (avoids NextAuth Edge runtime issues in Next.js 16).
// Redirects unauthenticated users to /login.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

// Paths that do NOT require auth (or handle their own auth internally)
const PUBLIC_PREFIXES = [
  '/login',
  '/demo',
  '/api/auth',
  '/api/webhooks',
  '/api/cron',
  '/api/cache',
  // /api/review is a long-running SSE stream (30-120s). The Edge middleware
  // has a ~25s CPU timeout and kills the response mid-stream. The route
  // handler validates auth internally via auth(), so skip middleware here.
  '/api/review',
  '/_next',
  '/favicon.ico',
  '/robots.txt',
];

// Exact paths that are fully public (the landing page)
const PUBLIC_EXACT = ['/'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow exact public paths (landing page)
  if (PUBLIC_EXACT.includes(pathname)) {
    return NextResponse.next();
  }

  // Allow public path prefixes
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
  // Exclude the root path and all existing public paths from the matcher so
  // middleware only runs on auth-required routes, keeping it fast.
  matcher: [
    '/((?!$|login|demo|api/auth|api/webhooks|api/cron|api/cache|api/review|_next|favicon\\.ico|robots\\.txt).*)',
  ],
};
