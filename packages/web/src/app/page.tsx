"use client";

import { useCallback, useEffect, useState } from "react";
import { PrTable } from "@/components/PrTable";
import type { FetchResult } from "@/lib/types";

const POLL_MS = 5 * 60 * 1000; // background sync every 5 min

export default function Home() {
  const [results, setResults] = useState<FetchResult[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/prs${force ? "?refresh=1" : ""}`);
      if (res.status === 401) {
        window.location.href = "/api/auth/signin";
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResults(await res.json() as FetchResult[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Initial load + background poll
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-400">
        {error} —{" "}
        <button onClick={() => void load()} className="ml-2 underline">retry</button>
      </div>
    );
  }

  if (results.length === 0 && refreshing) {
    return <div className="flex h-full items-center justify-center text-gray-500 text-sm">Loading PRs…</div>;
  }

  return <PrTable results={results} onRefresh={() => void load(true)} refreshing={refreshing} />;
}
