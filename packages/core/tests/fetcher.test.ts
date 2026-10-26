import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { graphql } from "@octokit/graphql";
import { parsePR, fetchRepoPRs, type FetchRepoPRsOptions } from "../src/github/fetcher.js";
import type { PullRequest } from "../src/types.js";

interface FixturePR {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  commits: { totalCount: number };
  author: { login: string } | null;
  labels: { nodes: Array<{ name: string }> };
  statusCheckRollup: any;
  reviews: { nodes: any[] };
  comments: { nodes: any[] };
  reviewThreads: { nodes: any[] };
  timelineItems: { nodes: any[] };
  reviewRequests: { nodes: any[] };
}

const repoConfig: any = { repo: "org/repo", ciPatterns: { e2e: ["pj-rehearse*", "*e2e*"], ignore: [] } };

const thread = (
  isResolved: boolean,
  isOutdated: boolean,
  login: string | null,
) => ({
  isResolved,
  isOutdated,
  comments: { nodes: login ? [{ author: { login } }] : [] },
});

const basePR: FixturePR = {
  number: 10,
  title: "Fix bug",
  url: "https://github.com/org/repo/pull/10",
  state: "OPEN",
  isDraft: false,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-02T00:00:00Z",
  mergedAt: null,
  commits: { totalCount: 3 },
  author: { login: "author1" },
  labels: { nodes: [{ name: "bug" }] },
  statusCheckRollup: {
    contexts: { nodes: [
      { __typename: "CheckRun", name: "ci/lint", status: "COMPLETED", conclusion: "SUCCESS", url: "u1", detailsUrl: "d1" },
      { __typename: "CheckRun", name: "pj-rehearse-1", status: "COMPLETED", conclusion: "SUCCESS", url: "u2", detailsUrl: "d2" },
      { __typename: "StatusContext", name: "netlify", state: "FAILURE", targetUrl: "u3" },
      { __typename: "CheckRun", name: "ci/test", status: "IN_PROGRESS", conclusion: null, url: "u4", detailsUrl: "d4" },
    ] },
  },
  reviews: { nodes: [
    { author: { login: "reviewer1" }, state: "APPROVED", body: "lgtm" },
    { author: { login: "reviewer2" }, state: "CHANGES_REQUESTED", body: "fix this" },
    { author: { login: "reviewer1" }, state: "COMMENTED", body: "just a note" },
  ] },
  comments: { nodes: [
    { author: { login: "qodo-merge[bot]" }, body: "Generating review...", createdAt: "2024-01-01T01:00:00Z" },
    { author: { login: "author1" }, body: "thanks", createdAt: "2024-01-02T01:00:00Z" },
  ] },
  reviewThreads: { nodes: [
    thread(false, false, "reviewer1"),
    thread(true, false, "reviewer2"),
    thread(false, true, "reviewer3"),
    thread(false, false, "coderabbitai[bot]"),
    thread(false, false, null),
  ] },
  timelineItems: { nodes: [
    { __typename: "LabeledEvent", actor: { login: "reviewer1" }, label: { name: "lgtm" } },
    { __typename: "UnlabeledEvent", actor: { login: "reviewer1" }, label: { name: "lgtm" } },
    { __typename: "LabeledEvent", actor: { login: "reviewer2" }, label: { name: "bug" } },
  ] },
  reviewRequests: { nodes: [{ requestedReviewer: { login: "reviewer4" } }, { requestedReviewer: { login: "reviewer5" } }] },
};
