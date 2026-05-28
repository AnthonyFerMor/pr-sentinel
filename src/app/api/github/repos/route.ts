import { NextResponse } from 'next/server';
import { listAccessibleRepositories } from '@/lib/github';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await auth();
    const repositories = await listAccessibleRepositories(session?.accessToken);
    return NextResponse.json({ repositories });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
