"use client";
import type { CiJob } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  success: "bg-green-500",
  failure: "bg-red-500",
  pending: "bg-yellow-400",
  skipped: "bg-gray-500",
  missing: "bg-gray-700",
};

export function CiDots({ jobs }: { jobs: CiJob[] }) {
  if (jobs.length === 0) return <span className="text-gray-600 text-xs">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {jobs.map((job) => (
        <a
          key={job.name}
          href={job.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          title={job.name}
          className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_COLORS[job.status] ?? "bg-gray-600"}`}
        />
      ))}
    </span>
  );
}

export function E2eDot({ job }: { job: CiJob | null }) {
  if (!job) return <span className="text-gray-600 text-xs">—</span>;
  return (
    <a
      href={job.url ?? undefined}
      target="_blank"
      rel="noreferrer"
      title={job.name}
      className={`inline-block h-3 w-3 rounded-full ${STATUS_COLORS[job.status] ?? "bg-gray-600"}`}
    />
  );
}
