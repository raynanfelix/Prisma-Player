"use client";

/**
 * Legend composável do RingChart - Prisma Player.
 *
 * Base: kokonutui "Ring Chart" (MIT, ecossistema kokonutui/21st.dev) com a
 * Legend decomposta na API aprovada pelo dono:
 *   Legend(hoveredIndex, items, onHoverChange) com LegendItem/LegendMarker/
 *   LegendLabel/LegendValue(showPercentage)/LegendProgress.
 * Adaptações Prisma: paleta única (`palette.ts`), formatação pt-BR, dark =
 * preto com hairlines brancas. Consulta em 2026-10-17.
 */

import React, { createContext, useContext } from "react";
import { cn } from "@/lib/utils";
import { formatChartNumber, seriesColor } from "./palette";
import type { RingData } from "./ring-chart";

interface LegendContextValue {
  hoveredIndex: number | null;
  onHoverChange?: (index: number | null) => void;
}

const LegendContext = createContext<LegendContextValue | null>(null);

export interface LegendProps {
  hoveredIndex?: number | null;
  onHoverChange?: (index: number | null) => void;
  /** Itens padrão (RingData[]); com `children`, a composição é manual. */
  items?: RingData[];
  className?: string;
  children?: React.ReactNode;
}

export function Legend({ hoveredIndex = null, onHoverChange, items, className, children }: LegendProps) {
  return (
    <LegendContext.Provider value={{ hoveredIndex, onHoverChange }}>
      <div className={cn("flex flex-col gap-1.5 font-sans text-[12px]", className)}>
        {items
          ? items.map((item, index) => (
              <LegendItem key={item.label} index={index}>
                <LegendMarker color={item.color ?? seriesColor(index)} />
                <LegendLabel>{item.label}</LegendLabel>
                <LegendValue value={item.value} showPercentage total={item.maxValue} />
                <LegendProgress value={item.value} total={item.maxValue} color={item.color ?? seriesColor(index)} />
              </LegendItem>
            ))
          : children}
      </div>
    </LegendContext.Provider>
  );
}

export interface LegendItemProps {
  index: number;
  className?: string;
  children?: React.ReactNode;
}

export function LegendItem({ index, className, children }: LegendItemProps) {
  const { hoveredIndex, onHoverChange } = useContext(LegendContext) ?? {
    hoveredIndex: null as number | null,
  };

  const isHovered = hoveredIndex === index;
  const anyHovered = hoveredIndex !== null;

  return (
    <div
      onMouseEnter={() => onHoverChange?.(index)}
      onMouseLeave={() => onHoverChange?.(null)}
      className={cn(
        "flex cursor-pointer items-center justify-between gap-3 rounded-lg p-1.5 transition-all",
        isHovered ? "scale-[1.02] bg-black/5 dark:bg-white/5" : "hover:bg-black/[0.02] dark:hover:bg-white/[0.02]",
        anyHovered && !isHovered ? "opacity-50" : "opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface LegendMarkerProps {
  color?: string;
  className?: string;
}

export function LegendMarker({ color, className }: LegendMarkerProps) {
  return (
    <span
      className={cn("h-2.5 w-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

export interface LegendLabelProps {
  children: React.ReactNode;
  className?: string;
}

export function LegendLabel({ children, className }: LegendLabelProps) {
  return (
    <span className={cn("min-w-0 flex-1 truncate whitespace-nowrap font-semibold text-[#191A23] dark:text-zinc-200", className)}>
      {children}
    </span>
  );
}

export interface LegendValueProps {
  value: number;
  showPercentage?: boolean;
  total?: number;
  format?: (value: number) => string;
  className?: string;
}

export function LegendValue({
  value,
  showPercentage = false,
  total,
  format = formatChartNumber,
  className,
}: LegendValueProps) {
  const percentage = total && total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <span className={cn("flex shrink-0 items-center gap-2", className)}>
      <strong className="font-bold tabular-nums text-[#191A23] dark:text-white">{format(value)}</strong>
      {showPercentage && (
        <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[#7a7a7a] dark:bg-white/10 dark:text-[#cccccc]">
          {percentage}%
        </span>
      )}
    </span>
  );
}

export interface LegendProgressProps {
  value: number;
  total: number;
  color?: string;
  className?: string;
}

export function LegendProgress({ value, total, color, className }: LegendProgressProps) {
  const percentage = total > 0 ? Math.min((value / total) * 100, 100) : 0;
  return (
    <span className={cn("h-1 w-12 shrink-0 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]", className)}>
      <span
        className="block h-full rounded-full transition-all duration-300"
        style={{ width: `${percentage}%`, backgroundColor: color }}
      />
    </span>
  );
}
