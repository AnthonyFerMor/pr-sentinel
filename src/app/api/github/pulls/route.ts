import { NextRequest, NextResponse } from 'next/server';
import { listOpenPullRequests } from '@/lib/github';
import { parseRepoUrl } from '@/lib/parser';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const repoUrl = params.get('repoUrl');

    const repoInfo = repoUrl
      ? parseRepoUrl(repoUrl)
      : {
          owner: params.get('owner') ?? '',
          repo: params.get('repo') ?? '',
        };

    if (!repoInfo.owner || !repoInfo.repo) {
      return NextResponse.json(
        { error: 'owner/repo or repoUrl is required' },
        { status: 400 }
      );
    }

    const pullRequests = await listOpenPullRequests(repoInfo.owner, repoInfo.repo);
    return NextResponse.json({ pullRequests });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
