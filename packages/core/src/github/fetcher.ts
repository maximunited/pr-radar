import { graphql } from "@octokit/graphql";
import type { AppConfig, BotReviewState, CiJob, CiJobStatus, FetchResult, PeerComments, PullRequest, PrState, ReviewerBreakdown, ReviewerDetail } from "../types.js";
import { matchesAny } from "./patterns.js";
import { parseCodeRabbit, parseQodo, isIgnoredBot } from "./bots.js";
import { BOT_PATTERNS } from "../config/default.js";

const PR_QUERY = `
  query RepoPRs($searchQuery: String!, $cursor: String) {
    search(query: $searchQuery, type: ISSUE, first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ... on PullRequest {
          number
          title
          url
          state
          isDraft
          createdAt
          updatedAt
          mergedAt
          commits { totalCount }
          author { login }
          labels(first: 20) { nodes { name } }
          statusCheckRollup {
            contexts(first: 100) {
              nodes {
                ... on CheckRun {
                  __typename
                  name
                  status
                  conclusion
                  url
                  detailsUrl
                }
                ... on StatusContext {
                  __typename
                  context
                  state
                  targetUrl
                }
              }
            }
          }
          reviews(first: 50) {
            nodes {
              author { login }
              state
              body
            }
          }
          comments(first: 50) {
            nodes {
              author { login }
              body
              createdAt
            }
          }
          reviewThreads(first: 50) {
            nodes {
              isResolved
              isOutdated
              comments(first: 20) {
                nodes { author { login } }
              }
            }
          }
          timelineItems(first: 100, itemTypes: [LABELED_EVENT, UNLABELED_EVENT]) {
            nodes {
              ... on LabeledEvent   { __typename actor { login } label { name } }
              ... on UnlabeledEvent { __typename actor { login } label { name } }
            }
          }
          reviewRequests(first: 10) {
            nodes {
              requestedReviewer {
                ... on User { login }
                ... on Team { name }
              }
            }
          }
        }
      }
    }
  }
`;

interface GhCheckRun {
  __typename: "CheckRun";
  name: string;
  status: string;
  conclusion: string | null;
  url: string | null;
  detailsUrl: string | null;
}

interface GhStatusContext {
  __typename: "StatusContext";
  context: string;
  state: string; // SUCCESS | FAILURE | PENDING | ERROR
  targetUrl: string | null;
}

type GhContext = GhCheckRun | GhStatusContext;

// Comments whose entire body is a CI/slash command (e.g. /test, /lgtm, /approve, /hold)
const COMMAND_RE = /^\s*\/[a-z][\w-]/i;

interface GhLabelEvent { __typename: "LabeledEvent" | "UnlabeledEvent"; actor: { login: string } | null; label: { name: string }; }
interface GhReview { author: { login: string } | null; state: string; body: string; }
interface GhComment { author: { login: string } | null; body: string; createdAt: string; }
interface GhThread { isResolved: boolean; isOutdated: boolean; comments: { nodes: Array<{ author: { login: string } | null }> }; }
interface GhPR {
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
  statusCheckRollup: { contexts: { nodes: GhContext[] } } | null;
  reviews: { nodes: GhReview[] };
  comments: { nodes: GhComment[] };
  reviewThreads: { nodes: GhThread[] };
  timelineItems: { nodes: Array<GhLabelEvent | Record<string, never>> };
  reviewRequests: { nodes: Array<{ requestedReviewer: { login?: string; name?: string } | null }> };
}

function mapCheckRunStatus(status: string, conclusion: string | null): CiJobStatus {
  if (status === "IN_PROGRESS" || status === "QUEUED" || status === "WAITING") return "pending";
  switch (conclusion) {
    case "SUCCESS": return "success";
    case "FAILURE":
    case "TIMED_OUT":
    case "ACTION_REQUIRED": return "failure";
    case "SKIPPED": return "skipped";
    default: return "pending";
  }
}

function mapStatusContextState(state: string): CiJobStatus {
  switch (state) {
    case "SUCCESS": return "success";
    case "FAILURE":
    case "ERROR": return "failure";
    default: return "pending";
  }
}

