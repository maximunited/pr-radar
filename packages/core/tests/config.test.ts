import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONFIG } from "../src/config/default.js";
import { mergeWithDefault, parseConfig, reposFromCLIArgs } from "../src/config/loader.js";
import type { AppConfig, RepoConfig } from "../src/types.js";

describe("DEFAULT_CONFIG", () => {
  it("defines the default repositories", () => {
    assert.strictEqual(DEFAULT_CONFIG.repos.length, 3);
    assert.ok(DEFAULT_CONFIG.repos.some((r) => r.repo === "medik8s/system-tests"));
    assert.ok(DEFAULT_CONFIG.repos.some((r) => r.repo === "openshift/release"));
    assert.ok(DEFAULT_CONFIG.repos.some((r) => r.repo === "medik8s/storage-based-remediation"));
  });

  it("has a finite positive cacheTtl", () => {
    assert.ok(Number.isFinite(DEFAULT_CONFIG.cacheTtl));
    assert.ok(DEFAULT_CONFIG.cacheTtl > 0);
  });
});

describe("mergeWithDefault", () => {
  it("returns the defaults unchanged when partial has no repos", () => {
    const out = mergeWithDefault({});
    assert.deepStrictEqual(out.repos, DEFAULT_CONFIG.repos);
    assert.strictEqual(out.cacheTtl, DEFAULT_CONFIG.cacheTtl);
  });

  it("uses the provided repos as the list, filling ciPatterns from defaults for known repos", () => {
    const out = mergeWithDefault({
      repos: [{ repo: "org/extra", ciPatterns: { e2e: ["*e2e*"], ignore: ["skip"] } }],
    });
    const names = out.repos.map((r) => r.repo);
    assert.deepStrictEqual(names, ["org/extra"]);
    const extra = out.repos.find((r) => r.repo === "org/extra")!;
    assert.deepStrictEqual(extra.ciPatterns, { e2e: ["*e2e*"], ignore: ["skip"] });
  });

  it("keeps all default repos when partial.repos is undefined", () => {
    const out = mergeWithDefault({ cacheTtl: 5 });
    assert.deepStrictEqual(out.repos, DEFAULT_CONFIG.repos);
    assert.strictEqual(out.cacheTtl, 5);
  });

  it("fills missing ciPatterns from the matching default repo", () => {
    const out = mergeWithDefault({
      repos: [{ repo: "medik8s/system-tests", ciPatterns: { e2e: ["custom*"], ignore: [] } }],
    });
    const r = out.repos.find((x) => x.repo === "medik8s/system-tests")!;
    assert.deepStrictEqual(r.ciPatterns.e2e, ["custom*"]);
    assert.deepStrictEqual(r.ciPatterns.ignore, []);
  });

  it("overrides cacheTtl", () => {
    assert.strictEqual(mergeWithDefault({ cacheTtl: 42 }).cacheTtl, 42);
  });

  it("returns a valid AppConfig", () => {
    const out: AppConfig = mergeWithDefault({ repos: [{ repo: "org/repo" }] });
    assert.ok(Array.isArray(out.repos));
    assert.ok(out.repos.every((r): r is RepoConfig => typeof r.repo === "string"));
  });
});

describe("parseConfig", () => {
  it("validates and returns an AppConfig", () => {
    const out = parseConfig({ repos: [{ repo: "org/repo" }] });
    assert.ok(Array.isArray(out.repos));
    assert.ok(out.repos.some((r) => r.repo === "org/repo"));
  });

  it("throws on invalid config (zod schema)", () => {
    assert.throws(() => parseConfig({ repos: "not-an-array" as unknown as never }));
    assert.throws(() => parseConfig({ cacheTtl: "not-a-number" as unknown as never }));
  });
});

describe("reposFromCLIArgs", () => {
  it("returns base unchanged when there are no args", () => {
    const base: AppConfig = DEFAULT_CONFIG;
    assert.deepStrictEqual(reposFromCLIArgs([], base), base);
  });

  it("re-adds matched repos with default patterns and appends new repos", () => {
    const base: AppConfig = {
      ...DEFAULT_CONFIG,
      repos: [{ repo: "org/keep", ciPatterns: { e2e: ["k*"], ignore: [] } }],
    };
    const out = reposFromCLIArgs(["org/keep", "org/new"], base);
    const names = out.repos.map((r) => r.repo);
    assert.deepStrictEqual(names, ["org/keep", "org/new"]);
    // org/keep keeps its name but loses its custom patterns (reset to defaults)
    const keep = out.repos.find((r) => r.repo === "org/keep")!;
    assert.deepStrictEqual(keep.ciPatterns.e2e, ["pj-rehearse*"]);
  });
});
