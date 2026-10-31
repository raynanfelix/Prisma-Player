"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * AdminBarChart — barras agrupadas animadas (estilo Profit and Loss da spec).
 * Anima apenas transform (scaleY, compositor-friendly), stagger por índice,
 * respeita prefers-reduced-motion. Tooltip local no hover do grupo.
 */

export interface AdminBarGroup {
  label: string;
  current: number;
  previous: number | null;
}

export function AdminBarChart({ groups, valueFormatter }: {
  groups: AdminBarGroup[];
  valueFormatter: (value: number) => string;
}) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);
  const hasPrevious = groups.some((group) => group.previous !== null);

  const max = useMemo(() => {
    const values = groups.flatMap((group) => [group.current, group.previous ?? 0]);
    const raw = Math.max(1, ...values);
    // Teto "nice": arredonda para cima em passos de 1/2/2.5/5 × 10^n.
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const normalized = raw / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
  }, [groups]);

  const gridLines = [1, 0.75, 0.5, 0.25, 0];

  return (
    <div className="px-5 pb-5">
      <div className="relative h-[240px] w-full">
        {/* Gridlines + labels do eixo Y */}
        {gridLines.map((ratio) => (
          <div key={ratio} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${ratio * 100}%` }}>
            <span className="w-12 shrink-0 text-right text-[10px] font-medium themeable-text-ink-muted-48">{valueFormatter(max * ratio)}</span>
            <span className="h-px flex-1 bg-slate-100 dark:bg-white/[0.07]" aria-hidden />
          </div>
        ))}
        {/* Barras */}
        <div className="absolute inset-y-0 left-14 right-0 flex items-end justify-around gap-1">
          {groups.map((group, index) => {
            const currentHeight = Math.max(2, (group.current / max) * 100);
            const previousHeight = group.previous === null ? 0 : Math.max(2, (group.previous / max) * 100);
            const isHovered = hovered === index;
            return (
              <div
                key={group.label}
                className="relative flex h-full min-w-0 flex-1 cursor-default items-end justify-center gap-1"
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
              >
                {isHovered && (
                  <div className="pointer-events-none absolute -top-1 z-10 w-max rounded-xl bg-[#191A23] px-3 py-2 text-[11px] font-semibold text-white shadow-lg dark:bg-white dark:text-[#191A23]">
                    <p className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#B9FF66]" aria-hidden /> {valueFormatter(group.current)}</p>
                    {group.previous !== null && <p className="mt-0.5 flex items-center gap-1.5 opacity-70"><span className="size-1.5 rounded-full bg-white/60 dark:bg-[#191A23]/50" aria-hidden /> {valueFormatter(group.previous)}</p>}
                  </div>
                )}
                <motion.div
                  className="w-3 rounded-t-md sm:w-4"
                  style={{
                    height: `${currentHeight}%`,
                    background: "linear-gradient(180deg, #B9FF66 0%, #8fd42e 100%)",
                    transformOrigin: "bottom",
                  }}
                  initial={reduce ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ type: "spring", stiffness: 120, damping: 20, delay: index * 0.035 }}
                  role="img"
                  aria-label={`${group.label}: ${valueFormatter(group.current)}`}
                />
                {hasPrevious && (
                  <motion.div
                    className="w-3 rounded-t-md bg-[#191A23] dark:bg-zinc-500 sm:w-4"
                    style={{ height: `${previousHeight}%`, transformOrigin: "bottom" }}
                    initial={reduce ? false : { scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ type: "spring", stiffness: 120, damping: 20, delay: index * 0.035 + 0.05 }}
                    role="img"
                    aria-label={group.previous !== null ? `${group.label} (anterior): ${valueFormatter(group.previous)}` : undefined}
                  />
                )}
                <span className="absolute -bottom-6 text-[10px] font-medium themeable-text-ink-muted-48">{group.label}</span>
              </div>
            );
          })}
        </div>
        {/* Espaço para labels do eixo X */}
        <div className="h-6" aria-hidden />
      </div>
      {hasPrevious && (
        <div className="mt-2 flex items-center justify-end gap-4 text-[11px] font-semibold themeable-text-ink-muted-48">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: "linear-gradient(180deg,#B9FF66,#8fd42e)" }} aria-hidden /> Período atual</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[#191A23] dark:bg-zinc-500" aria-hidden /> Anterior</span>
        </div>
      )}
    </div>
  );
}
