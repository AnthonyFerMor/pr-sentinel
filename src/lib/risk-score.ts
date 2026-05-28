// ============================================================
// RISK-SCORE.TS — Calcula un score 0-100 para resumir el riesgo del PR.
//
// El score es una heurística simple pero coherente:
//   - Severidad ponderada: critical 25, high 10, medium 3, low 1, info 0.5
//   - Bonus por categoría sensible: security cuenta x1.4.
//   - Tamaño del PR aporta un piso mínimo (PRs gigantes son inherentemente
//     más riesgosos aunque el modelo no encuentre nada).
//
// Devolvemos también una etiqueta cualitativa (safe / review / risky / blocked)
// para mostrar como badge en el header del review. Nunca queremos bloquear
// merges automáticamente, así que es informativo, no enforced.
// ============================================================

import { ReviewResult, ReviewFinding } from './types';

export interface RiskScore {
  /** Entero 0-100. 0 = safe, 100 = on fire. */
  score: number;
  label: 'safe' | 'review' | 'risky' | 'blocked';
  emoji: string;
  /** Color tailwind para la UI: green/amber/orange/red. */
  color: 'emerald' | 'amber' | 'orange' | 'rose';
  /** Etiqueta corta para mostrar en el badge. */
  badge: string;
  /** Breakdown legible de por qué se llegó a ese score. */
  rationale: string[];
}

const SEVERITY_WEIGHT: Record<ReviewFinding['severity'], number> = {
  critical: 25,
  high: 10,
  medium: 3,
  low: 1,
  info: 0.5,
};

const CATEGORY_BONUS: Record<string, number> = {
  security: 1.4,
  bugs: 1.15,
  performance: 1.0,
  codeQuality: 0.8,
  suggestions: 0.6,
};

export function calculateRiskScore(
  review: Pick<ReviewResult, 'categories' | 'overallRiskLevel'>,
  prSize?: { additions?: number; deletions?: number; filesChanged?: number },
): RiskScore {
  let score = 0;
  const rationale: string[] = [];

  // 1. Severity contribution per category.
  for (const [category, findings] of Object.entries(review.categories) as [
    keyof ReviewResult['categories'],
    ReviewFinding[],
  ][]) {
    const bonus = CATEGORY_BONUS[category] ?? 1;
    let categoryScore = 0;
    for (const f of findings) {
      categoryScore += SEVERITY_WEIGHT[f.severity] * bonus;
    }
    if (categoryScore > 0) {
      score += categoryScore;
      rationale.push(
        `${findings.length} ${category} finding${findings.length === 1 ? '' : 's'} → +${Math.round(categoryScore)}`,
      );
    }
  }

  // 2. PR-size factor — large PRs get a floor of ~5-15.
  const linesChanged = (prSize?.additions ?? 0) + (prSize?.deletions ?? 0);
  if (linesChanged > 1000) {
    const sizeBoost = Math.min(15, Math.floor(linesChanged / 200));
    score += sizeBoost;
    rationale.push(`Large PR (${linesChanged.toLocaleString()} lines) → +${sizeBoost}`);
  } else if (linesChanged > 300) {
    const sizeBoost = Math.min(8, Math.floor(linesChanged / 100));
    score += sizeBoost;
    rationale.push(`Medium PR (${linesChanged.toLocaleString()} lines) → +${sizeBoost}`);
  }

  // 3. Critical finding short-circuit: if there's anything critical, floor at 75.
  const hasCritical = Object.values(review.categories).some((arr) =>
    arr.some((f) => f.severity === 'critical'),
  );
  if (hasCritical) {
    score = Math.max(score, 75);
    rationale.push('Critical finding detected → score floored at 75');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // 4. Quantize to label.
  let label: RiskScore['label'];
  let emoji: string;
  let color: RiskScore['color'];
  let badge: string;

  if (score >= 75) {
    label = 'blocked';
    emoji = '🔴';
    color = 'rose';
    badge = 'High risk — review carefully';
  } else if (score >= 45) {
    label = 'risky';
    emoji = '🟠';
    color = 'orange';
    badge = 'Risky — needs attention';
  } else if (score >= 20) {
    label = 'review';
    emoji = '🟡';
    color = 'amber';
    badge = 'Review recommended';
  } else {
    label = 'safe';
    emoji = '🟢';
    color = 'emerald';
    badge = 'Looks safe to merge';
  }

  if (rationale.length === 0) rationale.push('No findings of any severity');

  return { score, label, emoji, color, badge, rationale };
}

/**
 * Renderiza el risk score como bloque markdown listo para inyectar en el body del review.
 * Usa una mini "barra" con caracteres unicode para visualizarlo.
 */
export function formatRiskScoreBlock(risk: RiskScore): string {
  const filled = Math.round(risk.score / 5); // 0-20 chars
  const empty = 20 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  let md = `## ${risk.emoji} Risk Score: **${risk.score}/100** — ${risk.badge}\n\n`;
  md += '```\n';
  md += `${bar}  ${risk.score}/100\n`;
  md += '```\n\n';
  md += `<details><summary>How this was calculated</summary>\n\n`;
  for (const reason of risk.rationale) {
    md += `- ${reason}\n`;
  }
  md += `\n</details>\n\n`;
  return md;
}
