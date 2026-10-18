"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Revelação de conteúdo (fade + slide-up) ao entrar na viewport.
 * useInView "once" — anima na primeira aparição só. Passe `delay` para
 * efeito cascata em listas/cards. Respeita prefers-reduced-motion.
 */
export default function Reveal({
  children,
  delay = 0,
  y = 14,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay }}
    >
      {children}
    </motion.div>
  );
}
