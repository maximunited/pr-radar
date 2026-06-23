"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { PullRequest, PrState, FetchResult } from "@/lib/types";
import { BotBadge } from "./BotBadge";
import { CiDots, E2eDot } from "./CiDots";
import clsx from "clsx";

const col = createColumnHelper<PullRequest>();

const ALL_DEFAULT_REPOS = [
  "medik8s/system-tests",
  "openshift/release",
  "medik8s/storage-based-remediation",
];
// sbr deselected by default — user must opt in
const DEFAULT_REPO_FILTER = ALL_DEFAULT_REPOS.filter(
  (r) => r !== "medik8s/storage-based-remediation",
);

// Returns the border/text color for a removed label (outline only, grey text, strikethrough)
function removedLabelClasses(label: string): string {
  const l = label.toLowerCase();
  if (/^(lgtm|approved|cherry-pick-approved|ok-to-test)$/.test(l))
    return "border border-green-600 text-gray-500";
  if (/^(hold|do-not-merge|needs-rebase|wip)$/.test(l) || /^do-not-merge\//.test(l))
    return "border border-red-600 text-gray-500";
  if (/^size\//.test(l) || /^(needs-ok-to-test|needs-priority|needs-kind)$/.test(l))
    return "border border-blue-600 text-gray-500";
  return "border border-purple-600 text-gray-500";
}

function labelClasses(label: string): string {
  const l = label.toLowerCase();
  // Green: approval / positive signals
  if (/^(lgtm|approved|cherry-pick-approved|ok-to-test)$/.test(l))
    return "bg-green-900/70 text-green-300";
  // Red: hard blockers
  if (/^(hold|do-not-merge|needs-rebase|wip)$/.test(l) || /^do-not-merge\//.test(l))
    return "bg-red-900/70 text-red-300";
  // Blue: size tiers and CI-gate labels
  if (/^size\//.test(l) || /^(needs-ok-to-test|needs-priority|needs-kind)$/.test(l))
    return "bg-blue-900/70 text-blue-300";
  // Default: purple for area, kind, priority, and anything else
  return "bg-purple-900/70 text-purple-300";
}

function abbreviateRepo(full: string): string {
  const [org, name] = full.split("/");
  const orgAbbr = (org ?? "").charAt(0);
  const repoName = name ?? "";
  // For long hyphen-separated names, collapse to initials (e.g. storage-based-remediation → sbr)
  const nameDisplay =
    repoName.length > 12
      ? repoName.split("-").map((w) => w.charAt(0)).join("")
      : repoName;
  return `${orgAbbr}/${nameDisplay}`;
}

const STATE_BADGE: Record<PrState, string> = {
  open: "bg-green-700 text-green-200",
  draft: "bg-gray-700 text-gray-300",
  closed: "bg-purple-900 text-purple-300",
};

const COLUMN_TIPS: Record<string, string> = {
  state:        "PR state: open, draft, or closed/merged",
  author:       "GitHub user who opened the PR",
  repo:         "Repository (org/repo)",
  number:       "PR number — click to open on GitHub",
  title:        "PR title — click to open on GitHub",
  ciJobs:       "Default CI checks (lint, unit, build, etc). Each dot = one job. Green=pass, red=fail, yellow=pending",
  e2eJob:       "Periodic pj-rehearse / e2e job. Matched by name pattern (e.g. pj-rehearse*)",
  qodo:         "Qodo AI review status. Green=clean or rate-limited, red=open action items, spinner=still generating",
  coderabbit:   "CodeRabbit review status. Same states as Qodo",
  peerComments: "Human comments: N💬 = unreplied regular comments (no /commands), N/N = unresolved/total inline review threads. Bots excluded.",
  reviewers:    "Review decisions: ✓=approvals, ✗=changes requested",
  commits:      "Number of commits in the PR",
  labels:       "GitHub labels on the PR",
};

const COLUMNS = [
  col.accessor("state", {
    header: "State",
    cell: (i) => (
      <span className={clsx("rounded px-1.5 py-0.5 text-xs font-medium", STATE_BADGE[i.getValue()])}>
        {i.getValue()}
      </span>
    ),
    size: 70,
  }),
  col.accessor("author", {
    header: "Author",
    cell: (i) => (
      <a
        href={`https://github.com/${i.getValue()}`}
        target="_blank"
        rel="noreferrer"
        className="text-gray-300 hover:text-white hover:underline text-xs"
      >
        {i.getValue()}
      </a>
    ),
    size: 110,
  }),
  col.accessor("repo", {
    header: "Repo",
    cell: (i) => {
      const full = i.getValue();
      return (
        <a
          href={`https://github.com/${full}`}
          target="_blank"
          rel="noreferrer"
          title={full}
          className="text-xs text-gray-400 hover:text-gray-200 hover:underline"
        >
          {abbreviateRepo(full)}
        </a>
      );
    },
    size: 90,
  }),
  col.accessor("number", {
    header: "PR",
    cell: (i) => (
      <a href={i.row.original.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
        #{i.getValue()}
      </a>
    ),
    size: 60,
  }),
  col.accessor("title", {
    header: "Title",
    cell: (i) => (
      <a href={i.row.original.url} target="_blank" rel="noreferrer" className="line-clamp-1 hover:underline">
        {i.getValue()}
      </a>
    ),
    size: 300,
  }),
  col.accessor("ciJobs", {
    header: "CI",
    cell: (i) => <CiDots jobs={i.getValue()} />,
    enableSorting: false,
    size: 100,
  }),
  col.accessor("e2eJob", {
    header: "E2E",
    cell: (i) => <E2eDot job={i.getValue()} />,
    enableSorting: false,
    size: 50,
  }),
  col.accessor("qodo", {
    header: "Qodo",
    cell: (i) => <BotBadge state={i.getValue()} />,
    enableSorting: false,
    size: 60,
  }),
  col.accessor("coderabbit", {
    header: "CR",
    cell: (i) => <BotBadge state={i.getValue()} />,
    enableSorting: false,
    size: 60,
  }),
  col.accessor("peerComments", {
    header: "Comments",
    cell: (i) => {
      const { unresolved, total, unrepliedComments } = i.getValue();
      const hasAny = unresolved > 0 || unrepliedComments > 0;
      const parts: string[] = [];
      if (unrepliedComments > 0) parts.push(`${unrepliedComments} unreplied`);
      if (total > 0) parts.push(`${unresolved}/${total} inline unresolved`);
      return (
        <span
          title={parts.length > 0 ? parts.join(", ") : "No open comments"}
          className={hasAny ? "text-yellow-400" : "text-gray-500"}
        >
          {unrepliedComments > 0 && <span>{unrepliedComments}💬</span>}
          {total > 0 && (
            <span className={unrepliedComments > 0 ? "ml-1" : ""}>
              {unresolved > 0 ? `${unresolved}/${total}` : "0"}
            </span>
          )}
          {!hasAny && total === 0 && <span>—</span>}
        </span>
      );
    },
    sortingFn: (a, b) => {
      const aScore = a.original.peerComments.unrepliedComments + a.original.peerComments.unresolved;
      const bScore = b.original.peerComments.unrepliedComments + b.original.peerComments.unresolved;
      return aScore - bScore;
    },
    size: 90,
  }),
  col.accessor("reviewers", {
    header: "Reviews",
    cell: (i) => {
      const { approved, changesRequested, details } = i.getValue();
      const tooltip = details.map((d) => {
        const icon = d.state === "APPROVED" ? "✓" : d.state === "CHANGES_REQUESTED" ? "✗" : d.state === "PENDING" ? "⏳" : "○";
        const label = d.state === "APPROVED" ? "approved" : d.state === "CHANGES_REQUESTED" ? "changes requested" : d.state === "PENDING" ? "pending" : "commented";
        return `${icon} ${d.login}: ${label}`;
      }).join("\n");
      return (
        <span title={tooltip || undefined} className="flex gap-1 text-xs cursor-default">
          {approved > 0 && <span className="text-green-400">✓{approved}</span>}
          {changesRequested > 0 && <span className="text-red-400">✗{changesRequested}</span>}
          {approved === 0 && changesRequested === 0 && <span className="text-gray-600">—</span>}
        </span>
      );
    },
    sortingFn: (a, b) => a.original.reviewers.approved - b.original.reviewers.approved,
    size: 80,
  }),
  col.accessor("commits", { header: "Commits", size: 70 }),
  col.accessor("labels", {
    header: "Labels",
    cell: (i) => {
      const active = i.getValue();
      const removed = i.row.original.removedLabels;
      return (
        <span className="flex flex-wrap gap-0.5">
          {active.map((l) => (
            <span key={l} className={clsx("rounded px-1 text-xs", labelClasses(l))}>{l}</span>
          ))}
          {removed.map((l) => (
            <span key={`rm-${l}`} title="Label was removed" className={clsx("rounded px-1 text-xs line-through", removedLabelClasses(l))}>{l}</span>
          ))}
        </span>
      );
    },
    enableSorting: false,
    size: 150,
  }),
];

const DEFAULT_AUTHORS = ["maximunited", "ugreener", "gamado"];

function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });
  const setAndStore = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof updater === "function" ? (updater as (prev: T) => T)(prev) : updater;
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* quota or SSR */ }
        return next;
      });
    },
    [key],
  );
  return [value, setAndStore];
}

