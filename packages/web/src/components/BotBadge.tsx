"use client";
import type { BotReviewState } from "@/lib/types";

const SPINNER = (
  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
);

export function BotBadge({ state }: { state: BotReviewState }) {
  switch (state.state) {
    case "missing":
      return <span className="text-gray-600 text-xs">—</span>;
    case "thinking":
      return <span title="Generating...">{SPINNER}</span>;
    case "rate_limited":
      return (
        <span title="Rate limited" className="inline-flex items-center gap-1 rounded-full bg-green-900 px-2 py-0.5 text-xs text-green-300">
          limit
        </span>
      );
    case "clean":
      return (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">
          ✓
        </span>
      );
    case "open":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-900 px-2 py-0.5 text-xs font-semibold text-red-300">
          {state.count}
        </span>
      );
  }
}