function contextToJob(node: GhContext): { name: string; status: CiJobStatus; url: string | null } {
  if (node.__typename === "CheckRun") {
    return { name: node.name, status: mapCheckRunStatus(node.status, node.conclusion), url: node.detailsUrl ?? node.url };
  }
  return { name: node.context, status: mapStatusContextState(node.state), url: node.targetUrl };
}

function parsePR(pr: GhPR, repoName: string, repoConfig: AppConfig["repos"][number]): PullRequest {
  const state: PrState = pr.isDraft ? "draft" : pr.state === "OPEN" ? "open" : "closed";

  // CI jobs from status check rollup (handles both CheckRun and StatusContext)
  const ciJobs: CiJob[] = [];
  let e2eJob: CiJob | null = null;
  for (const node of pr.statusCheckRollup?.contexts.nodes ?? []) {
    const { name, status, url } = contextToJob(node);
    if (matchesAny(name, repoConfig.ciPatterns.ignore)) continue;
    const job: CiJob = { name, status, url };
    if (matchesAny(name, repoConfig.ciPatterns.e2e)) {
      e2eJob ??= job;
    } else {
      ciJobs.push(job);
    }
  }

  // Bot detection: issue comments + review bodies (CodeRabbit posts via reviews)
  const allComments = [
    ...pr.comments.nodes.map((c) => ({ body: c.body, user: c.author })),
    ...pr.reviews.nodes.map((r) => ({ body: r.body, user: r.author })),
    ...pr.reviewThreads.nodes.flatMap((t) =>
      t.comments.nodes.map((c) => ({ body: "", user: c.author }))
    ),
  ];

  // Peer comments: unresolved/total human review threads (exclude all known bots)
  const humanThreads = pr.reviewThreads.nodes.filter((t) => {
    if (t.isOutdated) return false;
    const login = t.comments.nodes[0]?.author?.login;
    return login && !isIgnoredBot(login);
  });
  const unresolvedHuman = humanThreads.filter((t) => !t.isResolved);
  const prAuthorLogin = pr.author?.login ?? "";
  const allReplied = unresolvedHuman.length > 0 && unresolvedHuman.every(
    (t) => t.comments.nodes.some((c) => c.author?.login === prAuthorLogin),
  );
  // Unreplied regular (non-inline) comments: meaningful human comments since the author last replied
  const humanIssueComments = pr.comments.nodes
    .filter((c) => c.author?.login && !isIgnoredBot(c.author.login))
    .map((c) => ({ login: c.author!.login, body: c.body, ts: new Date(c.createdAt).getTime() }));
  const authorComments = humanIssueComments.filter((c) => c.login === prAuthorLogin);
  const lastAuthorTs = authorComments.length > 0 ? Math.max(...authorComments.map((c) => c.ts)) : 0;
  const unrepliedComments = humanIssueComments.filter(
    (c) => c.login !== prAuthorLogin && !COMMAND_RE.test(c.body) && c.ts > lastAuthorTs,
  ).length;

  const peerComments: PeerComments = {
    unresolved: unresolvedHuman.length,
    total: humanThreads.length,
    unrepliedComments,
    allReplied,
  };

  // Reviewers — COMMENTED doesn't clear a prior APPROVED/CHANGES_REQUESTED
  const seenReviewers = new Map<string, string>();
  for (const review of pr.reviews.nodes) {
    if (!review.author || isIgnoredBot(review.author.login)) continue;
    const prev = seenReviewers.get(review.author.login);
    const isDecisive = review.state === "APPROVED" || review.state === "CHANGES_REQUESTED";
    if (isDecisive || !prev) {
      seenReviewers.set(review.author.login, review.state);
    }
  }
  // Add requested-but-not-yet-reviewed
  for (const req of pr.reviewRequests.nodes) {
    const login = req.requestedReviewer?.login ?? req.requestedReviewer?.name;
    if (login && !seenReviewers.has(login)) {
      seenReviewers.set(login, "PENDING");
    }
  }
  const reviewerBreakdown: ReviewerBreakdown = { approved: 0, changesRequested: 0, pending: 0, details: [] };
  for (const [login, state] of seenReviewers.entries()) {
    if (state === "APPROVED") reviewerBreakdown.approved++;
    else if (state === "CHANGES_REQUESTED") reviewerBreakdown.changesRequested++;
    else reviewerBreakdown.pending++;
    reviewerBreakdown.details.push({
      login,
      state: state as ReviewerDetail["state"],
    });
  }

  // Replay label events to find labels that were applied then removed (e.g. lgtm stripped on rebase)
  const currentLabels = new Set(pr.labels.nodes.map((l) => l.name));
  const labelHistory = new Map<string, { state: "added" | "removed"; actor: string | null }>();
  for (const item of pr.timelineItems.nodes) {
    if (!("__typename" in item)) continue;
    const ev = item as GhLabelEvent;
    labelHistory.set(ev.label.name, {
      state: ev.__typename === "LabeledEvent" ? "added" : "removed",
      actor: ev.actor?.login ?? null,
    });
  }
  const removedLabels = Array.from(labelHistory.entries())
    .filter(([name, { state }]) => state === "removed" && !currentLabels.has(name))
    .map(([name]) => name);
  const labelAddedBy: Record<string, string> = {};
  for (const [name, { state, actor }] of labelHistory) {
    if (state === "added" && actor && currentLabels.has(name)) labelAddedBy[name] = actor;
  }

  return {
    id: pr.number,
    number: pr.number,
    url: pr.url,
    title: pr.title,
    repo: repoName,
    author: pr.author?.login ?? "unknown",
    state,
    labels: pr.labels.nodes.map((l) => l.name),
    removedLabels,
    labelAddedBy,
    commits: pr.commits.totalCount,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    mergedAt: pr.mergedAt,
    ciJobs,
    e2eJob,
    qodo: parseQodo(allComments),
    coderabbit: (() => {
      const base = parseCodeRabbit(allComments);
      if (base.state === "missing" || base.state === "thinking" || base.state === "rate_limited") return base;
      const crUnresolved = pr.reviewThreads.nodes.filter((t) => {
        if (t.isOutdated || t.isResolved) return false;
        const login = t.comments.nodes[0]?.author?.login;
        return login && BOT_PATTERNS.coderabbit.test(login);
      }).length;
      return (crUnresolved > 0 ? { state: "open", count: crUnresolved } : { state: "clean" }) satisfies BotReviewState;
    })(),
    peerComments,
    reviewers: reviewerBreakdown,
  };
}

