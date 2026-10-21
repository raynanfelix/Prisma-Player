"use client";

/**
 * ComposedChart composável sobre recharts - Prisma Player.
 *
 * Base: padrão composável do ecossistema kokonutui/21st.dev (shadcn-style),
 * reconstruído sobre recharts (sem libs novas) e adaptado aos tokens da
 * Prisma. Responsivo por padrão (ResponsiveContainer + `aspectRatio` CSS).
 *
 * API aprovada pelo dono:
 *   ComposedChart(margin, data, aspectRatio="3 / 2", barGap=0, maxBarSize=30,
 *                 xDataKey="date") + Grid(horizontal) + Area(fillOpacity .22)
 *                 + SeriesBar(radius 6) + Line(strokeWidth 2.5)
 *
 * Extensões documentadas da Prisma: `xTickFormatter`, `yTickFormatter`,
 * `valueFormatter` (tooltip pt-BR), `rightAxis` (eixo percentual secundário)
 * e `yAxisId` nas séries. Origem/licença: MIT (ecossistema kokonutui);
 * consulta em 2026-10-17.
 */

import React, { createContext, useContext } from "react";
import {
  Area as RechartsArea,
  Bar as RechartsBar,
  CartesianGrid,
  ComposedChart as RechartsComposedChart,
  Line as RechartsLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatChartNumber, seriesColor } from "./palette";

interface ComposedChartContextValue {
  maxBarSize: number;
}

const ComposedChartContext = createContext<ComposedChartContextValue | null>(null);

function useComposedChartContext() {
  const context = useContext(ComposedChartContext);
  if (!context) {
    throw new Error("Composed series must be wrapped in a <ComposedChart />");
  }
  return context;
}

export interface ComposedChartProps {
  data: Record<string, unknown>[];
  xDataKey?: string;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  aspectRatio?: string;
  barGap?: number;
  maxBarSize?: number;
  xTickFormatter?: (value: unknown, index: number) => string;
  yTickFormatter?: (value: number) => string;
  /** Formata os valores no tooltip (ex.: % para taxas, pt-BR para contagens). */
  valueFormatter?: (value: number, name: string) => string;
  /** Eixo Y secundário (ex.: taxa 0-100%). */
  rightAxis?: {
    domain?: [number | "auto", number | "auto"];
    tickFormatter?: (value: number) => string;
  };
  className?: string;
  children: React.ReactNode;
}

export function ComposedChart({
  data,
  xDataKey = "date",
  margin,
  aspectRatio = "3 / 2",
  barGap = 0,
  maxBarSize = 30,
  xTickFormatter,
  yTickFormatter,
  valueFormatter = formatChartNumber,
  rightAxis,
  className,
  children,
}: ComposedChartProps) {
  const chartMargin = margin ?? { top: 12, right: rightAxis ? 8 : 12, bottom: 4, left: -14 };

  return (
    <ComposedChartContext.Provider value={{ maxBarSize }}>
      <div className={cn("w-full", className)} style={{ aspectRatio }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsComposedChart data={data} margin={chartMargin} barGap={barGap}>
            <RechartsXAxis
              dataKey={xDataKey}
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              minTickGap={16}
              tickFormatter={xTickFormatter ? (value, index) => xTickFormatter(value, index) : undefined}
              className="text-[10px] font-semibold fill-[#7a7a7a] dark:fill-[#cccccc]"
            />
            <RechartsYAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={yTickFormatter}
              className="text-[10px] font-semibold fill-[#7a7a7a] dark:fill-[#cccccc]"
            />
            {rightAxis && (
              <RechartsYAxis
                yAxisId="right"
                orientation="right"
                axisLine={false}
                tickLine={false}
                domain={rightAxis.domain ?? ["auto", "auto"]}
                tickFormatter={rightAxis.tickFormatter}
                className="text-[10px] font-semibold fill-[#7a7a7a] dark:fill-[#cccccc]"
              />
            )}
            <RechartsTooltip
              cursor={{ fill: "currentColor", className: "fill-black/[0.04] dark:fill-white/[0.06]" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="min-w-32 rounded-xl border border-[#e0e0e0] bg-white/95 p-3 font-sans text-[11px] shadow-xl backdrop-blur-sm dark:border-white/10 dark:bg-card/95">
                    <strong className="mb-1 block font-semibold text-[#1d1d1f] dark:text-white">{label}</strong>
                    <div className="space-y-1">
                      {payload.map((item, index) => (
                        <div
                          key={`${item.name}-${index}`}
                          className="flex justify-between gap-4 font-medium text-[#7a7a7a] dark:text-[#cccccc]"
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            {item.name}
                          </span>
                          <strong className="tabular-nums text-[#1d1d1f] dark:text-white">
                            {valueFormatter(Number(item.value ?? 0), String(item.name ?? ""))}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }}
            />
            {children}
          </RechartsComposedChart>
        </ResponsiveContainer>
      </div>
    </ComposedChartContext.Provider>
  );
}

export interface GridProps {
  horizontal?: boolean;
  vertical?: boolean;
}

export function Grid({ horizontal = true, vertical = false }: GridProps) {
  return (
    <CartesianGrid
      vertical={vertical}
      horizontal={horizontal}
      stroke="currentColor"
      className="text-black/[0.06] dark:text-white/[0.06]"
      strokeDasharray="3 5"
    />
  );
}

export interface AreaProps {
  dataKey: string;
  name?: string;
  color?: string;
  fillOpacity?: number;
  yAxisId?: string;
}

export function Area({ dataKey, name, color, fillOpacity = 0.22, yAxisId }: AreaProps) {
  const stroke = color ?? seriesColor(1);
  return (
    <RechartsArea
      type="monotone"
      dataKey={dataKey}
      name={name ?? dataKey}
      stroke={stroke}
      strokeWidth={2}
      fill={stroke}
      fillOpacity={fillOpacity}
      yAxisId={yAxisId}
      dot={false}
      activeDot={{ r: 5, strokeWidth: 2, fill: stroke, stroke: "#fff" }}
    />
  );
}

export interface SeriesBarProps {
  dataKey: string;
  name?: string;
  color?: string;
  /** Arredondamento superior das barras (padrão 6, da API aprovada). */
  radius?: number;
  yAxisId?: string;
}

export function SeriesBar({ dataKey, name, color, radius = 6, yAxisId }: SeriesBarProps) {
  const { maxBarSize } = useComposedChartContext();
  return (
    <RechartsBar
      dataKey={dataKey}
      name={name ?? dataKey}
      fill={color ?? seriesColor(0)}
      radius={[radius, radius, 0, 0]}
      maxBarSize={maxBarSize}
      yAxisId={yAxisId}
    />
  );
}

export interface LineProps {
  dataKey: string;
  name?: string;
  color?: string;
  strokeWidth?: number;
  yAxisId?: string;
}

export function Line({ dataKey, name, color, strokeWidth = 2.5, yAxisId }: LineProps) {
  const stroke = color ?? seriesColor(1);
  return (
    <RechartsLine
      type="monotone"
      dataKey={dataKey}
      name={name ?? dataKey}
      stroke={stroke}
      strokeWidth={strokeWidth}
      yAxisId={yAxisId}
      dot={false}
      activeDot={{ r: 5, strokeWidth: 2, fill: stroke, stroke: "#fff" }}
    />
  );
}
