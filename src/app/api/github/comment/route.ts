// POST /api/github/comment — Post review comment to GitHub PR
import { NextRequest, NextResponse } from 'next/server';
import { parsePRUrl } from '@/lib/parser';
import { postReviewComment } from '@/lib/github';

export async function POST(request: NextRequest) {
  try {
    const { prUrl, reviewMarkdown } = await request.json();

    if (!prUrl || !reviewMarkdown) {
      return NextResponse.json(
        { error: 'prUrl and reviewMarkdown are required' },
        { status: 400 }
      );
    }

    const prInfo = parsePRUrl(prUrl);
    const { commentUrl } = await postReviewComment(prInfo, reviewMarkdown);

    return NextResponse.json({ success: true, commentUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
