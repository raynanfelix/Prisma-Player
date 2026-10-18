"use client";

import { useState } from "react";
import { createRealtimeClient, type SealedLiveQuery } from "@neon/realtime/client";
import { drizzleParsers } from "@neon/realtime-drizzle/client";

/**
 * Cliente Realtime — uma conexão por app (subscriptions compartilham).
 * Criado em useState (não module-level) para SSR-safe.
 */
export function useRealtimeClient() {
  const [client] = useState(() => {
    const url = process.env.NEXT_PUBLIC_NEON_REALTIME_URL;
    if (!url) return null;
    return createRealtimeClient({ url, parsers: { ...drizzleParsers } });
  });
  return client;
}

/**
 * Helper: busca a query selada da API e devolve o token.
 * O componente usa useLiveQuery do SDK com esse token.
 */
export async function fetchSealedQuery(type: string): Promise<SealedLiveQuery<unknown> | null> {
  try {
    const response = await fetch(`/api/realtime?type=${encodeURIComponent(type)}`, { cache: "no-store" });
    const result = (await response.json()) as { sealed?: SealedLiveQuery<unknown> } | null;
    if (!response.ok || !result?.sealed) return null;
    return result.sealed;
  } catch {
    return null;
  }
}

export type { SealedLiveQuery };
