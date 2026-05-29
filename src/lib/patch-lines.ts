// ============================================================
// PATCH-LINES.TS — Extraer líneas válidas del diff por archivo.
//
// GitHub solo acepta comentarios inline en líneas que aparecen en el diff
// del PR (sea como `+` añadida o como ` ` de contexto). Si intentamos
// postear un comentario sobre una línea fuera del diff, la API responde
// 422. Por eso antes de crear el review, partimos los findings en dos:
// los que caen sobre líneas válidas → inline; el resto → comentario
// normal de fallback.
// ============================================================

import { DiffFile, ReviewFinding } from './types';

/**
 * Mapea filename → set de números de línea (en el archivo NUEVO) que el
 * diff toca. Incluye líneas añadidas (+) y de contexto ( ). Excluye
 * líneas eliminadas (-), que no tienen número en el lado nuevo.
 *
 * GitHub permite inline comments tanto en líneas `RIGHT` (añadidas /
 * contexto) como en `LEFT` (eliminadas) — por ahora sólo soportamos
 * RIGHT, que es lo que el modelo reporta el 99% del tiempo.
 */
export function buildValidLineMap(files: DiffFile[]): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();

  for (const file of files) {
    if (!file.patch) continue;
    const valid = new Set<number>();
    const lines = file.patch.split('\n');
    let newLine = 0;

    for (const line of lines) {
      const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk) {
        newLine = parseInt(hunk[1], 10);
        continue;
      }
      const marker = line[0];
      if (marker === '+') {
        valid.add(newLine);
        newLine += 1;
      } else if (marker === '-') {
        // deleted line: no number on the new side
      } else if (marker === ' ') {
        valid.add(newLine);
        newLine += 1;
      }
      // else: "\ No newline at end of file" — ignore
    }

    map.set(file.filename, valid);
  }

  return map;
}

export interface FindingPartition {
  /** Findings con line number válido en el diff — se pueden postear inline. */
  inline: Array<{
    finding: ReviewFinding;
    /** Categoría original (security/bugs/perf/quality/suggestion). */
    category: string;
    /** Línea final validada (lado nuevo / RIGHT). */
    line: number;
    /** Línea inicial validada si es multi-línea (opcional). */
    startLine?: number;
  }>;
  /** Findings cuyo lineNumber no cae en el diff — van al comentario resumen. */
  leftover: Array<{ finding: ReviewFinding; category: string }>;
}

/**
 * Recorre todos los findings de un review y los separa en
 * `inline` (válidos para postear como review comment) y `leftover`
 * (sin línea válida o sin lineNumber). Esto último siempre va al
 * cuerpo principal del review para que ningún hallazgo se pierda.
 */
export function partitionFindings(
  categories: {
    bugs: ReviewFinding[];
    security: ReviewFinding[];
    performance: ReviewFinding[];
    codeQuality: ReviewFinding[];
    suggestions: ReviewFinding[];
  },
  validLines: Map<string, Set<number>>,
): FindingPartition {
  const inline: FindingPartition['inline'] = [];
  const leftover: FindingPartition['leftover'] = [];

  const all: Array<{ finding: ReviewFinding; category: string }> = [
    ...categories.security.map((f) => ({ finding: f, category: 'security' })),
    ...categories.bugs.map((f) => ({ finding: f, category: 'bugs' })),
    ...categories.performance.map((f) => ({ finding: f, category: 'performance' })),
    ...categories.codeQuality.map((f) => ({ finding: f, category: 'codeQuality' })),
    ...categories.suggestions.map((f) => ({ finding: f, category: 'suggestions' })),
  ];

  for (const entry of all) {
    const { finding } = entry;
    const fileLines = validLines.get(finding.file);

    // Si no tenemos diff para ese archivo o el modelo no dio lineNumber → leftover.
    if (!fileLines || fileLines.size === 0 || typeof finding.lineNumber !== 'number') {
      leftover.push(entry);
      continue;
    }

    // Intenta usar lineNumber tal cual; si no está, busca la línea válida
    // más cercana dentro de ±3 (a veces el modelo se desplaza por una línea).
    const target = pickClosestValidLine(finding.lineNumber, fileLines, 3);
    if (target === null) {
      leftover.push(entry);
      continue;
    }

    let startLine: number | undefined;
    if (typeof finding.startLine === 'number' && finding.startLine < target) {
      const start = pickClosestValidLine(finding.startLine, fileLines, 3);
      if (start !== null && start < target) startLine = start;
    }

    inline.push({ finding: entry.finding, category: entry.category, line: target, startLine });
  }

  return { inline, leftover };
}

/** Devuelve la línea válida exacta si está en el set; si no, la más cercana ≤ tolerance; si no, null. */
function pickClosestValidLine(target: number, valid: Set<number>, tolerance: number): number | null {
  if (valid.has(target)) return target;
  for (let delta = 1; delta <= tolerance; delta += 1) {
    if (valid.has(target - delta)) return target - delta;
    if (valid.has(target + delta)) return target + delta;
  }
  return null;
}
