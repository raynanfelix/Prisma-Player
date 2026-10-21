"use client";

/**
 * RingChart composável (anéis concêntricos com hover sincronizado) sobre
 * SVG + Motion - Prisma Player.
 *
 * Base: kokonutui "Ring Chart" (ecossistema kokonutui/21st.dev, MIT - mesmo
 * componente já aprovado pelo dono no dashboard), portado para
 * `ui/charts` com a Legend decomposta na API aprovada (arquivo
 * `ring-legend.tsx`):
 *   RingChart(data, hoveredIndex, onHoverChange, size=180) + Ring(index)
 *   + RingCenter(defaultLabel) + Legend(hoveredIndex, items, onHoverChange)
 *   com LegendItem/LegendMarker/LegendLabel/LegendValue(showPercentage)
 *   /LegendProgress.
 *
 * Adaptações Prisma: paleta via `palette.ts`, formatação pt-BR, dark = preto
 * puro com hairlines brancas. Data da consulta: 2026-10-17.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { formatChartNumber, seriesColor } from "./palette";

export interface RingData {
  label: string;
  value: number;
  maxValue: number;
  color?: string;
}

interface RingChartContextValue {
  data: RingData[];
  size: number;
  strokeWidth: number;
  ringGap: number;
  baseInnerRadius: number;
  hoveredIndex: number | null;
  setHoveredIndex: (index: number | null) => void;
}

const RingChartContext = createContext<RingChartContextValue | null>(null);

function useRingChartContext() {
  const context = useContext(RingChartContext);
  if (!context) {
    throw new Error("Ring components must be wrapped in a <RingChart />");
  }
  return context;
}

export interface RingChartProps {
  data: RingData[];
  size?: number;
  strokeWidth?: number;
  ringGap?: number;
  baseInnerRadius?: number;
  hoveredIndex?: number | null;
  onHoverChange?: (index: number | null) => void;
  className?: string;
  children: React.ReactNode;
}

export function RingChart({
  data,
  size = 180,
  strokeWidth = 12,
  ringGap = 6,
  baseInnerRadius = 50,
  hoveredIndex: controlledHoveredIndex,
  onHoverChange,
  className,
  children,
}: RingChartProps) {
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
    () => ({ data, size, strokeWidth, ringGap, baseInnerRadius, hoveredIndex, setHoveredIndex }),
    // setHoveredIndex é estável por useCallback; o gatilho real é hoveredIndex.
    [data, size, strokeWidth, ringGap, baseInnerRadius, hoveredIndex, setHoveredIndex],
  );

  return (
    <RingChartContext.Provider value={contextValue}>
      <div
        className={cn("relative flex select-none items-center justify-center", className)}
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
          {children}
        </svg>
      </div>
    </RingChartContext.Provider>
  );
}

export interface RingProps {
  index: number;
  color?: string;
  animate?: boolean;
  showGlow?: boolean;
  lineCap?: "round" | "butt";
}

export function Ring({ index, color, animate = true, showGlow = true, lineCap = "round" }: RingProps) {
  const { data, size, strokeWidth, ringGap, baseInnerRadius, hoveredIndex, setHoveredIndex } =
    useRingChartContext();

  const item = data[index];
  if (!item) return null;

  const radius = baseInnerRadius + index * (strokeWidth + ringGap);
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = item.maxValue > 0 ? Math.min(item.value / item.maxValue, 1) : 0;
  const strokeDashoffset = circumference - percentage * circumference;
  const ringColor = color ?? item.color ?? seriesColor(index);

  const isHovered = hoveredIndex === index;
  const anyHovered = hoveredIndex !== null;

  return (
    <g
      onMouseEnter={() => setHoveredIndex(index)}
      onMouseLeave={() => setHoveredIndex(null)}
      className="cursor-pointer origin-center"
      style={{ transformOrigin: `${center}px ${center}px` }}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="transparent"
        stroke="currentColor"
        className="text-black/[0.06] dark:text-white/[0.08]"
        strokeWidth={strokeWidth}
      />

      {showGlow && (
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke={ringColor}
          strokeWidth={strokeWidth + 6}
          strokeLinecap={lineCap}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{
            strokeDashoffset,
            opacity: isHovered ? 0.18 : 0,
            scale: isHovered ? 1.02 : 1,
          }}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
          style={{ transform: "rotate(-90deg)", transformOrigin: `${center}px ${center}px` }}
        />
      )}

      <motion.circle
        cx={center}
        cy={center}
        r={radius}
        fill="transparent"
        stroke={ringColor}
        strokeWidth={isHovered ? strokeWidth + 2 : strokeWidth}
        strokeLinecap={lineCap}
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{
          strokeDashoffset,
          opacity: anyHovered && !isHovered ? 0.45 : 1,
        }}
        transition={{
          type: "spring",
          stiffness: 80,
          damping: 14,
          delay: animate ? index * 0.08 : 0,
        }}
        style={{ transform: "rotate(-90deg)", transformOrigin: `${center}px ${center}px` }}
      />
    </g>
  );
}

export interface RingCenterProps {
  defaultLabel?: string;
  formatValue?: (value: number) => string;
  className?: string;
}

export function RingCenter({ defaultLabel = "Total", formatValue = formatChartNumber, className }: RingCenterProps) {
  const { data, hoveredIndex } = useRingChartContext();

  const activeItem = hoveredIndex !== null ? data[hoveredIndex] : null;
  const displayValue = activeItem ? activeItem.value : data.reduce((sum, item) => sum + item.value, 0);
  const displayLabel = activeItem ? activeItem.label : defaultLabel;

  return (
    <div className={cn("pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center", className)}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#7a7a7a] transition-all duration-300 dark:text-[#cccccc]">
        {displayLabel}
      </span>
      <strong className="mt-0.5 text-[20px] font-bold leading-none tabular-nums text-[#191A23] dark:text-white">
        {formatValue(displayValue)}
      </strong>
    </div>
  );
}
