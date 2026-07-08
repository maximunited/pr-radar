import { Redis } from "@upstash/redis";
import type { FetchResult } from "../types.js";

interface CacheEntry {
  value: FetchResult;
  storedAt: number;
  expiresAt: number;
}

const memCache = new Map<string, CacheEntry>();
const revalidating = new Set<string>();

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

export interface CacheResult {
  data: FetchResult | null;
  stale: boolean;
}

// Soft TTL: serve data but mark as stale for background refresh (default 15 min)
const STALE_AFTER = Number(process.env["CACHE_STALE_AFTER"] ?? 900);

export async function getCached(repo: string, author: string): Promise<CacheResult> {
  const key = cacheKey(repo, author);
  const now = Date.now();

  if (!isUpstashConfigured()) {
    const entry = memCache.get(key);
    if (!entry || entry.expiresAt < now) return { data: null, stale: false };
    const stale = now - entry.storedAt > STALE_AFTER * 1000;
    return { data: entry.value, stale };
  }

  try {
    const raw = await getClient().get<CacheEntry>(key);
    if (!raw) return { data: null, stale: false };
    const stale = now - raw.storedAt > STALE_AFTER * 1000;
    return { data: raw.value, stale };
  } catch {
    return { data: null, stale: false };
  }
}

export async function setCached(result: FetchResult, ttl: number, author: string): Promise<void> {
  const key = cacheKey(result.repo, author);
  const now = Date.now();
  const entry: CacheEntry = { value: result, storedAt: now, expiresAt: now + ttl * 1000 };

  if (!isUpstashConfigured()) {
    memCache.set(key, entry);
    return;
  }
  try {
    await getClient().set(key, entry, { ex: ttl });
  } catch {
    // non-fatal
  }
}

export function isRevalidating(repo: string, author: string): boolean {
  return revalidating.has(cacheKey(repo, author));
}

export function markRevalidating(repo: string, author: string, active: boolean): void {
  const key = cacheKey(repo, author);
  if (active) revalidating.add(key); else revalidating.delete(key);
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
