"use client";

/**
 * RadarChart composável sobre recharts - Prisma Player.
 *
 * Base: padrão composável do ecossistema kokonutui/21st.dev (shadcn-style),
 * reconstruído sobre recharts (sem libs novas) e adaptado aos tokens da
 * Prisma. Tamanho fixo (`size`, padrão 250) com SVG responsivo.
 *
 * API aprovada pelo dono:
 *   RadarChart(data, metrics, size=250) + RadarGrid + RadarAxis + RadarLabels
 *   + RadarArea(index)
 *
 * Modelagem: cada registro de `data` é um raio do radar (`label` = spoke) e
 * `metrics` são as séries (chave de valor + nome). Para "Fontes de Tráfego",
 * as fontes de `dimensions.traffic` são os raios (`label`) e a série única é
 * o volume de impressões.
 *
 * Origem/licença: MIT (ecossistema kokonutui); consulta em 2026-10-17.
 */

import React, { createContext, useContext } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar as RechartsRadar,
  RadarChart as RechartsRadarChart,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { seriesColor } from "./palette";

export interface RadarMetric {
  /** Campo numérico presente em cada registro de `data`. */
  key: string;
  /** Nome exibido em tooltip/legenda. */
  label: string;
}

export type RadarDatum = { label: string } & Record<string, unknown>;

interface RadarChartContextValue {
  metrics: RadarMetric[];
  angleKey: string;
}

const RadarChartContext = createContext<RadarChartContextValue | null>(null);

function useRadarChartContext() {
  const context = useContext(RadarChartContext);
  if (!context) {
    throw new Error("Radar components must be wrapped in a <RadarChart />");
  }
  return context;
}

export function RadarChart({
  data,
  metrics,
  size = 250,
  angleKey = "label",
  className,
  children,
}: {
  data: RadarDatum[];
  metrics: RadarMetric[];
  size?: number;
  angleKey?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <RadarChartContext.Provider value={{ metrics, angleKey }}>
      <div className={cn("select-none", className)} style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsRadarChart data={data} margin={{ top: 24, right: 28, bottom: 24, left: 28 }}>
            {children}
          </RechartsRadarChart>
        </ResponsiveContainer>
      </div>
    </RadarChartContext.Provider>
  );
}

export function RadarGrid() {
  return <PolarGrid stroke="currentColor" className="text-black/[0.08] dark:text-white/[0.12]" />;
}

export interface RadarAxisProps {
  tickCount?: number;
  domain?: [number | "auto", number | "auto"];
}

/** Eixo radial (escala de valores), discreto e sem rótulos. */
export function RadarAxis({ tickCount = 4, domain = ["auto", "auto"] }: RadarAxisProps) {
  return (
    <PolarRadiusAxis angle={90} domain={domain} tickCount={tickCount} tick={false} axisLine={false} />
  );
}

type RadarTickProps = {
  x?: number;
  y?: number;
  payload?: { value?: unknown };
  textAnchor?: "start" | "middle" | "end" | "inherit";
};

function RadarTickLabel({ x, y, payload, textAnchor }: RadarTickProps) {
  const raw = payload?.value;
  const text = typeof raw === "string" ? raw : String(raw ?? "");
  const truncated = text.length > 14 ? `${text.slice(0, 13)}…` : text;
  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor ?? "middle"}
      dominantBaseline="middle"
      className="fill-[#7a7a7a] text-[10px] font-semibold dark:fill-[#cccccc]"
    >
      {truncated}
    </text>
  );
}

/** Rótulos dos raios (nomes das fontes ao redor do radar). */
export function RadarLabels() {
  const { angleKey } = useRadarChartContext();
  return (
    <PolarAngleAxis
      dataKey={angleKey}
      tick={<RadarTickLabel />}
      tickLine={false}
      axisLine={false}
    />
  );
}

export interface RadarAreaProps {
  index: number;
  color?: string;
  fillOpacity?: number;
}

export function RadarArea({ index, color, fillOpacity = 0.22 }: RadarAreaProps) {
  const { metrics } = useRadarChartContext();
  const metric = metrics[index];
  if (!metric) return null;

  const stroke = color ?? seriesColor(index);
  return (
    <RechartsRadar
      dataKey={metric.key}
      name={metric.label}
      stroke={stroke}
      strokeWidth={2}
      fill={stroke}
      fillOpacity={fillOpacity}
      dot={{ r: 3, strokeWidth: 1.5, fill: stroke, stroke: "#fff" }}
    />
  );
}
