import { Redis } from "@upstash/redis";
import type { FetchResult } from "../types.js";

// In-memory fallback for local dev (no Upstash creds)
const memCache = new Map<string, { value: FetchResult; expiresAt: number }>();

let client: Redis | null = null;

function getRedisUrl(): string | undefined {
  // Vercel Upstash integration uses KV_REST_API_URL; manual setup uses UPSTASH_REDIS_REST_URL
  return process.env["KV_REST_API_URL"] ?? process.env["UPSTASH_REDIS_REST_URL"];
}

function getRedisToken(): string | undefined {
  return process.env["KV_REST_API_TOKEN"] ?? process.env["UPSTASH_REDIS_REST_TOKEN"];
}

function isUpstashConfigured(): boolean {
  return !!(getRedisUrl() && getRedisToken());
}

function getClient(): Redis {
  if (!client) {
    client = new Redis({ url: getRedisUrl()!, token: getRedisToken()! });
  }
  return client;
}

function cacheKey(repo: string): string {
  return `pr-radar:prs:${repo.replace("/", ":")}`;
}

export async function getCached(repo: string): Promise<FetchResult | null> {
  if (!isUpstashConfigured()) {
    const entry = memCache.get(cacheKey(repo));
    if (!entry || entry.expiresAt < Date.now()) return null;
    return entry.value;
  }
  try {
    const raw = await getClient().get<FetchResult>(cacheKey(repo));
    return raw ?? null;
  } catch {
    return null;
  }
}

export async function setCached(result: FetchResult, ttl: number): Promise<void> {
  if (!isUpstashConfigured()) {
    memCache.set(cacheKey(result.repo), { value: result, expiresAt: Date.now() + ttl * 1000 });
    return;
  }
  try {
    await getClient().set(cacheKey(result.repo), result, { ex: ttl });
  } catch {
    // non-fatal
  }
}

export async function invalidate(repo: string): Promise<void> {
  memCache.delete(cacheKey(repo));
  if (!isUpstashConfigured()) return;
  try {
    await getClient().del(cacheKey(repo));
  } catch {
    // non-fatal
  }
}
