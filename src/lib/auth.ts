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

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
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
  },
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
