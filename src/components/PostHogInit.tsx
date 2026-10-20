"use client";

import { useEffect } from "react";
import { initPostHog } from "@/lib/posthog-client";

/**
 * Inicializa o PostHog uma única vez. Este componente só é carregado pelo
 * `Analytics` via `next/dynamic`, depois de `load` + idle, então o SDK nunca
 * entra no JavaScript inicial da página.
 */
export default function PostHogInit() {
  useEffect(() => {
    initPostHog();
  }, []);

  return null;
}
