"use client";

import type { ChoroplethFeature } from "@/components/charts";
import {
  ChartStatFlow,
  ChoroplethChart,
  ChoroplethFeatureComponent,
  ChoroplethTooltip,
} from "@/components/charts";
import { useState, useMemo } from "react";
import { useWorldDataStandalone } from "@/lib/use-world-data";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getVisitorColor as staticGetVisitorColor,
  getVisitorValue as staticGetVisitorValue,
  visitorStats as staticVisitorStats,
} from "../data/visitors";
import {
  StatCardChart,
  type StatCardHoverState,
  statCardLabelClassName,
  statCardValueClassName,
} from "./stat-card-chart";
import { StatCardChoroplethHoverBridge } from "./stat-card-choropleth-hover-bridge";
import { TrendBadge } from "./trend-badge";

const isoToEnglishName: Record<string, string> = {
  BR: "Brazil",
  US: "United States",
  DE: "Germany",
  FR: "France",
  GB: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  NL: "Netherlands",
  IN: "India",
  JP: "Japan",
  ES: "Spain",
  IT: "Italy",
  MX: "Mexico",
  PL: "Poland",
  SE: "Sweden",
  BE: "Belgium",
  CH: "Switzerland",
  AT: "Austria",
  NO: "Norway",
  DK: "Denmark",
  IE: "Ireland",
  PT: "Portugal",
  NZ: "New Zealand",
  FI: "Finland",
  ZA: "South Africa",
  AR: "Argentina",
  ID: "Indonesia",
  PH: "Philippines",
  TH: "Thailand",
  VN: "Vietnam",
  CN: "China",
  RU: "Russia",
  CL: "Chile",
  CO: "Colombia",
  UY: "Uruguay",
  PY: "Paraguay",
  PE: "Peru",
  VE: "Venezuela",
  EC: "Ecuador",
  BO: "Bolivia"
};

export interface StatCardChoroplethProps {
  title?: string;
  liveCountries?: { name: string; impressions: number }[];
  totalLive?: number;
  trend?: number;
}

export function StatCardChoropleth({
  title = "Visitantes por País",
  liveCountries,
  totalLive,
  trend = 4.2,
}: StatCardChoroplethProps) {
  const { worldData, isLoading } = useWorldDataStandalone();
  const [hover, setHover] = useState<StatCardHoverState>({
    value: null,
    label: null,
    trend: null,
  });

  // Calculate real visitors per country name
  const realCountriesMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!liveCountries) return map;

    liveCountries.forEach((c) => {
      const code = c.name.trim().toUpperCase();
      const englishName = isoToEnglishName[code] || c.name;
      map.set(englishName, (map.get(englishName) ?? 0) + c.impressions);
    });
    return map;
  }, [liveCountries]);

  const maxRealValue = useMemo(() => {
    const values = [...realCountriesMap.values()];
    return values.length ? Math.max(...values, 1) : 1;
  }, [realCountriesMap]);

  const isDynamic = liveCountries !== undefined;
  const displayValue = hover.value ?? (isDynamic ? (totalLive ?? 0) : staticVisitorStats.total);
  const displayLabel = hover.label ?? (isDynamic ? "Visualizadores" : "Total");
  const displayTrend = hover.trend ?? (isDynamic ? trend : staticVisitorStats.trend);

  // Dynamic getters
  const getFeatureValue = (feature: ChoroplethFeature): number | undefined => {
    const name = feature.properties?.name as string;
    if (isDynamic) {
      return realCountriesMap.get(name);
    }
    return staticGetVisitorValue(feature);
  };

  /**
   * Escala sequencial de 5 níveis nas CSS vars `--choropleth-*`, que já trazem
   * valores próprios para claro e escuro — a cor acompanha o tema sem precisar
   * ler o tema em JS. Países sem dados usam o tom neutro `empty`, e não o
   * primeiro nível, para não parecerem tráfego baixo.
   */
  const getFeatureColor = (feature: ChoroplethFeature): string => {
    const name = feature.properties?.name as string;
    if (isDynamic) {
      const val = realCountriesMap.get(name);
      if (!val) return "var(--choropleth-empty)";

      const ratio = val / maxRealValue;
      if (ratio >= 0.8) return "var(--choropleth-05)";
      if (ratio >= 0.5) return "var(--choropleth-04)";
      if (ratio >= 0.3) return "var(--choropleth-03)";
      if (ratio >= 0.1) return "var(--choropleth-02)";
      return "var(--choropleth-01)";
    }
    return staticGetVisitorColor(feature);
  };

  return (
    <Card className="relative w-full gap-0 overflow-hidden py-0 border-[#e0e0e0] dark:border-white/5 bg-white dark:bg-card shadow-sm rounded-[22px]">
      <CardHeader className="pointer-events-none absolute inset-x-0 top-0 z-10 grid auto-rows-min grid-cols-[1fr_auto] items-start gap-1 border-0 bg-gradient-to-b from-45% from-white dark:from-[#1d1d1f] to-transparent px-5 py-4 pb-10 shadow-none ring-0">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="text-[15px] font-semibold text-slate-800 dark:text-white">{title}</CardTitle>
          <ChartStatFlow
            label={displayLabel}
            labelClassName={statCardLabelClassName}
            value={displayValue}
            valueClassName={statCardValueClassName}
          />
        </div>
        <CardAction>
          <TrendBadge value={displayTrend} />
        </CardAction>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading || !worldData ? (
          <StatCardChart className="mx-0 mb-0 min-h-[420px]" size="lg">
            <div className="flex h-full min-h-[420px] items-center justify-center text-muted-foreground text-xs font-sans">
              Carregando mapa interativo...
            </div>
          </StatCardChart>
        ) : (
          <StatCardChart className="mx-0 mb-0 min-h-[420px]" size="lg">
            <ChoroplethChart
              aspectRatio="2.5 / 1"
              className="min-h-[420px] w-full"
              data={worldData}
            >
              <StatCardChoroplethHoverBridge onHoverChange={setHover} />
              <ChoroplethFeatureComponent
                getFeatureColor={getFeatureColor}
                stroke="var(--choropleth-stroke)"
                strokeWidth={0.5}
              />
              <ChoroplethTooltip
                getFeatureValue={getFeatureValue}
                valueLabel="Acessos"
              />
            </ChoroplethChart>
          </StatCardChart>
        )}
      </CardContent>
    </Card>
  );
}
