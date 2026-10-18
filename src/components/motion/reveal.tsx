"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Revelação suave de conteúdo (fade + micro slide de 8px). Spring macio
 * (stiffness baixo + damping alto = desacelera sem tranco). `delay` para
 * cascata. whileInView "once" — anima só na primeira aparição.
 * Respeita prefers-reduced-motion.
 */
export default function Reveal({
  children,
  delay = 0,
  y = 8,
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
      viewport={{ once: true, margin: "-32px" }}
      transition={{
        type: "spring",
        stiffness: 160,
        damping: 28,
        mass: 0.9,
        delay,
      }}
    >
      {children}
    </motion.div>
  );
}
