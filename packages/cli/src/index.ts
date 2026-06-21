#!/usr/bin/env node
import { Octokit } from "@octokit/rest";
import Table from "cli-table3";
import {
  DEFAULT_CONFIG,
  fetchRepoPRs,
  resolveGitHubToken,
  reposFromCLIArgs,
  type BotReviewState,
  type PullRequest,
} from "@pr-radar/core";

const extraRepos = process.argv.slice(2).filter((a) => a.includes("/"));
const config = reposFromCLIArgs(extraRepos, DEFAULT_CONFIG);

const token = resolveGitHubToken();
if (!token) {
  console.error("No GitHub token found. Set GITHUB_TOKEN or run `gh auth login`.");
  process.exit(1);
}

const octokit = new Octokit({ auth: token });

console.log(`Fetching PRs for: ${config.repos.map((r) => r.repo).join(", ")}…\n`);

const results = await Promise.all(config.repos.map((r) => fetchRepoPRs(octokit, r)));
const prs: PullRequest[] = results.flatMap((r) => r.prs);

function botLabel(state: BotReviewState): string {
  switch (state.state) {
    case "missing": return "—";
    case "thinking": return "…";
    case "rate_limited": return "limit";
    case "clean": return "✓";
    case "open": return `${state.count}`;
  }
}

function ciSummary(pr: PullRequest): string {
  const counts = { success: 0, failure: 0, pending: 0 };
  for (const j of pr.ciJobs) {
    if (j.status === "success") counts.success++;
    else if (j.status === "failure") counts.failure++;
    else if (j.status === "pending") counts.pending++;
  }
  const parts: string[] = [];
  if (counts.failure) parts.push(`✗${counts.failure}`);
  if (counts.pending) parts.push(`…${counts.pending}`);
  if (counts.success) parts.push(`✓${counts.success}`);
  return parts.join(" ") || "—";
}

const table = new Table({
  head: ["#", "Repo", "State", "Title", "CI", "E2E", "Qodo", "CR", "Comments", "Reviews", "Commits"],
  style: { head: ["cyan"] },
  colWidths: [6, 22, 7, 40, 10, 5, 7, 7, 10, 10, 8],
  wordWrap: true,
});

for (const pr of prs) {
  const e2e = pr.e2eJob ? (pr.e2eJob.status === "success" ? "✓" : pr.e2eJob.status === "failure" ? "✗" : "…") : "—";
  table.push([
    `#${pr.number}`,
    pr.repo,
    pr.state,
    pr.title.slice(0, 38),
    ciSummary(pr),
    e2e,
    botLabel(pr.qodo),
    botLabel(pr.coderabbit),
    `${pr.peerComments.unresolved}/${pr.peerComments.total}`,
    `✓${pr.reviewers.approved} ✗${pr.reviewers.changesRequested}`,
    String(pr.commits),
  ]);
}

console.log(table.toString());
console.log(`\n${prs.length} PRs fetched at ${new Date().toLocaleTimeString()}`);
