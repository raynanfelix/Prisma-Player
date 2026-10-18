"use client";

import { BarChart3, Crown, Globe2, TrendingUp } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { BackButton, HeaderCard, HowItWorksCard, PlanRequiredNotice } from "./FeatureAppDetails";
import type { FeatureScreenProps } from "./store-data";
import type { BenchmarkData } from "@/lib/intelligence/benchmark";

function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function MetricTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border p-4 themeable-border-hairline">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-2xl font-bold tabular-nums themeable-text-ink">{value}</strong>
      <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>
    </div>
  );
}

/**
 * "Benchmarks" no Marketplace: informativo, sem config de VSL — mostra o
 * benchmark privado da conta (média + melhor VSL, últimos 30 dias) e o estado
 * honesto do benchmark global.
 */
export default function BenchmarksScreen({ app, capabilities, benchmarkData, onBack }: FeatureScreenProps & { benchmarkData: BenchmarkData }) {
  const allowed = capabilities.private_benchmark !== false;

  return (
    <div className="space-y-5">
      <BackButton onBack={onBack} />
      <HeaderCard app={app} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2">
              <BarChart3 className="size-4 text-muted-foreground" aria-hidden /> Benchmark privado
            </span>
            <span className="rounded-full bg-[#B9FF66] px-2.5 py-0.5 text-xs font-bold text-[#191A23]">
              {benchmarkData.videoCount} VSL{benchmarkData.videoCount === 1 ? "" : "s"}
            </span>
          </CardTitle>
          <CardDescription>Média da sua operação nos últimos 30 dias, comparada com a sua melhor VSL.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!allowed && <PlanRequiredNotice />}

          {allowed && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricTile label="Play rate" value={formatPercent(benchmarkData.average.playRate)} hint="Plays ÷ visualizações" />
                <MetricTile label="Retenção final" value={formatPercent(benchmarkData.average.completion)} hint="Conclusões ÷ plays" />
                <MetricTile label="Conversão" value={formatPercent(benchmarkData.average.conversion)} hint="Conversões ÷ plays" />
              </div>

              {benchmarkData.leader ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#B9FF66]/50 bg-[#B9FF66]/10 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#B9FF66] text-[#191A23]">
                      <Crown className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold themeable-text-ink">{benchmarkData.leader.title}</p>
                      <p className="text-[11px] text-muted-foreground">Melhor VSL da operação (mínimo de 10 plays)</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-[#191A23] dark:text-[#B9FF66]">
                    <span className="rounded-full bg-white px-2.5 py-1 tabular-nums dark:bg-card">Conversão {formatPercent(benchmarkData.leader.conversion)}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 tabular-nums dark:bg-card">Retenção {formatPercent(benchmarkData.leader.completion)}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 tabular-nums dark:bg-card">Play rate {formatPercent(benchmarkData.leader.playRate)}</span>
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground themeable-border-hairline">
                  Ainda não há VSLs com tráfego suficiente para eleger uma melhor — o pódio aparece com pelo menos 10 plays.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe2 className="size-4 text-muted-foreground" aria-hidden /> Benchmark global
          </CardTitle>
          <CardDescription>Média agregada e anônima entre todas as contas — nenhuma operação aparece individualmente.</CardDescription>
        </CardHeader>
        <CardContent>
          {allowed && benchmarkData.global.qualified ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricTile label="Play rate global" value={formatPercent(benchmarkData.global.playRate)} hint={`${benchmarkData.global.sampleVideos} VSLs na amostra`} />
              <MetricTile label="Retenção global" value={formatPercent(benchmarkData.global.completion)} hint={`${benchmarkData.global.samplePlays.toLocaleString("pt-BR")} plays recentes`} />
              <MetricTile label="Conversão global" value={formatPercent(benchmarkData.global.conversion)} hint="Base agregada e anônima" />
            </div>
          ) : (
            <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-4 text-xs leading-5 text-muted-foreground">
              <TrendingUp className="mt-0.5 size-4 shrink-0" aria-hidden />
              O benchmark global será liberado quando houver uma base comparável mais consistente. Enquanto isso, acompanhe o benchmark privado da sua própria operação acima.
            </p>
          )}
        </CardContent>
      </Card>

      <HowItWorksCard app={app} />
    </div>
  );
}
