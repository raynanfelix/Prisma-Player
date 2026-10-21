"use client";

import { useEffect } from "react";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Carrega a analytics fora do caminho crítico.
 *
 * O SDK do PostHog tem dezenas de KiB (incluindo core-js e extensões) e antes
 * inicializava antes da hidratação em todas as rotas. Na landing page isso
 * virava tarefas longas na main thread, polyfills desnecessários e ~130 KiB de
 * JavaScript sem uso. O import dinâmico só roda depois de `load` +
 * `requestIdleCallback`, quando a página já está interativa.
 */
export function Analytics() {
  useEffect(() => {
    // Sem token (dev/preview), nem baixa o chunk da analytics.
    if (!projectToken) return;

    const idleWindow = window as IdleWindow;
    let cancelled = false;
    let idleHandle: number | undefined;
    let timeoutHandle: number | undefined;

    const start = () => {
      if (cancelled) return;
      void import("@/lib/posthog-client").then(({ initPostHog }) => initPostHog());
    };

    const schedule = () => {
      if (typeof idleWindow.requestIdleCallback === "function") {
        idleHandle = idleWindow.requestIdleCallback(start, { timeout: 2500 });
        return;
      }
      timeoutHandle = window.setTimeout(start, 200);
    };

    if (document.readyState === "complete") {
      schedule();
    } else {
      window.addEventListener("load", schedule, { once: true });
    }

    return () => {
      cancelled = true;
      if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
      window.removeEventListener("load", schedule);
    };
  }, []);

  return null;
}
