// ============================================================
// PROMPT.TS — System prompt y schema para el análisis de PRs
// ============================================================

import { Type } from '@google/genai';
import { PRMetadata, DiffFile, ReviewResult } from './types';

/**
 * System prompt para el agente de revisión de PRs.
 * Diseñado para encontrar bugs REALES, no genéricos.
 */
export function buildSystemPrompt(): string {
  return `You are PR Sentinel, an expert senior code reviewer with 15+ years of experience in security, performance, and code quality. You review Pull Requests on GitHub.

## YOUR MISSION
Analyze the PR diff and produce a thorough, actionable code review. Find REAL issues, not generic advice. Every finding must reference specific code.

## WHAT TO LOOK FOR (priority order)

### 🔴 SECURITY ISSUES (Critical)
- SQL Injection: raw string concatenation in queries, missing parameterized queries
- XSS: unescaped user input in HTML, dangerouslySetInnerHTML with user data
- CSRF: missing tokens on state-changing endpoints
- Auth flaws: missing auth checks, broken access control
- Secrets: hardcoded API keys, tokens, passwords
- Path traversal: user-controlled file paths without validation
- Missing input validation on endpoints

### 🟠 BUGS & CORRECTNESS (High)
- Logic errors, off-by-one, missing edge cases
- Race conditions without synchronization
- Null/undefined crashes
- Missing error handling, empty catch blocks
- Data loss (UPDATE without WHERE)
- Broken pagination

### 🟡 PERFORMANCE (Medium)
- N+1 queries: queries inside loops
- Missing indexes
- Memory leaks
- Unnecessary re-renders in React
- Blocking I/O in async contexts

### 🔵 CODE QUALITY (Lower)
- Code smells, long functions, deep nesting
- DRY violations
- Confusing naming
- TypeScript 'any' usage

## RULES
1. Be specific — reference exact file and line range
2. Be actionable — provide concrete fix with code for each issue
3. Don't invent issues — if code is good, say so
4. Use 'critical' sparingly — only data loss, security breaches, or outages
5. Acknowledge good code in positiveAspects
6. Consider the framework conventions (Next.js, React, etc.)

Return structured JSON matching the provided schema. Do NOT wrap in markdown code blocks.`;
}

/**
 * Construye el user prompt con contexto del PR y diff.
 */
export function buildUserPrompt(
  metadata: PRMetadata,
  files: DiffFile[],
  chunkInfo?: { chunkId: number; totalChunks: number }
): string {
  const chunkHeader = chunkInfo
    ? `\n⚠️ This is chunk ${chunkInfo.chunkId} of ${chunkInfo.totalChunks}. Focus on the files in this chunk.\n`
    : '';

  const filesSection = files
    .map((f) => {
      return [
        `### File: ${f.filename} [${f.status}] (+${f.additions}, -${f.deletions})`,
        '```diff',
        f.patch || '(binary file — no diff available)',
        '```',
      ].join('\n');
    })
    .join('\n\n');

  return `## Pull Request: "${metadata.title}"
**Author:** ${metadata.author}
**Branch:** ${metadata.headBranch} → ${metadata.baseBranch}
**Changes:** ${metadata.filesChanged} files, +${metadata.additions} -${metadata.deletions}

**Description:**
${metadata.body || '(no description provided)'}
${chunkHeader}
## Changed Files

${filesSection}

Analyze all files above. Find real bugs, security issues, performance problems, and code quality issues. Be thorough but don't invent problems.`;
}

/**
 * Schema de respuesta para Gemini structured outputs.
 */
