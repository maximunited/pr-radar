import type { AppConfig } from "../types.js";

export const DEFAULT_AUTHORS = ["maximunited", "ugreener", "gamado"] as const;

export const DEFAULT_CONFIG: AppConfig = {
  repos: [
    {
      repo: "medik8s/system-tests",
      ciPatterns: {
        e2e: ["pj-rehearse*", "*e2e*"],
        ignore: [],
      },
    },
    {
      repo: "openshift/release",
      ciPatterns: {
        e2e: ["pj-rehearse*", "*rehearse*"],
        ignore: [],
      },
    },
  ],
  cacheTtl: Number(process.env["CACHE_TTL"] ?? 300),
};

// Pattern-matched so we handle org-specific bot names (e.g. qodo-2-for-medik8s)
export const BOT_PATTERNS = {
  qodo: /qodo/i,
  coderabbit: /coderabbit/i,
  ignored: /^(github-actions|dependabot|renovate|tide|coderabbit|qodo)\b/i,
} as const;

// Keep for backward-compat references in bots.ts
export const BOT_USERNAMES = {
  qodo: "qodo-merge[bot]",
  coderabbit: "coderabbitai[bot]",
  ignored: ["github-actions[bot]", "dependabot[bot]", "renovate[bot]"],
} as const;

export const QODO_THINKING_PATTERNS = [
  /generating/i,
  /analyzing/i,
  /reviewing/i,
  /processing/i,
];

export const QODO_RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /quota.*exceeded/i,
  /daily.*limit/i,
];

export const CODERABBIT_THINKING_PATTERNS = [
  /generating/i,
  /analyzing/i,
  /processing/i,
  /walkthrough/i,
];

export const CODERABBIT_RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /quota.*exceeded/i,
];
