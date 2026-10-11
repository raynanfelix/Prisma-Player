export type AnalyticsEventRow = {
  session_id: string;
  event_type: string;
  progress_percent: number;
  watched_seconds?: number;
  country_code?: string | null;
  device_type?: string | null;
  os_name?: string | null;
  browser_name?: string | null;
  traffic_source?: string | null;
  campaign_id?: string | null;
  creative_id?: string | null;
  ad_id?: string | null;
  risk_score?: number | null;
  created_at?: string;
};

export type DimensionRow = {
  name: string;
  impressions: number;
  plays: number;
  playRate: number;
  completes: number;
  completionRate: number;
};

export type AnalyticsSummary = {
  impressions: number;
  uniqueViews: number;
  plays: number;
  playRate: number;
  reached25: number;
  reached50: number;
  reached75: number;
  reached90: number;
  completed: number;
  completionRate: number;
  ctaClicks: number;
  conversions: number;
};

export function pct(value: number, total: number): number {
  return total ? Math.round((value / total) * 1000) / 10 : 0;
}

type Buckets = {
  byType: Map<string, Set<string>>;
  reachedAtLeast: Map<number, Set<string>>;
  suspicious: Set<string>;
};

const RETENTION_POINTS = [0, 10, 25, 50, 75, 90, 100] as const;

/**
 * Agrega eventos numa única passada.
 *
 * A implementação anterior varria o array inteiro uma vez por métrica (mais de
 * quinze varreduras) e, no agrupamento por dimensão, recriava o array do grupo a
 * cada linha (`[...(grupo ?? []), linha]`) — comportamento quadrático que, com
 * o teto de 50 mil eventos, dominava o tempo de resposta do endpoint mais caro
 * do sistema.
 */
function bucketize(rows: AnalyticsEventRow[]): Buckets {
  const byType = new Map<string, Set<string>>();
  const reachedAtLeast = new Map<number, Set<string>>();
  const suspicious = new Set<string>();
  for (const point of RETENTION_POINTS) reachedAtLeast.set(point, new Set());

  for (const row of rows) {
    const sessions = byType.get(row.event_type) ?? new Set<string>();
    sessions.add(row.session_id);
    byType.set(row.event_type, sessions);

    if (row.event_type === "complete") {
      for (const point of RETENTION_POINTS) reachedAtLeast.get(point)!.add(row.session_id);
    } else if (row.event_type === "progress") {
      for (const point of RETENTION_POINTS) {
        if (row.progress_percent >= point) reachedAtLeast.get(point)!.add(row.session_id);
      }
    }

    if (Number(row.risk_score ?? 0) >= 50) suspicious.add(row.session_id);
  }

  return { byType, reachedAtLeast, suspicious };
}

export function summarizeEvents(rows: AnalyticsEventRow[]) {
  const { byType, reachedAtLeast, suspicious } = bucketize(rows);
  const count = (type: string) => byType.get(type)?.size ?? 0;
  const reached = (point: number) => reachedAtLeast.get(point)?.size ?? 0;

  const impressions = count("impression");
  const plays = count("play");
  const completed = count("complete");

  const summary: AnalyticsSummary = {
    impressions,
    uniqueViews: impressions,
    plays,
    playRate: pct(plays, impressions),
    reached25: reached(25),
    reached50: reached(50),
    reached75: reached(75),
    reached90: reached(90),
    completed,
    completionRate: pct(completed, plays),
    ctaClicks: count("cta_click"),
    conversions: count("conversion"),
  };

  const retention = RETENTION_POINTS.map((point) => {
    const viewers = point === 0 ? plays : point === 100 ? completed : reached(point);
    return { point, rate: pct(viewers, plays), viewers };
  });

  /** Agrupa por uma coluna categórica numa passada, com Sets em vez de cópias de array. */
  const dimension = (key: keyof AnalyticsEventRow, limit = 30): DimensionRow[] => {
    const groups = new Map<string, { impressions: Set<string>; plays: Set<string>; completes: Set<string> }>();
    for (const row of rows) {
      const name = String(row[key] || "Não informado").slice(0, 120);
      let group = groups.get(name);
      if (!group) {
        group = { impressions: new Set(), plays: new Set(), completes: new Set() };
        groups.set(name, group);
      }
      if (row.event_type === "impression") group.impressions.add(row.session_id);
      else if (row.event_type === "play") group.plays.add(row.session_id);
      else if (row.event_type === "complete") group.completes.add(row.session_id);
    }
    return [...groups.entries()]
      .map(([name, group]) => ({
        name,
        impressions: group.impressions.size,
        plays: group.plays.size,
        playRate: pct(group.plays.size, group.impressions.size),
        completes: group.completes.size,
        completionRate: pct(group.completes.size, group.plays.size),
      }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, limit);
  };

  return { summary, retention, dimension, suspiciousSessions: suspicious.size };
}

/** Série temporal em buckets de tamanho fixo, numa passada sobre os eventos. */
export function buildTimeline(rows: AnalyticsEventRow[], sinceMs: number, rangeDays: number) {
  const bucketDays = Math.max(1, Math.ceil(rangeDays / 30));
  const bucketMs = bucketDays * 86400000;
  const bucketCount = Math.max(1, Math.ceil(rangeDays / bucketDays));
  const buckets = Array.from({ length: bucketCount }, () => ({
    impressions: new Set<string>(),
    plays: new Set<string>(),
    completes: new Set<string>(),
    conversions: new Set<string>(),
  }));

  for (const row of rows) {
    if (!row.created_at) continue;
    const index = Math.floor((new Date(row.created_at).getTime() - sinceMs) / bucketMs);
    if (index < 0 || index >= bucketCount) continue;
    const bucket = buckets[index];
    if (row.event_type === "impression") bucket.impressions.add(row.session_id);
    else if (row.event_type === "play") bucket.plays.add(row.session_id);
    else if (row.event_type === "complete") bucket.completes.add(row.session_id);
    else if (row.event_type === "conversion") bucket.conversions.add(row.session_id);
  }

  const formatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  return buckets.map((bucket, index) => {
    const start = sinceMs + index * bucketMs;
    return {
      date: new Date(start).toISOString(),
      label: formatter.format(new Date(start)),
      impressions: bucket.impressions.size,
      plays: bucket.plays.size,
      completes: bucket.completes.size,
      conversions: bucket.conversions.size,
    };
  });
}
