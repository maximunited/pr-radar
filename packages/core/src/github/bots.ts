import type { BotReviewState } from "../types.js";
import {
  BOT_PATTERNS,
  CODERABBIT_RATE_LIMIT_PATTERNS,
  CODERABBIT_THINKING_PATTERNS,
  QODO_RATE_LIMIT_PATTERNS,
  QODO_THINKING_PATTERNS,
} from "../config/default.js";

export type RawComment = { body: string; user: { login: string } | null };

function classifyBotComment(
  body: string,
  thinkingPatterns: RegExp[],
  rateLimitPatterns: RegExp[],
): "thinking" | "rate_limited" | "has_content" {
  if (rateLimitPatterns.some((p) => p.test(body))) return "rate_limited";
  if (thinkingPatterns.some((p) => p.test(body))) return "thinking";
  return "has_content";
}

function countActionItems(body: string): number {
  // Unchecked markdown checkboxes
  const checkboxes = body.match(/^[\s-*]+\[ \]/gm)?.length ?? 0;
  // CodeRabbit "Actionable comments posted: N" header
  const crMatch = body.match(/actionable comments posted:\s*(\d+)/i);
  const crCount = crMatch ? parseInt(crMatch[1]!, 10) : 0;
  return checkboxes + crCount;
}

function parseBotByPattern(
  comments: RawComment[],
  botPattern: RegExp,
  thinkingPatterns: RegExp[],
  rateLimitPatterns: RegExp[],
): BotReviewState {
  const botComments = comments
    .filter((c) => c.user?.login && botPattern.test(c.user.login))
    .map((c) => c.body);

  if (botComments.length === 0) return { state: "missing" };

  const latest = botComments[botComments.length - 1]!;
  const classification = classifyBotComment(latest, thinkingPatterns, rateLimitPatterns);

  if (classification === "thinking") return { state: "thinking" };
  if (classification === "rate_limited") return { state: "rate_limited" };

  const count = botComments.reduce((sum, b) => sum + countActionItems(b), 0);
  return count > 0 ? { state: "open", count } : { state: "clean" };
}

export function isIgnoredBot(login: string): boolean {
  return BOT_PATTERNS.ignored.test(login);
}

export function parseQodo(comments: RawComment[]): BotReviewState {
  return parseBotByPattern(comments, BOT_PATTERNS.qodo, QODO_THINKING_PATTERNS, QODO_RATE_LIMIT_PATTERNS);
}

export function parseCodeRabbit(comments: RawComment[]): BotReviewState {
  return parseBotByPattern(comments, BOT_PATTERNS.coderabbit, CODERABBIT_THINKING_PATTERNS, CODERABBIT_RATE_LIMIT_PATTERNS);
}
