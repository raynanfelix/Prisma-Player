"use client";

import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Transição de navegação do dashboard: cada troca de rota remonta o wrapper
 * (key = pathname) e anima a entrada do conteúdo — fim do "abre seco".
 * Respeita prefers-reduced-motion (sem animação nesses casos).
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  if (reduce) return <>{children}</>;

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}
