"use client";

import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";

/**
 * Detecta o estado do Caps Lock a partir dos eventos de teclado de um campo.
 * Retorne `detectCapsLock` ligado a onKeyDown e onKeyUp do input.
 */
export function useCapsLock() {
  const [enabled, setEnabled] = useState(false);

  const detectCapsLock = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    setEnabled(event.getModifierState?.("CapsLock") ?? false);
  }, []);

  return { capsLockOn: enabled, detectCapsLock };
}
