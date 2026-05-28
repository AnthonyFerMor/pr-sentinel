// ============================================================
// /api/repos/status — Returns the list of repos the user has enabled
// for auto-review. Used by the /repositories page toggle UI.
// ============================================================

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getEnabledRepos, isStorageAvailable } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isStorageAvailable()) {
    return NextResponse.json({ enabledRepos: [], storageAvailable: false });
  }

  const enabledRepos = await getEnabledRepos(session.user.id);
  return NextResponse.json({ enabledRepos, storageAvailable: true });
}
