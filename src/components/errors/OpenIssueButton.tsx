"use client";

import { useState } from "react";
import { ExternalLink, LoaderCircle } from "lucide-react";

/**
 * Client component for manually triggering GitHub Issue creation
 * from the admin errors panel. Calls POST /api/errors/process-issues
 * with a specific fingerprint to bypass automatic thresholds.
 */
export function OpenIssueButton({ fingerprint }: { fingerprint: string }) {
  const [loading, setLoading] = useState(false);
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (loading || issueUrl) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/errors/process-issues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fingerprint }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const created = data.details?.find(
        (d: { fingerprint: string; issueUrl?: string }) =>
          d.fingerprint === fingerprint && d.issueUrl,
      );
      if (created?.issueUrl) {
        setIssueUrl(created.issueUrl);
      } else {
        setError("Limiar não atingido ou dedup ativo");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha desconhecida");
    } finally {
      setLoading(false);
    }
  }

  if (issueUrl) {
    return (
      <a
        href={issueUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-lg bg-[#B9FF66] px-2.5 py-1 text-xs font-bold text-[#191A23] transition-opacity hover:opacity-90"
      >
        <ExternalLink className="size-3" />
        Ver Issue
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleCreate}
        disabled={loading}
        className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {loading ? (
          <LoaderCircle className="size-3 animate-spin" />
        ) : (
          <ExternalLink className="size-3" />
        )}
        Abrir Issue
      </button>
      {error && (
        <span className="text-[10px] text-red-500">{error}</span>
      )}
    </div>
  );
}