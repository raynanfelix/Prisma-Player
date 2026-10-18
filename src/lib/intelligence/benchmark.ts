import "server-only";

import { and, gte, inArray, sql } from "drizzle-orm";

import { pct } from "@/lib/analytics/summarize";
import { db, schema } from "@/lib/db";

const { videoEvents } = schema;

/**
 * Benchmark privado da conta, computado no Postgres (mesma filosofia das
 * rotas de analytics: agregação `count(distinct session_id) filter (...)`
 * sobre o índice (video_id, created_at) — nenhum evento cruza a rede).
 *
 * O benchmark GLOBAL agregado entre contas não tem job de agregação hoje:
 * computá-lo na hora seria um full-scan de `video_events` no carregamento da
 * página. O contrato mantém o estado honesto `qualified: false` — a tela
 * mostra o benchmark privado e explica quando o global entra.
 */

/** Janela padrão do benchmark privado (mesmo recorte do relatório semanal). */
const DEFAULT_WINDOW_DAYS = 30;
/** Base mínima para uma VSL concorrer a "melhor" (evita 1 play = 100%). */
const LEADER_MIN_PLAYS = 10;
/** Eventos com risco alto inflam play rate sem serem público real. */
const MAX_RISK_SCORE = 70;

export type BenchmarkGlobal = {
  qualified: boolean;
  sampleVideos: number;
  samplePlays: number;
  playRate: number;
  completion: number;
  conversion: number;
};

export type BenchmarkData = {
  leader: { title: string; completion: number; conversion: number; playRate: number } | null;
  average: { completion: number; conversion: number; playRate: number };
  videoCount: number;
  global: BenchmarkGlobal;
};

export type BenchmarkVideoOption = { id: string; title: string };

/** Linha agregada por VSL — mesma forma que a query SQL devolve. */
export type VideoMetricRow = BenchmarkVideoOption & {
  impressions: number;
  plays: number;
  completes: number;
  conversions: number;
};

const NOT_QUALIFIED_GLOBAL: BenchmarkGlobal = { qualified: false, sampleVideos: 0, samplePlays: 0, playRate: 0, completion: 0, conversion: 0 };

function ratesOf(row: Pick<VideoMetricRow, "impressions" | "plays" | "completes" | "conversions">) {
  return {
    playRate: pct(row.plays, row.impressions),
    completion: pct(row.completes, row.plays),
    conversion: pct(row.conversions, row.plays),
  };
}

/**
 * Pura (sem banco): transforma as linhas agregadas por VSL no contrato
 * BenchmarkData. Exportada para teste direto.
 */
export function shapeAccountBenchmark(rows: VideoMetricRow[]): BenchmarkData {
  const withPlays = rows.filter((row) => row.plays > 0);
  const totals = withPlays.reduce(
    (acc, row) => ({
      impressions: acc.impressions + row.impressions,
      plays: acc.plays + row.plays,
      completes: acc.completes + row.completes,
      conversions: acc.conversions + row.conversions,
    }),
    { impressions: 0, plays: 0, completes: 0, conversions: 0 },
  );
  const average = ratesOf(totals);

  const eligible = withPlays.filter((row) => row.plays >= LEADER_MIN_PLAYS);
  let leaderRow: VideoMetricRow | null = null;
  for (const row of eligible) {
    if (!leaderRow) {
      leaderRow = row;
      continue;
    }
    const rowRates = ratesOf(row);
    const bestRates = ratesOf(leaderRow);
    if (rowRates.conversion > bestRates.conversion || (rowRates.conversion === bestRates.conversion && rowRates.completion > bestRates.completion)) {
      leaderRow = row;
    }
  }

  return {
    leader: leaderRow ? { title: leaderRow.title, ...ratesOf(leaderRow) } : null,
    average,
    videoCount: rows.length,
    global: NOT_QUALIFIED_GLOBAL,
  };
}

/** Benchmark privado da conta sobre as VSLs prontas informadas. */
export async function loadAccountBenchmark(vsls: BenchmarkVideoOption[], windowDays = DEFAULT_WINDOW_DAYS): Promise<BenchmarkData> {
  if (!vsls.length) return shapeAccountBenchmark([]);
  const ids = vsls.map((vsl) => vsl.id);
  const titleById = new Map(vsls.map((vsl) => [vsl.id, vsl.title]));
  const boundedDays = Math.min(Math.max(windowDays, 1), 90);
  const since = new Date(Date.now() - boundedDays * 86_400_000);

  let rows: Array<{ videoId: string; impressions: number; plays: number; completes: number; conversions: number }> = [];
  try {
    rows = await db
      .select({
        videoId: videoEvents.videoId,
        impressions: sql<number>`(count(distinct ${videoEvents.sessionId}) filter (where ${videoEvents.eventType} = 'impression'))::int`,
        plays: sql<number>`(count(distinct ${videoEvents.sessionId}) filter (where ${videoEvents.eventType} = 'play'))::int`,
        completes: sql<number>`(count(distinct ${videoEvents.sessionId}) filter (where ${videoEvents.eventType} = 'complete'))::int`,
        conversions: sql<number>`(count(distinct ${videoEvents.sessionId}) filter (where ${videoEvents.eventType} = 'conversion'))::int`,
      })
      .from(videoEvents)
      .where(and(inArray(videoEvents.videoId, ids), gte(videoEvents.createdAt, since), sql`${videoEvents.riskScore} < ${MAX_RISK_SCORE}`))
      .groupBy(videoEvents.videoId);
  } catch {
    rows = [];
  }

  const metrics: VideoMetricRow[] = rows.map((row) => ({
    id: row.videoId,
    title: titleById.get(row.videoId) ?? "VSL",
    impressions: Number(row.impressions) || 0,
    plays: Number(row.plays) || 0,
    completes: Number(row.completes) || 0,
    conversions: Number(row.conversions) || 0,
  }));
  // VSLs prontas sem eventos na janela também contam no videoCount: a média
  // é ponderada pelo que de fato teve tráfego, mas o retrato inclui a carteira.
  const withTraffic = new Set(metrics.map((row) => row.id));
  for (const vsl of vsls) {
    if (!withTraffic.has(vsl.id)) metrics.push({ id: vsl.id, title: vsl.title, impressions: 0, plays: 0, completes: 0, conversions: 0 });
  }
  return shapeAccountBenchmark(metrics);
}
