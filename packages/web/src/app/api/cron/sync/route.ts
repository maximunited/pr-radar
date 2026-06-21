import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { fetchRepoPRs, setCached, DEFAULT_CONFIG } from "@pr-radar/core";

export const runtime = "nodejs";

// Called by Vercel Cron — protected by CRON_SECRET
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env["CRON_SECRET"]}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = process.env["GITHUB_TOKEN"];
  if (!token) return NextResponse.json({ error: "no token" }, { status: 500 });

  const octokit = new Octokit({ auth: token });

  await Promise.all(
    DEFAULT_CONFIG.repos.map(async (repoConfig) => {
      const result = await fetchRepoPRs(octokit, repoConfig);
      await setCached(result, DEFAULT_CONFIG.cacheTtl);
    }),
  );

  return NextResponse.json({ ok: true, synced: DEFAULT_CONFIG.repos.map((r) => r.repo) });
}
