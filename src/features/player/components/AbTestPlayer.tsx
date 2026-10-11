"use client";

import { useEffect, useState } from "react";
import EmbedPlayer from "./EmbedPlayer";

interface Assignment { testId: string; variantId: string; videoId: string; playerId: string }

export default function AbTestPlayer({ testId, originToken }: { testId: string; originToken?: string }) {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const storageKey = `prisma-ab-session:${testId}`;
    let sessionId = localStorage.getItem(storageKey);
    if (!sessionId) { sessionId = crypto.randomUUID(); localStorage.setItem(storageKey, sessionId); }
    fetch(`/api/ab-tests/${encodeURIComponent(testId)}?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<Assignment>; })
      .then(setAssignment).catch(() => setFailed(true));
  }, [testId]);
  if (failed) return <main className="grid min-h-dvh place-items-center bg-black text-sm text-white/70">Teste A/B indisponível.</main>;
  if (!assignment) return <main className="grid min-h-dvh place-items-center bg-black text-white/60"><span className="animate-pulse">Selecionando variante…</span></main>;
  const sessionId = localStorage.getItem(`prisma-ab-session:${testId}`)!;
  return <EmbedPlayer playerId={assignment.playerId} originToken={originToken} tracking={{ testId, variantId: assignment.variantId, sessionId }} />;
}
