"use client";

import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Transição de navegação do dashboard: suave, quase imperceptível - a página
 * "respira" pra posição em vez de pular. 6px de deslize, 380ms, ease-out
 * exponencial (desacelera sem tranco no fim). Respeita prefers-reduced-motion.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  if (reduce) return <>{children}</>;

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.03 }}
    >
      {children}
    </motion.div>
  );
}
