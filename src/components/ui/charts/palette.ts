/**
 * Paleta categórica única para os primitivos de gráfico (`ui/charts`).
 *
 * Fonte única em vez de hex espalhado por componente: o primeiro tom é o token
 * oficial `--chart-1` (verde-lima da Prisma, que inverte para branco no tema
 * escuro); os demais são os tons de série já consagrados no data-viz do app
 * (azul `#0066cc`, roxo `#a855f7`, verde `#10b981`, âmbar `#f59e0b`, rosa
 * `#ec4899`). Cores de estado (vermelho = perigo) NÃO entram aqui.
 */
export const CHART_SERIES_COLORS = [
  "var(--chart-1)",
  "#0066cc",
  "#a855f7",
  "#10b981",
  "#f59e0b",
  "#ec4899",
] as const;

export function seriesColor(index: number): string {
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length];
}

/** Formatação numérica padrão dos gráficos (pt-BR). */
export function formatChartNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}
