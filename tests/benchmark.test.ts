import { describe, expect, it } from "vitest";

import { shapeAccountBenchmark, type VideoMetricRow } from "@/lib/intelligence/benchmark";

function row(partial: Partial<VideoMetricRow> & Pick<VideoMetricRow, "id" | "title">): VideoMetricRow {
  return { impressions: 0, plays: 0, completes: 0, conversions: 0, ...partial };
}

/** shapeAccountBenchmark - benchmark privado da conta (Benchmark do Marketplace). */
describe("shapeAccountBenchmark", () => {
  it("sem VSLs: líder nulo, médias zeradas e global não qualificado", () => {
    const data = shapeAccountBenchmark([]);
    expect(data.leader).toBeNull();
    expect(data.average).toEqual({ completion: 0, conversion: 0, playRate: 0 });
    expect(data.videoCount).toBe(0);
    expect(data.global.qualified).toBe(false);
  });

  it("média é ponderada pelos totais da conta, não pela média das VSLs", () => {
    const data = shapeAccountBenchmark([
      row({ id: "a", title: "A", impressions: 100, plays: 50, completes: 10, conversions: 5 }),
      row({ id: "b", title: "B", impressions: 100, plays: 50, completes: 30, conversions: 1 }),
    ]);
    // Pooled: 100 plays / 200 impressões = 50% play rate - e não a média (50%+50%)/2 por VSL.
    expect(data.average.playRate).toBe(50);
    expect(data.average.completion).toBe(40); // 40 completes / 100 plays
    expect(data.average.conversion).toBe(6); // 6 conversions / 100 plays
  });

  it("líder exige base mínima de plays e vence por conversão (empate: retenção)", () => {
    const data = shapeAccountBenchmark([
      // 1 play, 100% de conversão - fora do pódio por amostra mínima.
      row({ id: "tiny", title: "Tiny", impressions: 1, plays: 1, completes: 1, conversions: 1 }),
      row({ id: "retained", title: "Retained", impressions: 100, plays: 50, completes: 40, conversions: 3 }),
      row({ id: "seller", title: "Seller", impressions: 100, plays: 50, completes: 20, conversions: 3 }),
    ]);
    expect(data.leader?.title).toBe("Retained");
    expect(data.leader?.conversion).toBe(6);
  });

  it("videoCount retrata a carteira inteira, inclusive VSLs sem tráfego na janela", () => {
    const data = shapeAccountBenchmark([
      row({ id: "a", title: "A", impressions: 10, plays: 5, completes: 1, conversions: 0 }),
      row({ id: "b", title: "B", impressions: 0, plays: 0, completes: 0, conversions: 0 }),
    ]);
    expect(data.videoCount).toBe(2);
  });
});
