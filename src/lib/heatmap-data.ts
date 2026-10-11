import type { HeatmapBin, HeatmapColumn } from "@/components/charts";

/**
 * Converte uma série diária (a timeline do analytics) nas colunas semanais que o
 * HeatmapChart espera, preenchendo com zero os dias sem dado para a grade não
 * ficar furada.
 *
 * Fica fora de `components/charts` de propósito: aquele diretório é gerado pelo
 * registry do shadcn e um `shadcn add` futuro sobrescreve o que estiver lá.
 */
export function buildHeatmapColumns(
  points: { date: string; value: number }[],
  weekStartDay = 0,
): HeatmapColumn[] {
  if (!points.length) return [];

  const byDay = new Map<string, number>();
  for (const point of points) {
    const key = point.date.slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + point.value);
  }

  const dates = [...byDay.keys()].sort();
  const firstKey = dates[0];
  const lastKey = dates.at(-1);
  if (!(firstKey && lastKey)) return [];

  const last = new Date(`${lastKey}T00:00:00`);

  // Recua até o início da semana para a primeira coluna ficar completa.
  const cursor = new Date(`${firstKey}T00:00:00`);
  cursor.setDate(cursor.getDate() - ((cursor.getDay() - weekStartDay + 7) % 7));

  const columns: HeatmapColumn[] = [];
  let columnIndex = 0;

  while (cursor <= last) {
    const bins: HeatmapBin[] = [];
    for (let row = 0; row < 7; row++) {
      const date = new Date(cursor);
      date.setDate(date.getDate() + row);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      bins.push({ bin: row, count: byDay.get(key) ?? 0, date });
    }
    columns.push({ bin: columnIndex, bins });
    columnIndex += 1;
    cursor.setDate(cursor.getDate() + 7);
  }

  return columns;
}

/**
 * Escala de cor por quantil relativo ao pico da série. O
 * `getHeatmapContributionLevel` do bklit usa limiares absolutos (1, 2, 3, 4+),
 * calibrados para contagem de commits — com centenas de plays por dia todos os
 * dias cairiam no nível máximo e o mapa ficaria chapado.
 */
export function buildQuantileColorScale(
  columns: HeatmapColumn[],
  levelColors: readonly string[],
): (count: number | null | undefined) => string {
  let max = 0;
  for (const column of columns) {
    for (const bin of column.bins) {
      if (bin.count > max) max = bin.count;
    }
  }

  const empty = levelColors[0] ?? "var(--chart-scale-01)";

  return (count) => {
    if (!count || count <= 0 || max <= 0) return empty;
    const ratio = count / max;
    if (ratio > 0.75) return levelColors[4] ?? empty;
    if (ratio > 0.5) return levelColors[3] ?? empty;
    if (ratio > 0.25) return levelColors[2] ?? empty;
    return levelColors[1] ?? empty;
  };
}
