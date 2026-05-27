import { NextResponse } from 'next/server';
import { listAccessibleRepositories } from '@/lib/github';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const repositories = await listAccessibleRepositories();
    return NextResponse.json({ repositories });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
