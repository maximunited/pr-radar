import type { BotReviewState } from "../types.js";
import {
  BOT_USERNAMES,
  CODERABBIT_RATE_LIMIT_PATTERNS,
  CODERABBIT_THINKING_PATTERNS,
  QODO_RATE_LIMIT_PATTERNS,
  QODO_THINKING_PATTERNS,
} from "../config/default.js";

type RawComment = { body: string; user: { login: string } | null };

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
  // Count unchecked markdown checkboxes: - [ ] or * [ ]
  const matches = body.match(/^[\s-*]+\[ \]/gm);
  return matches?.length ?? 0;
}

export function parseBotState(
  comments: RawComment[],
  botLogin: string,
  thinkingPatterns: RegExp[],
  rateLimitPatterns: RegExp[],
): BotReviewState {
  const botComments = comments
    .filter((c) => c.user?.login === botLogin)
    .map((c) => c.body);

  if (botComments.length === 0) return { state: "missing" };

  const latest = botComments[botComments.length - 1]!;
  const classification = classifyBotComment(latest, thinkingPatterns, rateLimitPatterns);

  if (classification === "thinking") return { state: "thinking" };
  if (classification === "rate_limited") return { state: "rate_limited" };

  const count = botComments.reduce((sum, b) => sum + countActionItems(b), 0);
  return count > 0 ? { state: "open", count } : { state: "clean" };
}

export function parseQodo(comments: RawComment[]): BotReviewState {
  return parseBotState(
    comments,
    BOT_USERNAMES.qodo,
    QODO_THINKING_PATTERNS,
    QODO_RATE_LIMIT_PATTERNS,
  );
}

export function parseCodeRabbit(comments: RawComment[]): BotReviewState {
  return parseBotState(
    comments,
    BOT_USERNAMES.coderabbit,
    CODERABBIT_THINKING_PATTERNS,
    CODERABBIT_RATE_LIMIT_PATTERNS,
  );
}
