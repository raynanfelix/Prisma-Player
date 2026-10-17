"use client";

/**
 * Gráficos da página Conversões & Jornada — Prisma Player.
 *
 * Reusa os primitivos composáveis de `@/components/ui/charts` (ecossistema
 * kokonutui/21st.dev sobre recharts): o mesmo ComposedChart da Retenção e o
 * mesmo donut de anéis (RingChart) aprovado pelo dono. A legenda do donut é
 * montada com a composição completa (LegendItem/LegendMarker/LegendLabel/
 * LegendValue/LegendProgress). Dados vêm do servidor (plays/cliques/
 * conversões reais por VSL).
 */

import { useState } from "react";
import {
  CHART_SERIES_COLORS,
  ComposedChart,
  Grid,
  Legend,
  LegendItem,
  LegendLabel,
  LegendMarker,
  LegendProgress,
  LegendValue,
  Line,
  Ring,
  RingChart,
  RingCenter,
  SeriesBar,
  type RingData,
} from "@/components/ui/charts";

export interface ConversionRow {
  videoId: string;
  title: string;
  plays: number;
  clicks: number;
  conversions: number;
  rate: number;
}

const MAX_ROWS = 10;

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Desempenho por VSL: barras (plays e cliques) + linha de conversão (%). */
export function ConversionsPerformanceChart({ rows }: { rows: ConversionRow[] }) {
  const data = rows.slice(0, MAX_ROWS).map((row) => ({
    title: row.title,
    plays: row.plays,
    cliques: row.clicks,
    taxa: Number(row.rate.toFixed(2)),
  }));

  return (
    <div className="w-full" aria-hidden="true">
      <ComposedChart
        data={data}
        xDataKey="title"
        aspectRatio="3 / 2"
        maxBarSize={30}
        xTickFormatter={(value) => truncate(String(value), 14)}
        rightAxis={{ domain: [0, 100], tickFormatter: (value: number) => `${value}%` }}
        valueFormatter={(value, name) =>
          name === "Conversão"
            ? `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
            : value.toLocaleString("pt-BR")
        }
      >
        <Grid horizontal />
        <SeriesBar dataKey="plays" name="Plays" color={CHART_SERIES_COLORS[0]} />
        <SeriesBar dataKey="cliques" name="Cliques na CTA" color={CHART_SERIES_COLORS[1]} />
        <Line dataKey="taxa" name="Conversão" color={CHART_SERIES_COLORS[2]} strokeWidth={2.5} yAxisId="right" />
      </ComposedChart>
    </div>
  );
}

/** Donut de CTA: cliques e compras como fatia do total de plays. */
export function ConversionsDonut({ plays, clicks, conversions }: { plays: number; clicks: number; conversions: number }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const totalPlays = Math.max(plays, 1);
  const data: RingData[] = [
    { label: "Cliques na CTA", value: clicks, maxValue: totalPlays },
    { label: "Compras atribuídas", value: conversions, maxValue: totalPlays },
  ];

  return (
    <div className="flex flex-col items-center gap-4 xl:flex-row xl:justify-center">
      <div aria-hidden="true">
        <RingChart
          data={data}
          size={170}
          strokeWidth={12}
          baseInnerRadius={46}
          hoveredIndex={hoveredIndex}
          onHoverChange={setHoveredIndex}
        >
          {data.map((item, index) => (
            <Ring key={item.label} index={index} />
          ))}
          <RingCenter defaultLabel="Interações" />
        </RingChart>
      </div>
      {/* Composição manual da legenda (API completa do RingChart) */}
      <Legend
        hoveredIndex={hoveredIndex}
        onHoverChange={setHoveredIndex}
        className="w-full text-xs font-semibold"
      >
        {data.map((item, index) => (
          <LegendItem key={item.label} index={index}>
            <LegendMarker color={item.color ?? CHART_SERIES_COLORS[index]} />
            <LegendLabel>{item.label}</LegendLabel>
            <LegendValue value={item.value} showPercentage total={item.maxValue} />
            <LegendProgress value={item.value} total={item.maxValue} color={CHART_SERIES_COLORS[index]} />
          </LegendItem>
        ))}
      </Legend>
    </div>
  );
}