type SmartFilter = "all" | "needs_attention" | "ready_to_merge";

function applySmartFilter(prs: PullRequest[], filter: SmartFilter): PullRequest[] {
  if (filter === "needs_attention") {
    return prs.filter(
      (pr) =>
        pr.ciJobs.some((j) => j.status === "failure") ||
        pr.e2eJob?.status === "failure" ||
        (pr.qodo.state === "open") ||
        (pr.coderabbit.state === "open") ||
        pr.peerComments.unresolved > 0 ||
        pr.peerComments.unrepliedComments > 0,
    );
  }
  if (filter === "ready_to_merge") {
    return prs.filter(
      (pr) =>
        pr.state === "open" &&
        pr.ciJobs.every((j) => j.status === "success" || j.status === "skipped") &&
        pr.qodo.state !== "open" &&
        pr.coderabbit.state !== "open" &&
        pr.peerComments.unresolved === 0 &&
        pr.peerComments.unrepliedComments === 0 &&
        pr.reviewers.approved >= 1 &&
        pr.reviewers.changesRequested === 0,
    );
  }
  return prs;
}

export function PrTable({ results, onRefresh, refreshing, fetchedAuthors, loadingAuthors, onFetchAuthors, loadedRepos, loadingRepos, onFetchRepos }: {
  results: FetchResult[];
  onRefresh: () => void;
  refreshing: boolean;
  fetchedAuthors: Set<string>;
  loadingAuthors: Set<string>;
  onFetchAuthors: (authors: string[]) => void;
  loadedRepos: Set<string>;
  loadingRepos: Set<string>;
  onFetchRepos: (repos: string[]) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "updatedAt", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [smartFilter, setSmartFilter] = useState<SmartFilter>("all");
  const [stateFilter, setStateFilter] = useState<PrState | "all">("open");
  const [repoFilter, setRepoFilter] = useLocalStorage<string[]>("pr-radar:repoFilter", DEFAULT_REPO_FILTER);
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const repoDropdownRef = useRef<HTMLDivElement>(null);
  const [authorFilter, setAuthorFilter] = useLocalStorage<string[]>("pr-radar:authorFilter", DEFAULT_AUTHORS);
  const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);
  const [authorInput, setAuthorInput] = useState("");
  const authorDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (authorDropdownRef.current && !authorDropdownRef.current.contains(e.target as Node)) {
        setAuthorDropdownOpen(false);
      }
      if (repoDropdownRef.current && !repoDropdownRef.current.contains(e.target as Node)) {
        setRepoDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Auto-fetch when filter selects an author whose PRs haven't been loaded yet
  useEffect(() => {
    const missing = authorFilter.filter(
      (a) => !fetchedAuthors.has(a) && !loadingAuthors.has(a),
    );
    if (missing.length > 0) onFetchAuthors(missing);
  }, [authorFilter, fetchedAuthors, loadingAuthors, onFetchAuthors]);

  // Auto-fetch when filter selects a custom repo not yet loaded
  useEffect(() => {
    const missing = repoFilter.filter(
      (r) => !loadedRepos.has(r) && !loadingRepos.has(r),
    );
    if (missing.length > 0) onFetchRepos(missing);
  }, [repoFilter, loadedRepos, loadingRepos, onFetchRepos]);

  const addRepoFromInput = useCallback(() => {
    const repo = repoInput.trim();
    if (!repo || !repo.includes("/")) return;
    setRepoFilter((prev) => (prev.includes(repo) ? prev : [...prev, repo]));
    setRepoInput("");
  }, [repoInput]);

  const addAuthorFromInput = useCallback(() => {
    const name = authorInput.trim().toLowerCase();
    if (!name) return;
    setAuthorFilter((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setAuthorInput("");
  }, [authorInput]);

  const allPrs = useMemo(() => results.flatMap((r) => r.prs), [results]);
  const repos = useMemo(() => Array.from(new Set(allPrs.map((p) => p.repo))), [allPrs]);
  const allAuthors = useMemo(() => Array.from(new Set(allPrs.map((p) => p.author))).sort(), [allPrs]);
  const lastFetched = results[0]?.fetchedAt;

  const filtered = useMemo(() => {
    let prs = allPrs;
    if (stateFilter !== "all") prs = prs.filter((p) => p.state === stateFilter);
    if (repoFilter.length > 0) prs = prs.filter((p) => repoFilter.includes(p.repo));
    if (authorFilter.length > 0) prs = prs.filter((p) => authorFilter.includes(p.author));
    return applySmartFilter(prs, smartFilter);
  }, [allPrs, stateFilter, repoFilter, authorFilter, smartFilter]);

  const table = useReactTable({
    data: filtered,
    columns: COLUMNS,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg font-semibold tracking-tight">PR Radar</span>

        {/* Smart filters */}
        <div className="flex gap-1">
          {(["all", "needs_attention", "ready_to_merge"] as SmartFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setSmartFilter(f)}
              className={clsx(
                "rounded px-2 py-1 text-xs font-medium transition-colors",
                smartFilter === f ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700",
              )}
            >
              {f === "all" ? "All" : f === "needs_attention" ? "Needs attention" : "Ready to merge"}
            </button>
          ))}
        </div>

        {/* State filter */}
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as PrState | "all")}
          className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300"
        >
          <option value="all">All states</option>
          <option value="open">Open</option>
          <option value="draft">Draft</option>
          <option value="closed">Closed</option>
        </select>

        {/* Repo multi-select */}
        <div className="relative" ref={repoDropdownRef}>
          <button
            onClick={() => setRepoDropdownOpen((o) => !o)}
            className="flex items-center gap-1 rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
          >
            Repos
            <span className="rounded-full bg-blue-700 px-1 text-white">
              {repoFilter.length === 0 ? "all" : repoFilter.length}
            </span>
          </button>
          {repoDropdownOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[220px] rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl">
              <div className="flex items-center gap-1 border-b border-gray-800 px-2 pb-1">
                <input
                  type="text"
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addRepoFromInput(); }}
                  placeholder="Add org/repo…"
                  className="w-full bg-transparent py-1 text-xs text-gray-300 placeholder-gray-600 outline-none"
                />
                <button onClick={addRepoFromInput} className="text-gray-500 hover:text-gray-300 text-xs">+</button>
              </div>
              <button
                onClick={() => setRepoFilter([])}
                className="w-full px-3 py-1 text-left text-xs text-gray-500 hover:text-gray-300"
              >
                Show all
              </button>
              <button
                onClick={() => setRepoFilter([...DEFAULT_REPO_FILTER])}
                className="w-full px-3 py-1 text-left text-xs text-gray-500 hover:text-gray-300"
              >
                Reset to defaults
              </button>
              <div className="my-1 border-t border-gray-800" />
              {Array.from(new Set([...ALL_DEFAULT_REPOS, ...repos, ...repoFilter])).sort().map((r) => {
                const selected = repoFilter.includes(r);
                const loading = loadingRepos.has(r);
                return (
                  <label key={r} className="flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-gray-800">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        setRepoFilter((prev) =>
                          selected ? prev.filter((x) => x !== r) : [...prev, r],
                        )
                      }
                      className="accent-blue-500"
                    />
                    <span className={clsx("text-xs flex-1", selected ? "text-white" : "text-gray-500")} title={r}>
                      {abbreviateRepo(r)}
                    </span>
                    {loading && <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Author multi-select */}
        <div className="relative" ref={authorDropdownRef}>
          <button
            onClick={() => setAuthorDropdownOpen((o) => !o)}
            className="flex items-center gap-1 rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
          >
            Authors
            <span className="rounded-full bg-blue-700 px-1 text-white">
              {authorFilter.length === 0 ? "all" : authorFilter.length}
            </span>
          </button>
          {authorDropdownOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl">
              {/* Text input to add an arbitrary author */}
              <div className="flex items-center gap-1 border-b border-gray-800 px-2 pb-1">
                <input
                  type="text"
                  value={authorInput}
                  onChange={(e) => setAuthorInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addAuthorFromInput(); }}
                  placeholder="Add username…"
                  className="w-full bg-transparent py-1 text-xs text-gray-300 placeholder-gray-600 outline-none"
                />
                <button onClick={addAuthorFromInput} className="text-gray-500 hover:text-gray-300 text-xs">+</button>
              </div>
              <button
                onClick={() => setAuthorFilter([])}
                className="w-full px-3 py-1 text-left text-xs text-gray-500 hover:text-gray-300"
              >
                Show all
              </button>
              <button
                onClick={() => setAuthorFilter([...DEFAULT_AUTHORS])}
                className="w-full px-3 py-1 text-left text-xs text-gray-500 hover:text-gray-300"
              >
                Reset to defaults
              </button>
              <div className="my-1 border-t border-gray-800" />
              {/* All known + selected authors */}
              {Array.from(new Set([...DEFAULT_AUTHORS, ...allAuthors, ...authorFilter])).sort().map((a) => {
                const selected = authorFilter.includes(a);
                const loading = loadingAuthors.has(a);
                return (
                  <label key={a} className="flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-gray-800">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        setAuthorFilter((prev) =>
                          selected ? prev.filter((x) => x !== a) : [...prev, a],
                        )
                      }
                      className="accent-blue-500"
                    />
                    <span className={clsx("text-xs flex-1", selected ? "text-white" : "text-gray-500")}>{a}</span>
                    {loading && <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <span className="ml-auto text-xs text-gray-600">
          {filtered.length} PRs
          {lastFetched && ` · fetched ${new Date(lastFetched).toLocaleTimeString()}`}
        </span>

        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1 rounded bg-gray-800 px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.column.getSize() }}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 select-none"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span
                      className="flex items-center gap-1"
                      title={COLUMN_TIPS[header.column.id]}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        header.column.getIsSorted() === "asc" ? <ChevronUp size={10} /> :
                        header.column.getIsSorted() === "desc" ? <ChevronDown size={10} /> :
                        <ChevronsUpDown size={10} className="opacity-30" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr
                key={row.id}
                className={clsx(
                  "border-t border-gray-800",
                  i % 2 === 0 ? "bg-gray-950" : "bg-gray-900/40",
                  "hover:bg-gray-800/60",
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 align-middle" style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-16 text-center text-sm text-gray-600">No PRs match the current filters.</div>
        )}
      </div>
    </div>
  );
}
