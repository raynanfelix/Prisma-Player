"use client";

import { ChartStatFlow, Line, LineChart } from "@/components/charts";
import { curveBasis } from "@visx/curve";
import { useState, useMemo } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sessionsSeries, sessionsStats } from "../data/sessions-series";
import {
  StatCardChart,
  statCardLabelClassName,
  statCardValueClassName,
} from "./stat-card-chart";
import {
  formatStatCardWeekday,
  StatCardHoverBridge,
  type StatCardHoverState,
} from "./stat-card-hover-bridge";
import { TrendBadge } from "./trend-badge";

export interface StatCardLineProps {
  title?: string;
  value?: number;
  description?: string;
  trend?: number;
  data?: { date: string; value: number }[];
  color?: string;
  suffix?: string;
}

export function StatCardLine({
  title = "Active Sessions",
  value,
  description = "Avg",
  trend,
  data,
  color = "var(--chart-3)",
  suffix = "",
}: StatCardLineProps) {
  const [hover, setHover] = useState<StatCardHoverState>({
    value: null,
    label: null,
    trend: null,
  });

  const isDynamic = data !== undefined;
  const defaultVal = value !== undefined ? value : Math.round(sessionsStats.average);
  const displayValue = hover.value === null ? defaultVal : hover.value;
  const displayLabel = hover.label ?? (isDynamic ? description : "Avg");
  const displayTrend = hover.trend ?? (trend !== undefined ? trend : sessionsStats.trend);

  const chartData = useMemo(() => {
    if (isDynamic && data) {
      return data;
    }
    return sessionsSeries;
  }, [isDynamic, data]);

  return (
    <Card className="w-full gap-0 py-0 border-[#e0e0e0] dark:border-white/5 bg-white dark:bg-card shadow-sm rounded-[22px]">
      <CardHeader className="px-5 py-4 flex flex-row items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="text-[14px] font-semibold text-slate-800 dark:text-white">{title}</CardTitle>
          <span className="text-[11px] text-[#7a7a7a] dark:text-[#cccccc]">{description}</span>
        </div>
        <CardAction>
          <TrendBadge value={displayTrend} />
        </CardAction>
      </CardHeader>

      <CardContent className="px-5 pt-2 pb-4">
        <StatCardChart size="md">
          <div className="pointer-events-none absolute right-4 bottom-4 z-10 flex flex-col items-end text-right">
            <ChartStatFlow
              label={displayLabel}
              labelClassName={statCardLabelClassName}
              value={displayValue}
              suffix={suffix}
              valueClassName={statCardValueClassName}
            />
          </div>

          <LineChart
            aspectRatio="2.5 / 1"
            className="w-full"
            data={chartData}
            margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <StatCardHoverBridge
              dataKey="value"
              formatLabel={formatStatCardWeekday}
              onHoverChange={setHover}
            />
            <Line
              curve={curveBasis}
              dataKey="value"
              showHighlight
              stroke={color}
              strokeWidth={2.5}
            />
          </LineChart>
        </StatCardChart>
      </CardContent>
    </Card>
  );
}
