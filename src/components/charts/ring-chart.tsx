"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

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
  size = 240,
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

  const setHoveredIndex = (index: number | null) => {
    setLocalHoveredIndex(index);
    onHoverChange?.(index);
  };

  const contextValue = useMemo(
    () => ({
      data,
      size,
      strokeWidth,
      ringGap,
      baseInnerRadius,
      hoveredIndex,
      setHoveredIndex,
    }),
    // setHoveredIndex é estável por composição (função local por render) — o
    // contexto é recriado quando hoveredIndex muda, que é o gatilho real.
    [data, size, strokeWidth, ringGap, baseInnerRadius, hoveredIndex]
  );

  return (
    <RingChartContext.Provider value={contextValue}>
      <div
        className={cn("relative flex items-center justify-center select-none", className)}
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

export function Ring({
  index,
  color,
  animate = true,
  showGlow = true,
  lineCap = "round",
}: RingProps) {
  const { data, size, strokeWidth, ringGap, baseInnerRadius, hoveredIndex, setHoveredIndex } = useRingChartContext();

  const item = data[index];
  if (!item) return null;

  // Calculate radius for this ring index (going from inside to outside)
  const radius = baseInnerRadius + index * (strokeWidth + ringGap);
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  const percentage = item.maxValue > 0 ? Math.min(item.value / item.maxValue, 1) : 0;
  const strokeDashoffset = circumference - percentage * circumference;

  const defaultColors = ["#0066cc", "#10b981", "#6366f1", "#f59e0b", "#ec4899", "#8b5cf6"];
  const ringColor = color || item.color || defaultColors[index % defaultColors.length];

  const isHovered = hoveredIndex === index;
  const anyHovered = hoveredIndex !== null;

  return (
    <g
      onMouseEnter={() => setHoveredIndex(index)}
      onMouseLeave={() => setHoveredIndex(null)}
      className="cursor-pointer origin-center"
      style={{ transformOrigin: `${center}px ${center}px` }}
    >
      {/* Background Track Circle */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="transparent"
        stroke="currentColor"
        className="text-black/[0.04] dark:text-white/[0.04]"
        strokeWidth={strokeWidth}
      />

      {/* Hover Outer Glow Ring */}
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
            strokeDashoffset: strokeDashoffset,
            opacity: isHovered ? 0.18 : 0,
            scale: isHovered ? 1.02 : 1,
          }}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: `${center}px ${center}px`,
          }}
        />
      )}

      {/* Progress Arc Circle */}
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
          strokeDashoffset: strokeDashoffset,
          opacity: anyHovered && !isHovered ? 0.45 : 1,
        }}
        transition={{
          type: "spring",
          stiffness: 80,
          damping: 14,
          delay: animate ? index * 0.08 : 0,
        }}
        style={{
          transform: "rotate(-90deg)",
          transformOrigin: `${center}px ${center}px`,
        }}
        className="transition-shadow"
      />
    </g>
  );
}

export interface RingCenterProps {
  defaultLabel?: string;
  formatValue?: (value: number) => string;
  className?: string;
}

export function RingCenter({
  defaultLabel = "Total",
  formatValue = (val) => val.toLocaleString(),
  className,
}: RingCenterProps) {
  const { data, hoveredIndex } = useRingChartContext();

  const activeItem = hoveredIndex !== null ? data[hoveredIndex] : null;

  const displayValue = activeItem ? activeItem.value : data.reduce((sum, d) => sum + d.value, 0);
  const displayLabel = activeItem ? activeItem.label : defaultLabel;

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none",
        className
      )}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#7a7a7a] dark:text-[#cccccc] transition-all duration-300">
        {displayLabel}
      </span>
      <strong className="text-[20px] font-bold text-slate-800 dark:text-white tabular-nums transition-all duration-300 mt-0.5 leading-none">
        {formatValue(displayValue)}
      </strong>
    </div>
  );
}

export interface LegendProps {
  data: RingData[];
  hoveredIndex?: number | null;
  onHoverChange?: (index: number | null) => void;
  className?: string;
}

export function Legend({
  data,
  hoveredIndex,
  onHoverChange,
  className,
}: LegendProps) {
  const defaultColors = ["#0066cc", "#10b981", "#6366f1", "#f59e0b", "#ec4899", "#8b5cf6"];

  return (
    <div className={cn("flex flex-col gap-2 font-sans text-[12px]", className)}>
      {data.map((item, index) => {
        const ringColor = item.color || defaultColors[index % defaultColors.length];
        const isHovered = hoveredIndex === index;
        const anyHovered = hoveredIndex !== null && hoveredIndex !== undefined;

        const percentage = item.maxValue > 0 ? Math.round((item.value / item.maxValue) * 100) : 0;

        return (
          <div
            key={item.label}
            onMouseEnter={() => onHoverChange?.(index)}
            onMouseLeave={() => onHoverChange?.(null)}
            className={cn(
              "flex items-center justify-between gap-4 p-1.5 rounded-lg transition-all cursor-pointer",
              isHovered ? "bg-black/5 dark:bg-white/5 scale-[1.02]" : "hover:bg-black/[0.02] dark:hover:bg-white/[0.02]",
              anyHovered && !isHovered ? "opacity-50" : "opacity-100"
            )}
          >
            <span className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: ringColor }}
              />
              <span className="truncate max-w-[120px]">{item.label}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <strong className="text-slate-800 dark:text-white font-bold">{item.value.toLocaleString()}</strong>
              <span className="text-[10px] font-semibold text-[#7a7a7a] dark:text-[#cccccc] bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded-full">
                {percentage}%
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
