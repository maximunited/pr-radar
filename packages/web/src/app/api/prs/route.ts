import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getCached, setCached, fetchRepoPRs, DEFAULT_CONFIG, DEFAULT_AUTHORS } from "@pr-radar/core";
import type { FetchResult } from "@pr-radar/core";

export const runtime = "nodejs";

async function resolveToken(userId: string): Promise<string | undefined> {
  if (process.env["GITHUB_TOKEN"]) return process.env["GITHUB_TOKEN"];
  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserOauthAccessToken(userId, "oauth_github");
    return data[0]?.token;
  } catch {
    return undefined;
  }
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const token = await resolveToken(userId);
  if (!token) {
    return NextResponse.json({ error: "no_github_token" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const forceRefresh = searchParams.get("refresh") === "1";
  const authorsParam = searchParams.get("authors");
  const authors: string[] = authorsParam
    ? authorsParam.split(",").map((a) => a.trim()).filter(Boolean)
    : [...DEFAULT_AUTHORS];

  // For each (repo × author): serve cache or fetch
  const results = await Promise.all(
    DEFAULT_CONFIG.repos.map(async (repoConfig): Promise<FetchResult> => {
      const perAuthor = await Promise.all(
        authors.map(async (author) => {
          if (!forceRefresh) {
            const cached = await getCached(repoConfig.repo, author);
            if (cached) return cached;
          }
          const result = await fetchRepoPRs(token, repoConfig, author);
          await setCached(result, DEFAULT_CONFIG.cacheTtl, author);
          return result;
        }),
      );

      // Merge all authors' PRs into one FetchResult per repo
      const merged: FetchResult = {
        prs: perAuthor.flatMap((r) => r.prs),
        fetchedAt: perAuthor[0]?.fetchedAt ?? new Date().toISOString(),
        repo: repoConfig.repo,
      };
      return merged;
    }),
  );

  return NextResponse.json(results);
}
