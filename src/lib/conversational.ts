// ============================================================
// CONVERSATIONAL.TS — Handle replies to PR Sentinel comments
// ------------------------------------------------------------
// When someone replies to a PR Sentinel review comment or
// mentions @pr-sentinel in a PR comment, this module generates
// a focused, contextual response.
// ============================================================

import { GoogleGenAI } from '@google/genai';
import { PRInfo } from './types';
import { postReviewComment, findLatestReviewComment } from './github';
import { REVIEW_MARKER_NAME } from './review-marker';

const DEFAULT_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash';

/** Signatures that identify PR Sentinel's own comments — used to prevent self-reply loops. */
const SELF_SIGNATURES = [
  '🤖 PR Sentinel',
  REVIEW_MARKER_NAME,
  'PR Sentinel — conversational reply',
  'PR Sentinel — automated re-verification',
];

/** Check if a comment was written by PR Sentinel itself. */
function isSelfComment(commentBody: string): boolean {
  return SELF_SIGNATURES.some((sig) => commentBody.includes(sig));
}

/** Check if a comment is addressed to PR Sentinel. */
export function isAddressedToSentinel(
  commentBody: string,
  /** The body of the comment this is replying to (if it's a reply). */
  parentCommentBody?: string | null,
): boolean {
  // Never respond to our own comments (prevent infinite loop).
  if (isSelfComment(commentBody)) return false;

  const lower = commentBody.toLowerCase();

  // Direct mention
  if (lower.includes('@pr-sentinel') || lower.includes('@pr_sentinel')) {
    return true;
  }

  // Reply to a PR Sentinel comment (parent has our marker)
  if (parentCommentBody && parentCommentBody.includes(REVIEW_MARKER_NAME)) {
    return true;
  }

  return false;
}

/** Extract the question/request from a comment addressed to PR Sentinel. */
function extractQuestion(commentBody: string): string {
  // Remove the mention itself
  return commentBody
    .replace(/@pr[_-]sentinel/gi, '')
    .trim();
}

/**
 * Generate a conversational reply to a user's comment using Gemini.
 * Uses a lighter prompt than full review — just answers the question
 * in context of the previous review.
 */
export async function generateReply(
  question: string,
  previousReviewBody: string | null,
  commentAuthor: string,
  prTitle: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured for conversational replies');
  }

  const client = new GoogleGenAI({ apiKey });

  const systemPrompt = `You are PR Sentinel, an AI code reviewer. A developer is asking you a follow-up question about your code review. Be helpful, concise, and specific. If they're asking for clarification on a finding, explain it clearly. If they disagree with a finding, consider their point fairly. If they ask you to look at something specific, do your best with the context you have.

Keep your response under 500 words. Use GitHub-flavored markdown. Be professional but friendly.`;

  const userPrompt = `## Context
PR title: "${prTitle}"
Question from: @${commentAuthor}

${previousReviewBody ? `## Your previous review (for context)\n${previousReviewBody.slice(0, 8000)}\n` : '(No previous review found)'}

## Developer's question/comment
${question}

## Your response
Respond helpfully to the developer's comment. If they point out something you missed or got wrong, acknowledge it gracefully.`;

  try {
    const response = await client.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemPrompt,
        thinkingConfig: { thinkingBudget: 1024 },
      },
    });

    const text = (response as { text?: string }).text ?? '';
    return text || 'I wasn\'t able to generate a response. Please try again.';
  } catch (error) {
    console.error('[conversational] Gemini call failed:', error);
    throw new Error('Failed to generate reply');
  }
}

/**
 * Full flow: detect if addressed, generate reply, post it.
 * Returns null if the comment isn't addressed to PR Sentinel.
 */
export async function handleCommentEvent(
  prInfo: PRInfo,
  comment: {
    id: number;
    body: string;
    author: string;
    htmlUrl: string;
    inReplyToId?: number;
  },
  prTitle: string,
): Promise<{ replied: boolean; commentUrl?: string } | null> {
  // Find the previous review for context
  const previousReview = await findLatestReviewComment(prInfo);

  // Check if this is a reply to our comment or mentions us
  const parentBody = previousReview?.body ?? null;
  if (!isAddressedToSentinel(comment.body, parentBody)) {
    return null;
  }

  const question = extractQuestion(comment.body);
  if (!question) {
    return { replied: false };
  }

  console.log(`[conversational] Replying to @${comment.author} on PR #${prInfo.pullNumber}`);

  const replyText = await generateReply(
    question,
    previousReview?.body ?? null,
    comment.author,
    prTitle,
  );

  const formattedReply = `> ${comment.body.split('\n')[0]}\n\n${replyText}\n\n---\n*🤖 PR Sentinel — conversational reply*`;

  const { commentUrl } = await postReviewComment(prInfo, formattedReply);

  return { replied: true, commentUrl };
}
