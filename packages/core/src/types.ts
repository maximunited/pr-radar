export type CiJobStatus = "success" | "failure" | "pending" | "skipped" | "missing";

export type BotReviewState =
  | { state: "missing" }
  | { state: "thinking" }
  | { state: "rate_limited" }
  | { state: "open"; count: number }
  | { state: "clean" };

export interface CiJob {
  name: string;
  status: CiJobStatus;
  url: string | null;
}

export interface ReviewerDetail {
  login: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING";
}

export interface ReviewerBreakdown {
  approved: number;
  changesRequested: number;
  pending: number;
  details: ReviewerDetail[];
}

export interface PeerComments {
  unresolved: number;
  total: number;
}

export type PrState = "open" | "closed" | "draft";

export interface PullRequest {
  id: number;
  number: number;
  url: string;
  title: string;
  repo: string; // "org/repo"
  author: string;
  state: PrState;
  labels: string[];
  commits: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  ciJobs: CiJob[];         // default CI checks
  e2eJob: CiJob | null;    // pj-rehearse periodic job
  qodo: BotReviewState;
  coderabbit: BotReviewState;
  peerComments: PeerComments;
  reviewers: ReviewerBreakdown;
}

export interface RepoConfig {
  repo: string; // "org/repo"
  ciPatterns: {
    e2e: string[];      // patterns matching e2e/periodic jobs (e.g. ["pj-rehearse*"])
    ignore: string[];   // patterns to exclude entirely
  };
}

export interface AppConfig {
  repos: RepoConfig[];
  cacheTtl: number; // seconds
}

export interface FetchResult {
  prs: PullRequest[];
  fetchedAt: string; // ISO
  repo: string;
  author?: string; // set when result is scoped to a single author; undefined when merged
}
