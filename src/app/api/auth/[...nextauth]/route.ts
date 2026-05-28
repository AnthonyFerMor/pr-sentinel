import { handlers } from '@/lib/auth';

// NextAuth v5 returns { GET, POST } handlers.
// Re-export them individually to satisfy Next.js 16 route handler types.
export const GET = handlers.GET;
export const POST = handlers.POST;
