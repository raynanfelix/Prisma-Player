import { describe, expect, it } from "vitest";
import { buildTimeline, pct, summarizeEvents, type AnalyticsEventRow } from "@/lib/analytics/summarize";

function event(partial: Partial<AnalyticsEventRow> & { session_id: string; event_type: string }): AnalyticsEventRow {
  return { progress_percent: 0, ...partial };
}

describe("summarizeEvents", () => {
  it("conta sessões únicas, não eventos", () => {
    const rows = [
      event({ session_id: "a", event_type: "impression" }),
      event({ session_id: "a", event_type: "impression" }),
      event({ session_id: "b", event_type: "impression" }),
      event({ session_id: "a", event_type: "play" }),
    ];
    const { summary } = summarizeEvents(rows);
    expect(summary.impressions).toBe(2);
    expect(summary.plays).toBe(1);
    expect(summary.playRate).toBe(50);
  });

  it("trata 'complete' como tendo alcançado todos os marcos anteriores", () => {
    const rows = [
      event({ session_id: "a", event_type: "play" }),
      event({ session_id: "a", event_type: "complete", progress_percent: 100 }),
    ];
    const { summary } = summarizeEvents(rows);
    expect(summary.reached25).toBe(1);
    expect(summary.reached75).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.completionRate).toBe(100);
  });

  it("acumula progresso a partir do marco mais alto atingido", () => {
    const rows = [
      event({ session_id: "a", event_type: "play" }),
      event({ session_id: "a", event_type: "progress", progress_percent: 50 }),
    ];
    const { summary } = summarizeEvents(rows);
    expect(summary.reached25).toBe(1);
    expect(summary.reached50).toBe(1);
    expect(summary.reached75).toBe(0);
  });

  it("agrupa dimensões sem perder sessões", () => {
    const rows = [
      event({ session_id: "a", event_type: "impression", country_code: "BR" }),
      event({ session_id: "a", event_type: "play", country_code: "BR" }),
      event({ session_id: "b", event_type: "impression", country_code: "PT" }),
    ];
    const countries = summarizeEvents(rows).dimension("country_code");
    expect(countries).toEqual([
      { name: "BR", impressions: 1, plays: 1, playRate: 100, completes: 0, completionRate: 0 },
      { name: "PT", impressions: 1, plays: 0, playRate: 0, completes: 0, completionRate: 0 },
    ]);
  });

  it("marca sessões suspeitas pelo risk_score", () => {
    const rows = [
      event({ session_id: "a", event_type: "play", risk_score: 75 }),
      event({ session_id: "b", event_type: "play", risk_score: 10 }),
    ];
    expect(summarizeEvents(rows).suspiciousSessions).toBe(1);
  });

  it("não divide por zero em conjunto vazio", () => {
    const { summary, retention } = summarizeEvents([]);
    expect(summary.playRate).toBe(0);
    expect(summary.completionRate).toBe(0);
    expect(retention.every((point) => point.rate === 0)).toBe(true);
  });

  // A implementação anterior recriava o array do grupo a cada linha, o que era
  // quadrático e dominava o tempo de resposta com o teto de 50 mil eventos.
  it("processa 50 mil eventos em tempo linear", () => {
    const rows = Array.from({ length: 50_000 }, (_, index) => event({
      session_id: `s${index % 5000}`,
      event_type: index % 3 === 0 ? "impression" : index % 3 === 1 ? "play" : "progress",
      progress_percent: 50,
      country_code: `C${index % 40}`,
    }));
    const started = Date.now();
    const result = summarizeEvents(rows);
    result.dimension("country_code");
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.summary.impressions).toBeGreaterThan(0);
  });
});

describe("buildTimeline", () => {
  it("distribui eventos nos buckets corretos e ignora fora do intervalo", () => {
    const since = Date.parse("2026-07-01T00:00:00.000Z");
    const rows = [
      event({ session_id: "a", event_type: "play", created_at: "2026-07-01T10:00:00.000Z" }),
      event({ session_id: "b", event_type: "play", created_at: "2026-07-02T10:00:00.000Z" }),
      event({ session_id: "c", event_type: "play", created_at: "2026-06-20T10:00:00.000Z" }),
    ];
    const timeline = buildTimeline(rows, since, 3);
    expect(timeline).toHaveLength(3);
    expect(timeline[0].plays).toBe(1);
    expect(timeline[1].plays).toBe(1);
    expect(timeline[2].plays).toBe(0);
  });
});

describe("pct", () => {
  it("arredonda para uma casa decimal e protege divisão por zero", () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(5, 0)).toBe(0);
  });
});
