"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const PostHogInit = dynamic(() => import("@/components/PostHogInit"), {
  ssr: false,
});

/**
 * Carrega a analytics fora do caminho crítico.
 *
 * O SDK do PostHog tem dezenas de KiB (incluindo core-js e extensões) e antes
 * inicializava antes da hidratação em todas as rotas. Na landing page isso
 * virava tarefas longas na main thread, polyfills desnecessários e ~130 KiB de
 * JavaScript sem uso. Aqui o chunk só é buscado depois de `load` +
 * `requestIdleCallback`, quando a página já está interativa.
 */
export function Analytics() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | undefined;
    let timeoutHandle: number | undefined;

    const start = () => {
      if (!cancelled) setReady(true);
    };

    const schedule = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(start, { timeout: 2500 });
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
      if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle);
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
      window.removeEventListener("load", schedule);
    };
  }, []);

  return ready ? <PostHogInit /> : null;
}
