"use client";

import { useState } from "react";
import { curveBasis } from "@visx/curve";
import {
  ChartStatFlow,
  Line,
  LineChart,
  LineChartTooltip,
  LineGrid,
  LineXAxis,
  Ring,
  RingCenter,
  RingChart,
  RingLegend,
  type RingData,
} from "@/components/charts";

const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface AdminRevenueChartProps {
  series: { date: string; value: number }[];
  totalCents: number;
  periodLabel?: string;
}

export function AdminRevenueChart({
  series,
  totalCents,
  periodLabel = "Últimos 30 dias",
}: AdminRevenueChartProps) {
  return (
    <div className="p-5">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="flex flex-col items-end text-right">
          <ChartStatFlow
            value={totalCents / 100}
            label={periodLabel}
            formatOptions={{
              style: "currency",
              currency: "BRL",
              maximumFractionDigits: 0,
            }}
            valueClassName="text-[24px] font-semibold tracking-[-.04em]"
            labelClassName="text-[11px]"
          />
        </div>
      </div>
      <div className="relative h-[280px] w-full">
        <LineChart
          data={series}
          xDataKey="date"
          margin={{ top: 10, right: 12, bottom: 24, left: 12 }}
          className="h-full w-full"
        >
          <LineGrid horizontal numTicksRows={4} />
          <Line
            curve={curveBasis}
            dataKey="value"
            stroke="var(--chart-1)"
            strokeWidth={2.5}
          />
          <LineXAxis
            numTicks={6}
            formatTick={(date) =>
              date.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
              })
            }
          />
          <LineChartTooltip
            showDatePill
            rows={(point) => [
              {
                color: "var(--chart-1)",
                label: "Receita",
                value: money(Math.round((point.value as number) * 100)),
              },
            ]}
          />
        </LineChart>
      </div>
    </div>
  );
}

export interface AdminCheckoutRingProps {
  data: RingData[];
}

export function AdminCheckoutRing({ data }: AdminCheckoutRingProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  return (
    <div className="flex flex-col items-center gap-6 p-5 xl:flex-row xl:justify-center">
      <RingChart
        data={data}
        size={200}
        hoveredIndex={hoveredIndex}
        onHoverChange={setHoveredIndex}
      >
        {data.map((item, index) => (
          <Ring key={item.label} index={index} />
        ))}
        <RingCenter
          defaultLabel="Checkouts"
          formatValue={(value) => value.toLocaleString("pt-BR")}
        />
      </RingChart>
      <RingLegend
        data={data}
        hoveredIndex={hoveredIndex}
        onHoverChange={setHoveredIndex}
        className="w-full xl:w-auto text-xs font-semibold"
      />
    </div>
  );
}
