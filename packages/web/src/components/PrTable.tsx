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
import { useState, useMemo } from "react";
import { RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { PullRequest, PrState, FetchResult } from "@/lib/types";
import { BotBadge } from "./BotBadge";
import { CiDots, E2eDot } from "./CiDots";
import clsx from "clsx";

const col = createColumnHelper<PullRequest>();

const STATE_BADGE: Record<PrState, string> = {
  open: "bg-green-700 text-green-200",
  draft: "bg-gray-700 text-gray-300",
  closed: "bg-purple-900 text-purple-300",
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
  col.accessor("repo", { header: "Repo", size: 140 }),
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
      const { unresolved, total } = i.getValue();
      return (
        <span className={unresolved > 0 ? "text-yellow-400" : "text-gray-500"}>
          {unresolved}/{total}
        </span>
      );
    },
    sortingFn: (a, b) => a.original.peerComments.unresolved - b.original.peerComments.unresolved,
    size: 80,
  }),
  col.accessor("reviewers", {
    header: "Reviews",
    cell: (i) => {
      const { approved, changesRequested } = i.getValue();
      return (
        <span className="flex gap-1 text-xs">
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
    cell: (i) => (
      <span className="flex flex-wrap gap-0.5">
        {i.getValue().map((l) => (
          <span key={l} className="rounded bg-gray-800 px-1 text-xs text-gray-400">{l}</span>
        ))}
      </span>
    ),
    enableSorting: false,
    size: 150,
  }),
];

type SmartFilter = "all" | "needs_attention" | "ready_to_merge";

function applySmartFilter(prs: PullRequest[], filter: SmartFilter): PullRequest[] {
  if (filter === "needs_attention") {
    return prs.filter(
      (pr) =>
        pr.ciJobs.some((j) => j.status === "failure") ||
        pr.e2eJob?.status === "failure" ||
        (pr.qodo.state === "open") ||
        (pr.coderabbit.state === "open") ||
        pr.peerComments.unresolved > 0,
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
        pr.reviewers.approved >= 1 &&
        pr.reviewers.changesRequested === 0,
    );
  }
  return prs;
}

export function PrTable({ results, onRefresh, refreshing }: {
  results: FetchResult[];
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "updatedAt", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [smartFilter, setSmartFilter] = useState<SmartFilter>("all");
  const [stateFilter, setStateFilter] = useState<PrState | "all">("open");
  const [repoFilter, setRepoFilter] = useState<string>("all");

  const allPrs = useMemo(() => results.flatMap((r) => r.prs), [results]);
  const repos = useMemo(() => Array.from(new Set(allPrs.map((p) => p.repo))), [allPrs]);
  const lastFetched = results[0]?.fetchedAt;

  const filtered = useMemo(() => {
    let prs = allPrs;
    if (stateFilter !== "all") prs = prs.filter((p) => p.state === stateFilter);
    if (repoFilter !== "all") prs = prs.filter((p) => p.repo === repoFilter);
    return applySmartFilter(prs, smartFilter);
  }, [allPrs, stateFilter, repoFilter, smartFilter]);

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

        {/* Repo filter */}
        <select
          value={repoFilter}
          onChange={(e) => setRepoFilter(e.target.value)}
          className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300"
        >
          <option value="all">All repos</option>
          {repos.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

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
                    <span className="flex items-center gap-1">
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
