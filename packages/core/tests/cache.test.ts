import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getCached, setCached, invalidate } from "../src/cache/redis.js";

describe("cache (in-memory fallback, no Upstash configured)", () => {
  it("returns null and not-stale when the cache is empty", async () => {
    const result = await getCached("org/repo", "alice");
    assert.deepStrictEqual(result, { data: null, stale: false });
  });

  it("round-trips setCached -> getCached", async () => {
    const value = { prs: [], fetchedAt: "2024-01-01T00:00:00Z", repo: "org/repo" };
    await setCached(value, 100, "alice");
    const result = await getCached("org/repo", "alice");
    assert.strictEqual(result.data, value);
    assert.strictEqual(result.stale, false);
  });

  it("expires entries after their TTL", async () => {
    await setCached({ prs: [], fetchedAt: "t", repo: "org/repo" } as any, 0, "bob");
    // ttl 0 -> expiresAt = now; a small tick makes it expired
    await new Promise((r) => setTimeout(r, 15));
    const result = await getCached("org/repo", "bob");
    assert.strictEqual(result.data, null);
  });

  it("invalidate removes the entry", async () => {
    await setCached({ prs: [], fetchedAt: "t", repo: "org/repo" } as any, 100, "carol");
    await invalidate("org/repo", "carol");
    const result = await getCached("org/repo", "carol");
    assert.strictEqual(result.data, null);
  });

  it("keeps entries isolated per repo/author key", async () => {
    await setCached({ prs: [], fetchedAt: "t", repo: "org/repo" } as any, 100, "dave");
    const other = await getCached("org/other", "dave");
    assert.strictEqual(other.data, null);
    const mine = await getCached("org/repo", "dave");
    assert.ok(mine.data !== null);
  });
});
