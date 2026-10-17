/**
 * Primitivos de gráfico composáveis da Prisma Player (`ui/charts`).
 *
 * Ecossistema kokonutui/21st.dev (shadcn-style) reconstruído sobre recharts,
 * adaptado aos tokens do design system. Ver cabeçalho de cada arquivo para
 * origem, licença (MIT) e data da consulta (2026-10-17).
 */

export { PieChart, PieSlice, PieCenter, type PieDataItem } from "./pie-chart";
export {
  ComposedChart,
  Grid,
  Area,
  SeriesBar,
  Line,
} from "./composed-chart";
export {
  RadarChart,
  RadarGrid,
  RadarAxis,
  RadarLabels,
  RadarArea,
} from "./radar-chart";
export {
  RingChart,
  Ring,
  RingCenter,
  type RingData,
} from "./ring-chart";
export {
  Legend,
  LegendItem,
  LegendMarker,
  LegendLabel,
  LegendValue,
  LegendProgress,
} from "./ring-legend";
export { CHART_SERIES_COLORS } from "./palette";
