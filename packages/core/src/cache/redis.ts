import { Redis } from "@upstash/redis";
import type { FetchResult } from "../types.js";

const memCache = new Map<string, { value: FetchResult; expiresAt: number }>();

let client: Redis | null = null;

function isUpstashConfigured(): boolean {
  return !!(
    (process.env["KV_REST_API_URL"] ?? process.env["UPSTASH_REDIS_REST_URL"]) &&
    (process.env["KV_REST_API_TOKEN"] ?? process.env["UPSTASH_REDIS_REST_TOKEN"])
  );
}

function getClient(): Redis {
  if (!client) {
    client = new Redis({
      url: (process.env["KV_REST_API_URL"] ?? process.env["UPSTASH_REDIS_REST_URL"])!,
      token: (process.env["KV_REST_API_TOKEN"] ?? process.env["UPSTASH_REDIS_REST_TOKEN"])!,
    });
  }
  return client;
}

function cacheKey(repo: string, author: string): string {
  return `pr-radar:prs:${repo.replace("/", ":")}:${author}`;
}

export async function getCached(repo: string, author: string): Promise<FetchResult | null> {
  if (!isUpstashConfigured()) {
    const entry = memCache.get(cacheKey(repo, author));
    if (!entry || entry.expiresAt < Date.now()) return null;
    return entry.value;
  }
  try {
    const raw = await getClient().get<FetchResult>(cacheKey(repo, author));
    return raw ?? null;
  } catch {
    return null;
  }
}

export async function setCached(result: FetchResult, ttl: number, author: string): Promise<void> {
  const key = cacheKey(result.repo, author);
  if (!isUpstashConfigured()) {
    memCache.set(key, { value: result, expiresAt: Date.now() + ttl * 1000 });
    return;
  }
  try {
    await getClient().set(key, result, { ex: ttl });
  } catch {
    // non-fatal
  }
}

export async function invalidate(repo: string, author: string): Promise<void> {
  memCache.delete(cacheKey(repo, author));
  if (!isUpstashConfigured()) return;
  try {
    await getClient().del(cacheKey(repo, author));
  } catch {
    // non-fatal
  }
}
