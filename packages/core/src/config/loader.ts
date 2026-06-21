import { z } from "zod";
import type { AppConfig, RepoConfig } from "../types.js";
import { DEFAULT_CONFIG } from "./default.js";

const RepoCiPatternsSchema = z.object({
  e2e: z.array(z.string()).default([]),
  ignore: z.array(z.string()).default([]),
});

const RepoConfigSchema = z.object({
  repo: z.string(),
  ciPatterns: RepoCiPatternsSchema.optional(),
});

const AppConfigSchema = z.object({
  repos: z.array(RepoConfigSchema).optional(),
  cacheTtl: z.number().optional(),
});

export function mergeWithDefault(partial: z.infer<typeof AppConfigSchema>): AppConfig {
  const repos: RepoConfig[] = partial.repos?.map((r) => {
    const defaultRepo = DEFAULT_CONFIG.repos.find((d) => d.repo === r.repo);
    return {
      repo: r.repo,
      ciPatterns: {
        e2e: r.ciPatterns?.e2e ?? defaultRepo?.ciPatterns.e2e ?? ["pj-rehearse*"],
        ignore: r.ciPatterns?.ignore ?? defaultRepo?.ciPatterns.ignore ?? [],
      },
    };
  }) ?? DEFAULT_CONFIG.repos;

  return {
    repos,
    cacheTtl: partial.cacheTtl ?? DEFAULT_CONFIG.cacheTtl,
  };
}

export function parseConfig(raw: unknown): AppConfig {
  const parsed = AppConfigSchema.parse(raw);
  return mergeWithDefault(parsed);
}

export function reposFromCLIArgs(args: string[], base: AppConfig): AppConfig {
  if (args.length === 0) return base;
  const extra: RepoConfig[] = args.map((repo) => ({
    repo,
    ciPatterns: { e2e: ["pj-rehearse*"], ignore: [] },
  }));
  const existing = base.repos.filter((r) => !args.includes(r.repo));
  return { ...base, repos: [...existing, ...extra] };
}
