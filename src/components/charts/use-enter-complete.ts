"use client";

import type { MotionValue } from "motion/react";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Returns true once a mount-progress MotionValue reaches 1.
 * Use to swap animated MotionValue-driven props for static values after
 * enter completes — drops per-frame subscriptions during pan/hover.
 *
 * Assinatura externa via `useSyncExternalStore`: o MotionValue é um store
 * externo, e o snapshot deriva do valor atual — cobre também o caso de o
 * progresso já estar completo quando o hook monta (sem setState em efeito).
 */
export function useEnterComplete(mountProgress: MotionValue<number>): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => mountProgress.on("change", onStoreChange),
    [mountProgress]
  );
  const getSnapshot = useCallback(
    () => mountProgress.get() >= 1,
    [mountProgress]
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
