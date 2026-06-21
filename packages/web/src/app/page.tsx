"use client";

import { useCallback, useEffect, useState } from "react";
import { PrTable } from "@/components/PrTable";
import type { FetchResult } from "@/lib/types";

const DEFAULT_AUTHORS = ["maximunited", "ugreener", "gamado"];
const POLL_MS = 5 * 60 * 1000;

export default function Home() {
  const [results, setResults] = useState<FetchResult[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [fetchedAuthors, setFetchedAuthors] = useState<Set<string>>(new Set(DEFAULT_AUTHORS));
  const [loadingAuthors, setLoadingAuthors] = useState<Set<string>>(new Set());

  const load = useCallback(async (force = false) => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/prs?authors=${DEFAULT_AUTHORS.join(",")}${force ? "&refresh=1" : ""}`,
      );
      if (res.status === 401) { setNeedsAuth(true); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNeedsAuth(false);
      setResults(await res.json() as FetchResult[]);
      setFetchedAuthors(new Set(DEFAULT_AUTHORS));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const loadForAuthors = useCallback(async (newAuthors: string[]) => {
    const toFetch = newAuthors.filter((a) => !fetchedAuthors.has(a));
    if (toFetch.length === 0) return;

    setLoadingAuthors((prev) => new Set([...prev, ...toFetch]));
    try {
      const res = await fetch(`/api/prs?authors=${toFetch.join(",")}`);
      if (!res.ok) return;
      const incoming = await res.json() as FetchResult[];
      setResults((prev) => {
        const map = new Map(prev.map((r) => [r.repo, { ...r, prs: [...r.prs] }]));
        for (const r of incoming) {
          const existing = map.get(r.repo);
          if (existing) {
            const knownIds = new Set(existing.prs.map((p) => p.number));
            existing.prs.push(...r.prs.filter((p) => !knownIds.has(p.number)));
          } else {
            map.set(r.repo, r);
          }
        }
        return Array.from(map.values());
      });
      setFetchedAuthors((prev) => new Set([...prev, ...toFetch]));
    } finally {
      setLoadingAuthors((prev) => {
        const next = new Set(prev);
        toFetch.forEach((a) => next.delete(a));
        return next;
      });
    }
  }, [fetchedAuthors]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (needsAuth) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-gray-400">
        <p className="text-sm">No GitHub token available.</p>
        <a
          href="/sign-in"
          className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700"
        >
          Sign in
        </a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-400">
        {error} — <button onClick={() => void load()} className="ml-2 underline">retry</button>
      </div>
    );
  }

  if (results.length === 0 && refreshing) {
    return <div className="flex h-full items-center justify-center text-gray-500 text-sm">Loading PRs…</div>;
  }

  return (
    <PrTable
      results={results}
      onRefresh={() => void load(true)}
      refreshing={refreshing}
      fetchedAuthors={fetchedAuthors}
      loadingAuthors={loadingAuthors}
      onFetchAuthors={loadForAuthors}
    />
  );
}
