// ============================================================
// AUTH.TS — NextAuth v5 configuration
// ============================================================

import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    user: {
      id?: string;
      login?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    accessToken?: string;
    login?: string;
  }
}

// Debug: log which auth env vars are present at startup (values masked).
if (typeof process !== 'undefined') {
  const vars = ['AUTH_SECRET', 'NEXTAUTH_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'AUTH_GITHUB_ID', 'AUTH_GITHUB_SECRET', 'NEXTAUTH_URL'];
  console.log('[auth] env check:', vars.map(v => `${v}=${process.env[v] ? '✓' : '✗'}`).join(', '));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID ?? process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? process.env.AUTH_GITHUB_SECRET,
      authorization: {
        params: {
          // Scopes needed: read repos, read/write PRs and issues (for posting comments)
          scope: 'read:user user:email repo',
        },
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  debug: process.env.NODE_ENV === 'development',
  callbacks: {
    authorized({ auth: session, request }) {
      const isLoggedIn = !!session?.user;
      const isOnLogin = request.nextUrl.pathname === '/login';
      const isPublicApi = request.nextUrl.pathname.startsWith('/api/auth') ||
        request.nextUrl.pathname.startsWith('/api/webhooks') ||
        request.nextUrl.pathname.startsWith('/api/cron') ||
        request.nextUrl.pathname.startsWith('/api/cache');

      if (isPublicApi) return true;
      if (isOnLogin) return true;
      if (isLoggedIn) return true;

      // Redirect to login
      return false;
    },
    async jwt({ token, account, profile }) {
      // On initial sign-in, persist the GitHub access token and login
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      if (profile) {
        token.login = (profile as { login?: string }).login;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      if (session.user) {
        session.user.login = token.login;
        session.user.id = token.sub as string;
      }
      return session;
    },
  },
});
