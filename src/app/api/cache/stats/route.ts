// GET /api/cache/stats — Context cache statistics
import { NextResponse } from 'next/server';
import { getCacheStats } from '@/lib/gemini';

export async function GET() {
  const stats = getCacheStats();
  return NextResponse.json(stats);
}
