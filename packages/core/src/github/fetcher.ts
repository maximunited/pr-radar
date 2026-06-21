import { graphql } from "@octokit/graphql";
import type { AppConfig, CiJob, CiJobStatus, FetchResult, PeerComments, PullRequest, PrState, ReviewerBreakdown } from "../types.js";
import { matchesAny } from "./patterns.js";
import { parseCodeRabbit, parseQodo } from "./bots.js";
import { BOT_USERNAMES } from "../config/default.js";

const HUMAN_BOTS = new Set<string>([
  BOT_USERNAMES.qodo,
  BOT_USERNAMES.coderabbit,
  ...BOT_USERNAMES.ignored,
]);

const PR_QUERY = `
  query RepoPRs($owner: String!, $repo: String!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequests(first: 50, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
        pageInfo { hasNextPage endCursor }
        nodes {
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
              }
            }
          }
          reviews(first: 50) {
            nodes {
              author { login }
              state
            }
          }
          comments(first: 50) {
            nodes {
              author { login }
              body
            }
          }
          reviewThreads(first: 50) {
            nodes {
              isResolved
              comments(first: 1) {
                nodes { author { login } }
              }
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

interface GhReview { author: { login: string } | null; state: string; }
interface GhComment { author: { login: string } | null; body: string; }
interface GhThread { isResolved: boolean; comments: { nodes: Array<{ author: { login: string } | null }> }; }
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
  statusCheckRollup: { contexts: { nodes: GhCheckRun[] } } | null;
  reviews: { nodes: GhReview[] };
  comments: { nodes: GhComment[] };
  reviewThreads: { nodes: GhThread[] };
  reviewRequests: { nodes: Array<{ requestedReviewer: { login?: string; name?: string } | null }> };
}

function mapGhStatus(status: string, conclusion: string | null): CiJobStatus {
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

function parsePR(pr: GhPR, repoName: string, repoConfig: AppConfig["repos"][number]): PullRequest {
  const state: PrState = pr.isDraft ? "draft" : pr.state === "OPEN" ? "open" : "closed";

  // CI jobs from status check rollup
  const ciJobs: CiJob[] = [];
  let e2eJob: CiJob | null = null;
  for (const node of pr.statusCheckRollup?.contexts.nodes ?? []) {
    if (node.__typename !== "CheckRun") continue;
    if (matchesAny(node.name, repoConfig.ciPatterns.ignore)) continue;
    const job: CiJob = {
      name: node.name,
      status: mapGhStatus(node.status, node.conclusion),
      url: node.detailsUrl ?? node.url,
    };
    if (matchesAny(node.name, repoConfig.ciPatterns.e2e)) {
      e2eJob ??= job;
    } else {
      ciJobs.push(job);
    }
  }

  // Bot state
  const allComments = [
    ...pr.comments.nodes.map((c) => ({ body: c.body, user: c.author })),
    ...pr.reviewThreads.nodes.flatMap((t) =>
      t.comments.nodes.map((c) => ({ body: "", user: c.author }))
    ),
  ];

  // Peer comments: unresolved/total human review threads
  const humanThreads = pr.reviewThreads.nodes.filter(
    (t) => t.comments.nodes[0]?.author && !HUMAN_BOTS.has(t.comments.nodes[0].author!.login),
  );
  const peerComments: PeerComments = {
    unresolved: humanThreads.filter((t) => !t.isResolved).length,
    total: humanThreads.length,
  };

  // Reviewers
  const seenReviewers = new Map<string, string>();
  for (const review of pr.reviews.nodes) {
    if (!review.author || HUMAN_BOTS.has(review.author.login)) continue;
    seenReviewers.set(review.author.login, review.state);
  }
  const reviewerBreakdown: ReviewerBreakdown = { approved: 0, changesRequested: 0, pending: 0 };
  for (const s of seenReviewers.values()) {
    if (s === "APPROVED") reviewerBreakdown.approved++;
    else if (s === "CHANGES_REQUESTED") reviewerBreakdown.changesRequested++;
    else reviewerBreakdown.pending++;
  }
  reviewerBreakdown.pending += pr.reviewRequests.nodes.length;

  return {
    id: pr.number,
    number: pr.number,
    url: pr.url,
    title: pr.title,
    repo: repoName,
    author: pr.author?.login ?? "unknown",
    state,
    labels: pr.labels.nodes.map((l) => l.name),
    commits: pr.commits.totalCount,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    mergedAt: pr.mergedAt,
    ciJobs,
    e2eJob,
    qodo: parseQodo(allComments),
    coderabbit: parseCodeRabbit(allComments),
    peerComments,
    reviewers: reviewerBreakdown,
  };
}

export async function fetchRepoPRs(
  token: string,
  repoConfig: AppConfig["repos"][number],
): Promise<FetchResult> {
  const [owner, repo] = repoConfig.repo.split("/") as [string, string];
  const client = graphql.defaults({ headers: { authorization: `token ${token}` } });

  const prs: PullRequest[] = [];
  let cursor: string | null = null;
  let pages = 0;
  const MAX_PAGES = 4; // cap at 200 PRs total

  type QueryResult = { repository: { pullRequests: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: GhPR[] } } };
  do {
    const data: QueryResult = await client<QueryResult>(PR_QUERY, { owner, repo, cursor });
    const page = data.repository.pullRequests;
    for (const pr of page.nodes) {
      prs.push(parsePR(pr, repoConfig.repo, repoConfig));
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    pages++;
  } while (cursor && pages < MAX_PAGES);

  return { prs, fetchedAt: new Date().toISOString(), repo: repoConfig.repo };
}
