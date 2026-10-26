import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveGitHubToken } from "../src/github/auth.js";

describe("resolveGitHubToken", () => {
  it("returns GITHUB_TOKEN when set and does not call gh", () => {
    const orig = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "env-token";
    try {
      // gh must not be consulted when the env var is set
      assert.strictEqual(
        resolveGitHubToken(() => {
          throw new Error("gh must not be called when GITHUB_TOKEN is set");
        }),
        "env-token",
      );
    } finally {
      if (orig === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = orig;
    }
  });

  it("falls back to gh auth token when GITHUB_TOKEN is unset", () => {
    delete process.env.GITHUB_TOKEN;
    try {
      assert.strictEqual(resolveGitHubToken(() => "gh-token"), "gh-token");
    } finally {
      delete process.env.GITHUB_TOKEN;
    }
  });

  it("returns null when gh is not installed or not authenticated", () => {
    delete process.env.GITHUB_TOKEN;
    try {
      assert.strictEqual(
        resolveGitHubToken(() => {
          throw new Error("gh: not found");
        }),
        null,
      );
    } finally {
      delete process.env.GITHUB_TOKEN;
    }
  });
});