type QueryResult = { search: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: Array<GhPR | Record<string, never>> } };

export async function fetchRepoPRs(
  token: string,
  repoConfig: AppConfig["repos"][number],
  author: string,
): Promise<FetchResult> {
  const client = graphql.defaults({ headers: { authorization: `token ${token}` } });
  const searchQuery = `is:pr repo:${repoConfig.repo} author:${author}`;

  const prs: PullRequest[] = [];
  let cursor: string | null = null;
  let pages = 0;
  const MAX_PAGES = 4; // cap at 200 PRs per author

  do {
    const data: QueryResult = await client<QueryResult>(PR_QUERY, { searchQuery, cursor });
    const page = data.search;
    for (const node of page.nodes) {
      // search returns mixed types; skip non-PR nodes
      if (!("number" in node)) continue;
      prs.push(parsePR(node as GhPR, repoConfig.repo, repoConfig));
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    pages++;
  } while (cursor && pages < MAX_PAGES);

  return { prs, fetchedAt: new Date().toISOString(), repo: repoConfig.repo, author };
}

export async function fetchRepoPRsForAuthors(
  token: string,
  repoConfig: AppConfig["repos"][number],
  authors: string[],
): Promise<FetchResult> {
  const results = await Promise.all(authors.map((a) => fetchRepoPRs(token, repoConfig, a)));
  const merged = results.flatMap((r) => r.prs);
  return { prs: merged, fetchedAt: new Date().toISOString(), repo: repoConfig.repo };
}