export function getReviewResponseSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      summary: {
        type: Type.STRING,
        description: 'A 2-3 sentence executive summary of the PR review findings',
      },
      overallRiskLevel: {
        type: Type.STRING,
        enum: ['critical', 'high', 'medium', 'low', 'clean'],
        description: 'Overall risk level based on findings',
      },
      categories: {
        type: Type.OBJECT,
        properties: {
          bugs: { type: Type.ARRAY, items: getFindingSchema() },
          security: { type: Type.ARRAY, items: getFindingSchema() },
          performance: { type: Type.ARRAY, items: getFindingSchema() },
          codeQuality: { type: Type.ARRAY, items: getFindingSchema() },
          suggestions: { type: Type.ARRAY, items: getFindingSchema() },
        },
        required: ['bugs', 'security', 'performance', 'codeQuality', 'suggestions'],
      },
      positiveAspects: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of positive aspects of the code',
      },
    },
    required: ['summary', 'overallRiskLevel', 'categories', 'positiveAspects'],
  };
}

function getFindingSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: 'Short title of the finding' },
      severity: { type: Type.STRING, enum: ['critical', 'high', 'medium', 'low', 'info'] },
      file: { type: Type.STRING, description: 'File path where the issue was found' },
      lineRange: { type: Type.STRING, description: 'Line range, e.g. "L15-L23"' },
      description: { type: Type.STRING, description: 'Detailed explanation of the issue' },
      suggestion: { type: Type.STRING, description: 'Concrete fix with code if applicable' },
      cweId: { type: Type.STRING, description: 'CWE ID for security issues, e.g. "CWE-79"' },
    },
    required: ['title', 'severity', 'file', 'description', 'suggestion'],
  };
}

/**
 * Formatea el ReviewResult como Markdown para postear en GitHub.
 */
export function formatReviewAsMarkdown(review: ReviewResult): string {
  const riskEmoji: Record<string, string> = {
    critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', clean: '✅',
  };
  const sevEmoji: Record<string, string> = {
    critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: 'ℹ️',
  };

  let md = `# 🤖 PR Sentinel — Automated Code Review\n\n`;
  md += `## ${riskEmoji[review.overallRiskLevel] ?? '❓'} Overall Risk: **${review.overallRiskLevel.toUpperCase()}**\n\n`;
  md += `${review.summary}\n\n`;

  // Cache metadata
  md += `<details>\n<summary>📊 Analysis Metadata</summary>\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Model | ${review.metadata.modelUsed} |\n`;
  md += `| Cache Hit | ${review.metadata.cacheHit ? '✅ Yes' : '❌ No'} |\n`;
  md += `| Cached Tokens | ${review.metadata.cachedTokens.toLocaleString()} |\n`;
  md += `| Total Tokens | ${review.metadata.totalTokens.toLocaleString()} |\n`;
  md += `| Processing Time | ${review.metadata.processingTimeMs}ms |\n`;
  md += `| Chunks Processed | ${review.metadata.chunksProcessed} |\n`;
  md += `\n</details>\n\n---\n\n`;

  const categories = [
    { title: '🔒 Security Issues', items: review.categories.security },
    { title: '🐛 Bugs & Correctness', items: review.categories.bugs },
    { title: '⚡ Performance', items: review.categories.performance },
    { title: '🧹 Code Quality', items: review.categories.codeQuality },
    { title: '💡 Suggestions', items: review.categories.suggestions },
  ];

  for (const cat of categories) {
    if (cat.items.length === 0) continue;
    md += `### ${cat.title}\n\n`;
    for (const f of cat.items) {
      md += `#### ${sevEmoji[f.severity] ?? '❓'} [${f.severity.toUpperCase()}] ${f.title}\n`;
      md += `📄 \`${f.file}\``;
      if (f.lineRange) md += ` (${f.lineRange})`;
      if (f.cweId) md += ` | 🏷️ ${f.cweId}`;
      md += `\n\n${f.description}\n\n`;
      md += `**Suggested fix:**\n${f.suggestion}\n\n---\n\n`;
    }
  }

  if (review.positiveAspects.length > 0) {
    md += `### ✨ Positive Aspects\n\n`;
    for (const a of review.positiveAspects) md += `- ${a}\n`;
    md += '\n';
  }

  md += `\n---\n*Generated by [PR Sentinel](https://github.com) — AI-powered code review*`;
  return md;
}
