"use client";

import React, { useId } from "react";
import {
  ResponsiveContainer,
  AreaChart as RechartsAreaChart,
  Area as RechartsArea,
  CartesianGrid,
  XAxis as RechartsXAxis,
  Tooltip as RechartsTooltip,
} from "recharts";

export interface AreaChartProps {
  data: Record<string, unknown>[];
  xDataKey?: string;
  className?: string;
  children: React.ReactNode;
}

export function AreaChart({
  data,
  xDataKey = "date",
  className,
  children,
}: AreaChartProps) {
  const gradientId = `area-gradient-${useId().replace(/:/g, "")}`;

  // We clone children to inject the gradientId if needed, or pass it implicitly
  return (
    <div className={className} style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart
          data={data}
          margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--prisma-blue, #0066cc)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--prisma-blue, #0066cc)" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="area-line-primary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0066cc" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#0066cc" stopOpacity={0} />
            </linearGradient>
          </defs>
          {React.Children.map(children, (child) => {
            if (!React.isValidElement(child)) return null;

            if (child.type === Area) {
              return React.cloneElement(child as React.ReactElement<AreaProps>, {
                gradientId,
              });
            }
            return child;
          })}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
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
      className="text-black/[0.04] dark:text-white/[0.04]"
      strokeDasharray="3 5"
    />
  );
}

export interface AreaProps {
  dataKey: string;
  fill?: string;
  fillOpacity?: number;
  showMarkers?: boolean;
  markers?: {
    radius?: number;
    ringGap?: number;
    strokeWidth?: number;
  };
  gradientId?: string; // injected
}

export function Area({
  dataKey,
  fill,
  fillOpacity = 0.35,
  showMarkers = true,
  markers,
  gradientId,
}: AreaProps) {
  const finalFill = fill === "var(--chart-line-primary)" ? "#0066cc" : fill || "#0066cc";
  const strokeColor = fill === "var(--chart-line-primary)" ? "#0066cc" : fill || "#0066cc";

  return (
    <RechartsArea
      type="monotone"
      dataKey={dataKey}
      stroke={strokeColor}
      strokeWidth={2}
      fill={gradientId ? `url(#${gradientId})` : finalFill}
      fillOpacity={fillOpacity}
      dot={
        showMarkers
          ? {
              r: markers?.radius || 4,
              strokeWidth: markers?.strokeWidth || 2,
              fill: strokeColor,
              stroke: "#fff",
            }
          : false
      }
      activeDot={{
        r: (markers?.radius || 4) + 2,
        strokeWidth: markers?.strokeWidth || 2,
        fill: strokeColor,
        stroke: "#fff",
      }}
    />
  );
}

export interface XAxisProps {
  tickMode?: "data" | "auto";
}

export function XAxis({ tickMode = "data" }: XAxisProps) {
  return (
    <RechartsXAxis
      dataKey="label"
      axisLine={false}
      tickLine={false}
      tickMargin={10}
      className="text-[10px] fill-[#7a7a7a] dark:fill-[#cccccc] font-semibold"
    />
  );
}

export function ChartTooltip() {
  return (
    <RechartsTooltip
      content={({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        return (
          <div className="rounded-xl border bg-white/95 p-3 shadow-xl backdrop-blur-sm border-[#e0e0e0] dark:bg-card/95 dark:border-white/5 text-[11px] min-w-32 font-sans">
            <strong className="block text-[#1d1d1f] dark:text-white font-semibold mb-1">
              {label}
            </strong>
            <div className="space-y-1">
              {payload.map((item, idx) => (
                <div key={idx} className="flex justify-between gap-4 text-[#7a7a7a] dark:text-[#cccccc] font-medium">
                  <span className="flex items-center gap-1">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    {item.name}
                  </span>
                  <strong className="text-[#1d1d1f] dark:text-white">
                    {item.value?.toLocaleString()}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        );
      }}
    />
  );
}
