// ============================================================
// /api/stats — Stats personales del usuario para el dashboard.
//
// Devuelve totales agregados (cuántas reviews, findings por severidad,
// tokens, cache hit rate) más la lista de reviews recientes (rolling 20).
// Storage en KV; si no está configurado devuelve zeros sin error.
// ============================================================

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserStats, getRecentReviews, isStorageAvailable } from '@/lib/storage';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [stats, recent] = await Promise.all([
    getUserStats(session.user.id),
    getRecentReviews(session.user.id),
  ]);

  // "Tiempo ahorrado": heurística simple — 7 min por finding crítico/high,
  // 3 min por medium, 1 min por low/info. Es lo que un dev tardaría en
  // encontrar y entender el bug manualmente.
  const timeSavedMin =
    stats.bySeverity.critical * 7 +
    stats.bySeverity.high * 7 +
    stats.bySeverity.medium * 3 +
    stats.bySeverity.low +
    stats.bySeverity.info * 0.5;

  const cacheHitRate =
    stats.totalCacheHits + stats.totalCacheMisses === 0
      ? 0
      : Math.round((stats.totalCacheHits / (stats.totalCacheHits + stats.totalCacheMisses)) * 100);

  return NextResponse.json({
    stats,
    recent,
    derived: {
      timeSavedMinutes: Math.round(timeSavedMin),
      cacheHitRate,
    },
    storageAvailable: isStorageAvailable(),
  });
}
