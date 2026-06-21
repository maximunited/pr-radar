import { NextResponse } from "next/server";
import { fetchRepoPRs, setCached, DEFAULT_CONFIG } from "@pr-radar/core";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env["CRON_SECRET"]}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = process.env["GITHUB_TOKEN"];
  if (!token) return NextResponse.json({ error: "no token" }, { status: 500 });

  await Promise.all(
    DEFAULT_CONFIG.repos.map(async (repoConfig) => {
      const result = await fetchRepoPRs(token, repoConfig);
      await setCached(result, DEFAULT_CONFIG.cacheTtl);
    }),
  );

  return NextResponse.json({ ok: true, synced: DEFAULT_CONFIG.repos.map((r) => r.repo) });
}
