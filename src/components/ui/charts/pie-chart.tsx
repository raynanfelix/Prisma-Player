"use client";

/**
 * PieChart composável (donut) sobre recharts — Prisma Player.
 *
 * Base: padrão composável do ecossistema kokonutui/21st.dev (shadcn-style),
 * reconstruído sobre recharts (sem libs novas) e adaptado aos tokens da
 * Prisma: paleta via `palette.ts`, textos pt-BR, central com valor por
 * padrão do primeiro slice (`defaultIndex`) e compartimento decorativo
 * marcado com aria-hidden quando o número já existe em texto.
 *
 * Origem/alterações registradas conforme src/components/README.md:
 * - Biblioteca: kokonutui (https://kokonutui.com) / 21st.dev — API aprovada
 *   pelo dono (PieChart + PieSlice + PieCenter);
 * - Licença: MIT (ecossistema kokonutui); implementação própria sobre recharts;
 * - Adaptações: tokens de cor, formatação pt-BR, hover controlável;
 * - Data da consulta: 2026-10-17.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  Cell,
  Pie as RechartsPie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatChartNumber, seriesColor } from "./palette";

export interface PieDataItem {
  label: string;
  value: number;
  color?: string;
}

interface PieChartContextValue {
  data: PieDataItem[];
  hoveredIndex: number | null;
  setHoveredIndex: (index: number | null) => void;
}

const PieChartContext = createContext<PieChartContextValue | null>(null);

function usePieChartContext() {
  const context = useContext(PieChartContext);
  if (!context) {
    throw new Error("Pie components must be wrapped in a <PieChart />");
  }
  return context;
}

export interface PieChartProps {
  data: PieDataItem[];
  innerRadius?: number;
  size?: number;
  hoveredIndex?: number | null;
  onHoverChange?: (index: number | null) => void;
  className?: string;
  children: React.ReactNode;
}

export function PieChart({
  data,
  innerRadius = 60,
  size = 200,
  hoveredIndex: controlledHoveredIndex,
  onHoverChange,
  className,
  children,
}: PieChartProps) {
  const [localHoveredIndex, setLocalHoveredIndex] = useState<number | null>(null);
  const hoveredIndex = controlledHoveredIndex !== undefined ? controlledHoveredIndex : localHoveredIndex;

  const setHoveredIndex = useCallback(
    (index: number | null) => {
      setLocalHoveredIndex(index);
      onHoverChange?.(index);
    },
    [onHoverChange],
  );

  const contextValue = useMemo(
    () => ({ data, hoveredIndex, setHoveredIndex }),
    [data, hoveredIndex, setHoveredIndex],
  );

  const allChildren = React.Children.toArray(children);
  const slices: React.ReactElement<PieSliceProps>[] = [];
  const overlay: React.ReactNode[] = [];
  for (const child of allChildren) {
    if (React.isValidElement(child) && child.type === PieSlice) {
      slices.push(child as React.ReactElement<PieSliceProps>);
    } else {
      overlay.push(child);
    }
  }

  return (
    <PieChartContext.Provider value={contextValue}>
      <div
        className={cn("relative select-none", className)}
        style={{ width: size, height: size }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <RechartsPie
              data={data}
              dataKey="value"
              innerRadius={innerRadius}
              outerRadius={size / 2 - 4}
              paddingAngle={slices.length > 1 ? 2 : 0}
              cornerRadius={slices.length > 1 ? 6 : 0}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive
              onMouseEnter={(_, index) => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {slices}
            </RechartsPie>
          </RechartsPieChart>
        </ResponsiveContainer>
        {overlay}
      </div>
    </PieChartContext.Provider>
  );
}

export interface PieSliceProps {
  index: number;
  color?: string;
}

export function PieSlice({ index, color }: PieSliceProps) {
  const { data, hoveredIndex } = usePieChartContext();
  const item = data[index];
  if (!item) return null;

  const fill = color ?? item.color ?? seriesColor(index);
  const isHovered = hoveredIndex === index;
  const anyHovered = hoveredIndex !== null;

  return (
    <Cell
      fill={fill}
      fillOpacity={anyHovered && !isHovered ? 0.35 : 1}
      className="outline-none"
    />
  );
}

export interface PieCenterProps {
  defaultLabel?: string;
  /** Sem hover: valor exibido. Padrão = soma dos slices. */
  defaultIndex?: number;
  formatValue?: (value: number) => string;
  className?: string;
}

export function PieCenter({
  defaultLabel = "Total",
  defaultIndex,
  formatValue = formatChartNumber,
  className,
}: PieCenterProps) {
  const { data } = usePieChartContext();

  const fallbackItem = defaultIndex !== undefined ? data[defaultIndex] : null;
  const total = data.reduce((sum, item) => sum + item.value, 0);

  const displayValue = fallbackItem ? fallbackItem.value : total;
  const displayLabel = defaultLabel;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center",
        className,
      )}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#7a7a7a] dark:text-[#cccccc]">
        {displayLabel}
      </span>
      <strong className="mt-0.5 text-[18px] font-bold leading-none tabular-nums text-[#191A23] dark:text-white">
        {formatValue(displayValue)}
      </strong>
    </div>
  );
}
