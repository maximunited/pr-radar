import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Octokit } from "@octokit/rest";
import { getCached, setCached, fetchRepoPRs, DEFAULT_CONFIG } from "@pr-radar/core";
import { authOptions } from "../auth/[...nextauth]/route";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const token =
    process.env["GITHUB_TOKEN"] ??
    (session as Record<string, unknown> | null)?.["accessToken"] as string | undefined;

  if (!token) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
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
