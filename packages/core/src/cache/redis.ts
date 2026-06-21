import { Redis } from "@upstash/redis";
import type { FetchResult } from "../types.js";

let client: Redis | null = null;

function getClient(): Redis {
  if (!client) {
    client = new Redis({
      url: process.env["UPSTASH_REDIS_REST_URL"]!,
      token: process.env["UPSTASH_REDIS_REST_TOKEN"]!,
    });
  }
  return client;
}

function cacheKey(repo: string): string {
  return `pr-radar:prs:${repo.replace("/", ":")}`;
}

export async function getCached(repo: string): Promise<FetchResult | null> {
  try {
    const raw = await getClient().get<FetchResult>(cacheKey(repo));
    return raw ?? null;
  } catch {
    return null;
  }
}

export async function setCached(result: FetchResult, ttl: number): Promise<void> {
  try {
    await getClient().set(cacheKey(result.repo), result, { ex: ttl });
  } catch {
    // cache write failure is non-fatal
  }
}

export async function invalidate(repo: string): Promise<void> {
  try {
    await getClient().del(cacheKey(repo));
  } catch {
    // non-fatal
  }
}
