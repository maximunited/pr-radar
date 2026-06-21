import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Octokit } from "@octokit/rest";
import { getCached, setCached, fetchRepoPRs, DEFAULT_CONFIG } from "@pr-radar/core";

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

  const octokit = new Octokit({ auth: token });
  const results = await Promise.all(
    DEFAULT_CONFIG.repos.map(async (repoConfig) => {
      if (!forceRefresh) {
        const cached = await getCached(repoConfig.repo);
        if (cached) return cached;
      }
      const result = await fetchRepoPRs(octokit, repoConfig);
      await setCached(result, DEFAULT_CONFIG.cacheTtl);
      return result;
    }),
  );

  return NextResponse.json(results);
}
