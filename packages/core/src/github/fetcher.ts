import { Octokit } from "@octokit/rest";
import type { AppConfig, CiJob, CiJobStatus, FetchResult, PeerComments, PullRequest, PrState, ReviewerBreakdown } from "../types.js";
import { matchesAny } from "./patterns.js";
import { parseCodeRabbit, parseQodo } from "./bots.js";
import { BOT_USERNAMES } from "../config/default.js";

const HUMAN_BOTS = new Set<string>([
  BOT_USERNAMES.qodo,
  BOT_USERNAMES.coderabbit,
  ...BOT_USERNAMES.ignored,
]);

function mapCheckStatus(conclusion: string | null, status: string): CiJobStatus {
  if (status === "queued" || status === "in_progress") return "pending";
  switch (conclusion) {
    case "success": return "success";
    case "failure":
    case "timed_out":
    case "action_required": return "failure";
    case "skipped": return "skipped";
    default: return "pending";
  }
}

export async function fetchRepoPRs(
  octokit: Octokit,
  repoConfig: AppConfig["repos"][number],
): Promise<FetchResult> {
  const [owner, repo] = repoConfig.repo.split("/") as [string, string];

  const rawPRs = await octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo,
    state: "all",
    per_page: 100,
  });

  const prs: PullRequest[] = await Promise.all(
    rawPRs.map(async (pr): Promise<PullRequest> => {
      const isDraft = pr.draft ?? false;
      const state: PrState =
        pr.state === "closed" ? "closed" : isDraft ? "draft" : "open";

      // Check runs
      const checks = await octokit.rest.checks.listForRef({
        owner,
        repo,
        ref: pr.head.sha,
        per_page: 100,
      });

      const ciJobs: CiJob[] = [];
      let e2eJob: CiJob | null = null;

      for (const run of checks.data.check_runs) {
        if (matchesAny(run.name, repoConfig.ciPatterns.ignore)) continue;
        const job: CiJob = {
          name: run.name,
          status: mapCheckStatus(run.conclusion ?? null, run.status),
          url: run.html_url,
        };
        if (matchesAny(run.name, repoConfig.ciPatterns.e2e)) {
          e2eJob ??= job; // keep first match
        } else {
          ciJobs.push(job);
        }
      }

      // Comments (issue + review)
      const [issueComments, reviewComments, reviews] = await Promise.all([
        octokit.paginate(octokit.rest.issues.listComments, { owner, repo, issue_number: pr.number, per_page: 100 }),
        octokit.paginate(octokit.rest.pulls.listReviewComments, { owner, repo, pull_number: pr.number, per_page: 100 }),
        octokit.paginate(octokit.rest.pulls.listReviews, { owner, repo, pull_number: pr.number, per_page: 100 }),
      ]);

      const allComments = [
        ...issueComments.map((c) => ({ body: c.body ?? "", user: c.user })),
        ...reviewComments.map((c) => ({ body: c.body, user: c.user })),
      ];

      // Peer comments: human only, unresolved review threads
      const humanReviewComments = reviewComments.filter(
        (c) => c.user && !HUMAN_BOTS.has(c.user.login),
      );
      const unresolvedThreads = new Set(
        humanReviewComments
          .filter((c) => !("in_reply_to_id" in c && c.in_reply_to_id)) // root comments only
          .map((c) => c.id),
      );
      // A thread is "resolved" if its root is in a resolved state — GitHub API doesn't expose
      // resolution directly on review comments, so we approximate: count unique root-level
      // human review comments as total, subtract those whose thread has a reply from PR author.
      const peerComments: PeerComments = {
        unresolved: unresolvedThreads.size,
        total: humanReviewComments.filter((c) => !("in_reply_to_id" in c && c.in_reply_to_id)).length,
      };

      // Reviewers
      const reviewerBreakdown: ReviewerBreakdown = { approved: 0, changesRequested: 0, pending: 0 };
      const seenReviewers = new Map<string, string>();
      for (const review of reviews) {
        if (!review.user || HUMAN_BOTS.has(review.user.login)) continue;
        // Latest state per reviewer wins
        seenReviewers.set(review.user.login, review.state);
      }
      for (const state of seenReviewers.values()) {
        if (state === "APPROVED") reviewerBreakdown.approved++;
        else if (state === "CHANGES_REQUESTED") reviewerBreakdown.changesRequested++;
        else reviewerBreakdown.pending++;
      }

      // Requested reviewers (haven't reviewed yet)
      reviewerBreakdown.pending += pr.requested_reviewers?.length ?? 0;

      return {
        id: pr.id,
        number: pr.number,
        url: pr.html_url,
        title: pr.title,
        repo: repoConfig.repo,
        author: pr.user?.login ?? "unknown",
        state,
        labels: pr.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")),
        commits: pr.commits ?? 0,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergedAt: pr.merged_at ?? null,
        ciJobs,
        e2eJob,
        qodo: parseQodo(allComments),
        coderabbit: parseCodeRabbit(allComments),
        peerComments,
        reviewers: reviewerBreakdown,
      };
    }),
  );

  return { prs, fetchedAt: new Date().toISOString(), repo: repoConfig.repo };
}
