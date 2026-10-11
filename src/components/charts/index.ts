export { LineChart } from "./line-chart";
export { Line } from "./line";
// Subcomponentes do LineChart (visx). Os nomes levam o prefixo `Line` porque
// `Grid`/`XAxis`/`ChartTooltip` já estão ocupados pelos equivalentes do
// AreaChart, que roda em Recharts e usa outro contexto — misturar os dois quebra.
export { Grid as LineGrid } from "./grid";
export { XAxis as LineXAxis } from "./x-axis";
export { ChartTooltip as LineChartTooltip } from "./tooltip";
export { ChartStatFlow } from "./chart-stat-flow";
export { useChart } from "./chart-context";

// Custom charts added for Prisma Player
export { FunnelChart, type FunnelStage, type FunnelGradientStop, type FunnelChartProps } from "./funnel-chart";
export { RingChart, Ring, RingCenter, Legend as RingLegend, type RingData } from "./ring-chart";
export { AreaChart, Area, Grid, XAxis as AreaXAxis, ChartTooltip as AreaChartTooltip } from "./area-chart";

// Choropleth chart exports
export * from "./choropleth";

// Heatmap chart exports (registry @bklit/heatmap-chart)
export * from "./heatmap";
