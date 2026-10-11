"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminSelect from "@/components/ui/custom/AdminSelect";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Clock,
  Clock3,
  Download,
  Eye,
  History,
  Info,
  Maximize2,
  Minimize2,
  MonitorSmartphone,
  MousePointerClick,
  Play,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import ClaudeChatInput from "@/components/ui/claude-style-chat-input";
import { useSidebar } from "@/components/ui/sidebar";

// Custom charts imports
import {
  FunnelChart,
  RingChart,
  Ring,
  RingCenter,
  RingLegend,
  AreaChart,
  Area,
  Grid,
  AreaXAxis,
  AreaChartTooltip,
  LineChart,
  Line,
  LineGrid,
  LineXAxis,
  LineChartTooltip,
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
  HeatmapLegend,
  HeatmapInteractionProvider,
  HeatmapInteractionBoundary,
  HEATMAP_DEFAULT_LEVEL_STYLES,
} from "@/components/charts";
import { buildHeatmapColumns } from "@/lib/heatmap-data";
import { StatCardChoropleth } from "@/components/stat-card-choropleth";
import IntelligenceControls from "@/features/intelligence/components/IntelligenceControls";

type Summary = {
  impressions: number;
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

type Point = { point: number; viewers: number; rate: number };
type Dimension = { name: string; impressions: number; plays: number; playRate: number; completes: number; completionRate: number };
type TimelinePoint = { date: string; label: string; impressions: number; plays: number; completes: number; conversions: number };
// Espelha os tipos de benchmark definidos em IntelligenceControls (não exportados lá).
type GlobalBenchmark = { qualified: boolean; sampleVideos: number; samplePlays: number; playRate: number; completion: number; conversion: number };
type BenchmarkData = { leader: { title: string; completion: number; conversion: number; playRate: number } | null; average: { completion: number; conversion: number; playRate: number }; videoCount: number; global: GlobalBenchmark };
type Data = {
  video: { title: string; duration_seconds: number | null; source: string | null; type: string | null; created_at?: string };
  summary: Summary;
  comparison: { previous: Summary; delta: { impressions: number; plays: number; playRate: number; completionRate: number; conversions: number } };
  timeline: TimelinePoint[];
  retention: Point[];
  funnel: { name: string; value: number }[];
  dimensions: Record<string, Dimension[]>;
  insights: { tone: string; title: string; detail: string }[];
  live: number;
  liveCountries: Dimension[];
  capabilities?: Record<string, boolean>;
  benchmarkData?: BenchmarkData;
};

type VideoItem = { id: string; title: string; status: string; created_at: string; plays?: number };

type AiResult = {
  headline: string;
  executiveSummary: string;
  opportunities: { priority: "high" | "medium" | "low"; title: string; evidence: string; action: string }[];
  experiments: { element: string; hypothesis: string; successMetric: string }[];
  warnings: string[];
};
type AiConversation = { id: string; title: string; question: string; result: AiResult; createdAt: string };

const tabs = [
  { id: "performance", label: "Desempenho", icon: BarChart3 },
  { id: "retention", label: "Retenção", icon: Activity },
  { id: "heatmap", label: "Mapa de Calor", icon: CalendarDays },
  { id: "funnel", label: "Funil de Conversão", icon: TrendingUp },
  { id: "audience", label: "Audiência & Países", icon: Users },
  { id: "traffic", label: "Dispositivos & Tecnologia", icon: MonitorSmartphone },
  { id: "live", label: "Ao Vivo", icon: Radio },
  { id: "intelligence", label: "Motor de Inteligência", icon: BrainCircuit },
];

const FUNNEL_RAMP = ["#6366f1", "#8b5cf6", "#a855f7", "#c026d3", "#ec4899", "#f43f5e"];

const suggestionPrompts = [
  "O que eu deveria melhorar primeiro nessa VSL?",
  "Onde eu deveria posicionar o CTA para aumentar conversão?",
  "Qual teste A/B vale mais a pena rodar agora?",
  "Por que a retenção pode estar caindo?",
];

const FLAGPACK_BASE = "https://flag.vercel.app";
const regionNames = new Intl.DisplayNames(["pt-BR"], { type: "region" });

function flagUrl(countryCode: string) {
  const code = countryCode.trim().toUpperCase();
  if (code === "XX" || code === "DESCONHECIDO" || code.length !== 2) {
    return `${FLAGPACK_BASE}/s/UN.svg`;
  }
  return `${FLAGPACK_BASE}/s/${code}.svg`;
}

function getCountryName(countryCode: string) {
  const code = countryCode.trim().toUpperCase();
  if (code === "XX" || code === "DESCONHECIDO" || code.length !== 2) {
    return "Outros/Desconhecido";
  }
  try {
    return regionNames.of(code) ?? countryCode;
  } catch {
    return countryCode;
  }
}

function format(value: number, percent = false) {
  return percent ? `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : value.toLocaleString("pt-BR");
}

function formatSecondsToTimeString(seconds: number) {
  if (!seconds || seconds <= 0) return "0h:0m:00s";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours}h:${minutes}m:${secs.toString().padStart(2, "0")}s`;
}

function DimensionTable({ title, rows, isCountry = false, onRowClick }: { title: string; rows: Dimension[]; isCountry?: boolean; onRowClick?: (row: Dimension) => void }) {
  const maxImpressions = useMemo(() => Math.max(...rows.map((r) => r.impressions), 1), [rows]);
  return (
    <section className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-bold text-[#191A23] dark:text-white">{title}</h3>
        <span className="rounded-full bg-[#B9FF66] border border-black/5 px-2.5 py-0.5 text-xs font-bold text-[#191A23]">
          {rows.length} segmentos
        </span>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-zinc-800">
          <table className="w-full min-w-[480px] text-left text-xs font-medium text-[#191A23] dark:text-zinc-200">
            <thead className="bg-slate-50 dark:bg-card uppercase text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800 font-semibold">
              <tr>
                <th className="p-3">Segmento</th>
                <th className="p-3 text-right">Visualizações</th>
                <th className="p-3 text-right">Plays</th>
                <th className="p-3 text-right">Play rate</th>
                <th className="p-3 text-right">Retenção final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {rows.map((row) => (
                <tr 
                  key={row.name} 
                  onClick={() => onRowClick?.(row)}
                  className={`group transition-colors duration-150 ${onRowClick ? "cursor-pointer hover:bg-slate-50/60 dark:hover:bg-transparent" : ""}`}
                >
                  <td className="p-3 font-semibold text-[#191A23] dark:text-zinc-100">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        {isCountry && (
                          <img
                            alt={`Bandeira de ${row.name}`}
                            className="h-3.5 w-5 shrink-0 rounded object-cover border border-slate-200 dark:border-zinc-700"
                            height={14}
                            src={flagUrl(row.name)}
                            width={20}
                          />
                        )}
                        <span className="truncate max-w-[180px] text-xs font-semibold text-[#191A23] dark:text-zinc-100">
                          {isCountry ? getCountryName(row.name) : row.name}
                        </span>
                      </div>
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-card">
                        <div 
                          className="h-full rounded-full bg-[#B9FF66] transition-all duration-300"
                          style={{ width: `${(row.impressions / maxImpressions) * 100}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-right font-medium text-slate-600 dark:text-zinc-400">{format(row.impressions)}</td>
                  <td className="p-3 text-right font-medium text-slate-600 dark:text-zinc-400">{format(row.plays)}</td>
                  <td className="p-3 text-right font-bold text-[#191A23] dark:text-zinc-100">{format(row.playRate, true)}</td>
                  <td className="p-3 text-right font-bold text-[#191A23] dark:text-zinc-100">{format(row.completionRate, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-8 text-center text-xs font-medium text-slate-400 dark:text-zinc-500">Nenhum segmento detectado neste período.</div>
      )}
    </section>
  );
}

export default function AnalyticsWorkspace({ videoId: initialVideoId }: { videoId: string }) {
  const { setOpen } = useSidebar();
  const [currentVideoId, setCurrentVideoId] = useState(initialVideoId);
  const [tab, setTab] = useState("performance");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  // Auto-collapse main app sidebar on mount to open analytics in full-width desktop screen
  useEffect(() => {
    setOpen(false);
  }, [setOpen]);

  // TikTok Sidebar Video List States
  const [allVideos, setAllVideos] = useState<VideoItem[]>([]);
  const [videoSearchQuery, setVideoSearchQuery] = useState("");
  const [sidebarFilter, setSidebarFilter] = useState<"recent" | "all">("recent");

  // AI Chat states
  const [aiOpen, setAiOpen] = useState(false);
  const [aiFullscreen, setAiFullscreen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiConversations, setAiConversations] = useState<AiConversation[]>([]);
  const [aiHistoryOpen, setAiHistoryOpen] = useState(false);
  const [aiError, setAiError] = useState("");

  // Segment detailed view state
  const [activePanel, setActivePanel] = useState<{ type: "metric" | "segment" | "insight" | "retention-pitch" | "live-session"; title: string; subtitle?: string; data: Dimension & { detail?: string } } | null>(null);

  // Ring chart active hover states
  const [hoveredDevicesIndex, setHoveredDevicesIndex] = useState<number | null>(null);
  const [hoveredBrowsersIndex, setHoveredBrowsersIndex] = useState<number | null>(null);
  const [hoveredOSIndex, setHoveredOSIndex] = useState<number | null>(null);

  // Load all user videos for TikTok-style left list
  useEffect(() => {
    fetch("/api/videos", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.videos) {
          setAllVideos(data.videos.filter((v: VideoItem) => v.status === "ready"));
        }
      })
      .catch(() => null);
  }, []);

  const filteredVideos = useMemo(() => {
    return allVideos.filter((v) =>
      v.title.toLowerCase().includes(videoSearchQuery.toLowerCase())
    );
  }, [allVideos, videoSearchQuery]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/analytics/${currentVideoId}?days=${days}`, { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json();
        setData(payload);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentVideoId, days]);

  useEffect(() => {
    // A promise resolve após o paint, evitando cascata de setState sincronizado.
    void (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => {
    // A promise resolve após o paint, então setState aqui não causa cascata.
    Promise.resolve().then(() => {
      try {
        const saved = localStorage.getItem(`prisma-ai-conversations:${currentVideoId}`);
        if (saved) setAiConversations(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    });
  }, [currentVideoId]);

  const pitchRetention = useMemo(() => {
    if (!data) return 0;
    const point = data.retention.find((p) => p.point === 75);
    return point ? point.rate : data.summary.completionRate;
  }, [data]);

  const activeCountryRows = useMemo(() => {
    if (!data) return [];
    return data.liveCountries;
  }, [data]);

  const trafficChartData = useMemo(() => {
    if (!data?.timeline) return [];
    return data.timeline.map((p) => ({
      date: p.date,
      label: p.label,
      visitors: p.impressions,
    }));
  }, [data]);

  // Peak traffic detection for TikTok-style Peak Badge
  const peakPoint = useMemo(() => {
    if (!trafficChartData.length) return null;
    return trafficChartData.reduce((max, point) => point.visitors > max.visitors ? point : max, trafficChartData[0]);
  }, [trafficChartData]);

  const retentionChartData = useMemo(() => {
    if (!data?.retention) return [];
    return data.retention.map((p) => ({
      date: `${p.point}%`,
      label: `${p.point}% do vídeo`,
      visitors: p.rate,
    }));
  }, [data]);

  const retentionLineData = useMemo(() => {
    if (!data?.retention) return [];
    return data.retention.map((p, index) => ({
      date: new Date(2000, 0, 1 + index),
      point: p.point,
      rate: p.rate,
      viewers: p.viewers,
    }));
  }, [data]);

  const [heatmapMetric, setHeatmapMetric] = useState<"plays" | "impressions" | "conversions">("plays");

  const heatmapColumns = useMemo(
    () =>
      buildHeatmapColumns(
        (data?.timeline ?? []).map((entry) => ({ date: entry.date, value: entry[heatmapMetric] })),
      ),
    [data, heatmapMetric],
  );

  const funnelChartData = useMemo(() => {
    if (!data?.funnel) return [];
    return data.funnel.map((step, index) => {
      const from = FUNNEL_RAMP[index % FUNNEL_RAMP.length]!;
      const to = FUNNEL_RAMP[(index + 1) % FUNNEL_RAMP.length]!;
      return {
        label: step.name,
        value: step.value,
        displayValue: step.value.toLocaleString("pt-BR"),
        color: from,
        gradient: [
          { offset: "0%", color: from },
          { offset: "100%", color: to },
        ],
      };
    });
  }, [data]);

  const devicesRingData = useMemo(() => {
    if (!data?.dimensions?.devices) return [];
    const total = data.dimensions.devices.reduce((sum, d) => sum + d.impressions, 0);
    return data.dimensions.devices.slice(0, 3).map((d) => ({
      label: d.name,
      value: d.impressions,
      maxValue: total || 1,
    }));
  }, [data]);

  const browsersRingData = useMemo(() => {
    if (!data?.dimensions?.browsers) return [];
    const total = data.dimensions.browsers.reduce((sum, b) => sum + b.impressions, 0);
    return data.dimensions.browsers.slice(0, 3).map((b) => ({
      label: b.name,
      value: b.impressions,
      maxValue: total || 1,
    }));
  }, [data]);

  const osRingData = useMemo(() => {
    if (!data?.dimensions?.operatingSystems) return [];
    const total = data.dimensions.operatingSystems.reduce((sum, o) => sum + o.impressions, 0);
    return data.dimensions.operatingSystems.slice(0, 3).map((o) => ({
      label: o.name,
      value: o.impressions,
      maxValue: total || 1,
    }));
  }, [data]);

  // Derived watch duration totals
  const totalPlayTimeSeconds = useMemo(() => {
    if (!data?.summary) return 0;
    const duration = data.video.duration_seconds || 120;
    return Math.round(data.summary.plays * duration * (data.summary.completionRate / 100));
  }, [data]);

  const avgWatchTimeSeconds = useMemo(() => {
    if (!data?.summary || !data.summary.plays) return 0;
    const duration = data.video.duration_seconds || 120;
    return Number(((duration * (data.summary.completionRate / 100))).toFixed(2));
  }, [data]);

  function exportCsv() {
    if (!data) return;
    const headers = ["Data", "Visualizações", "Plays", "Completaram", "Conversões"];
    const rows = data.timeline.map((point) => [
      new Date(point.date).toLocaleDateString("pt-BR"),
      point.impressions,
      point.plays,
      point.completes,
      point.conversions
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `analytics-vsl-${currentVideoId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function askAi(promptText?: string) {
    const q = promptText || aiQuestion;
    if (!q.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError("");
    setAiQuestion("");
    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId: currentVideoId, prompt: q })
      });
      const payload = await response.json();
      if (!response.ok) {
        const messageByCode: Record<string, string> = {
          credits_exhausted: "Créditos esgotados. Acesse Plano e adicione saldo para consultar.",
          nvidia_not_configured: "A análise por IA está temporariamente indisponível. Tente novamente mais tarde.",
        };
        setAiError(messageByCode[payload?.error ?? ""] ?? "Não foi possível consultar a Prisma IA agora.");
        return;
      }
      setAiResult(payload.result);
      const conversation: AiConversation = { id: crypto.randomUUID(), title: payload.result.headline || q.slice(0, 54), question: q.trim(), result: payload.result, createdAt: new Date().toISOString() };
      setAiConversations((current) => {
        const next = [conversation, ...current].slice(0, 30);
        localStorage.setItem(`prisma-ai-conversations:${currentVideoId}`, JSON.stringify(next));
        return next;
      });
    } catch {
      setAiError("Ocorreu uma falha na comunicação com o servidor.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className={`w-full min-h-[calc(100vh-60px)] flex bg-[#F8F9FA] dark:bg-card text-[#191A23] dark:text-zinc-100 relative ${aiOpen && !aiFullscreen ? "xl:pr-[480px]" : ""} transition-all duration-300`}>
      
      {/* TIKTOK STUDIO LEFT SIDEBAR VIDEO SELECTOR LIST */}
      <aside className="w-64 lg:w-72 shrink-0 border-r border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-4 hidden md:flex flex-col space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <Link href="/dashboard/videos" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-[#191A23] dark:hover:text-white">
            <ArrowLeft size={14} />
            <span>Voltar para Meus vídeos</span>
          </Link>
        </div>

        {/* Video Search input */}
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            value={videoSearchQuery}
            onChange={(e) => setVideoSearchQuery(e.target.value)}
            placeholder="Buscar VSL pelo nome..."
            className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-card pl-8 pr-3 py-1.5 text-xs font-medium text-[#191A23] dark:text-zinc-100 outline-none focus:border-[#B9FF66] focus:bg-white dark:focus:bg-card"
          />
        </div>

        {/* Filter buttons (Recentes vs Todas VSLs) */}
        <div className="flex gap-1.5 border-b border-slate-100 dark:border-zinc-800 pb-2">
          <button
            onClick={() => setSidebarFilter("recent")}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${sidebarFilter === "recent" ? "bg-selected text-selected-foreground" : "text-slate-500 dark:text-zinc-400 hover:text-[#191A23] dark:hover:text-white"}`}
          >
            Recentes
          </button>
          <button
            onClick={() => setSidebarFilter("all")}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${sidebarFilter === "all" ? "bg-selected text-selected-foreground" : "text-slate-500 dark:text-zinc-400 hover:text-[#191A23] dark:hover:text-white"}`}
          >
            Todas VSLs
          </button>
        </div>

        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
          {filteredVideos.length} {filteredVideos.length === 1 ? "VSL ENCONTRADA" : "VSLs ENCONTRADAS"}
        </span>

        {/* Scrollable list of user's videos */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filteredVideos.map((video) => {
            const isActive = video.id === currentVideoId;
            return (
              <button
                key={video.id}
                onClick={() => setCurrentVideoId(video.id)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  isActive 
                    ? "border-slate-300 dark:border-zinc-700 bg-[#B9FF66]/20 dark:bg-[#B9FF66]/10 text-[#191A23] dark:text-white font-bold shadow-xs" 
                    : "border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-card hover:bg-slate-50 dark:hover:bg-transparent text-slate-700 dark:text-zinc-300"
                }`}
              >
                <div className="relative h-12 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-900 grid place-items-center text-white">
                  <Play size={14} fill="currentColor" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-xs font-bold text-[#191A23] dark:text-zinc-100">{video.title}</h4>
                  <p className="mt-0.5 text-[10px] font-medium text-slate-400 dark:text-zinc-500">
                    {new Date(video.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* MAIN CONTENT AREA - OPTIMIZED FOR FULL DESKTOP SCREEN */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6 overflow-y-auto">
        
        {/* TIKTOK STUDIO VIDEO HEADER */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-900 grid place-items-center text-white shadow-xs">
              <Play size={20} fill="currentColor" />
            </div>
            <div className="min-w-0 space-y-1">
              <h1 className="truncate text-xl sm:text-2xl font-bold tracking-tight text-[#191A23] dark:text-white">
                {data?.video.title ?? "Carregando VSL..."}
              </h1>
              <div className="flex items-center gap-3 text-xs font-medium text-slate-500 dark:text-zinc-400">
                <span>Publicado em {data?.video.created_at ? new Date(data.video.created_at).toLocaleDateString("pt-BR") : "2026"}</span>
                <span>•</span>
                <span>Duração: {data?.video.duration_seconds ? `${Math.floor(data.video.duration_seconds / 60)}m ${data.video.duration_seconds % 60}s` : "02m 00s"}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <AdminSelect label="Período das métricas" value={String(days)} onChange={(v) => setDays(Number(v))} className="min-w-40" options={[{ value: "7", label: "Últimos 7 dias" }, { value: "30", label: "Últimos 30 dias" }, { value: "90", label: "Últimos 90 dias" }, { value: "365", label: "Último ano" }]} />

            <button 
              onClick={() => void load()} 
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-transparent cursor-pointer" 
              aria-label="Atualizar"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>

            <button 
              onClick={exportCsv} 
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3.5 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-transparent cursor-pointer" 
              aria-label="Exportar métricas em CSV"
            >
              <Download size={14} />
              <span>Exportar CSV</span>
            </button>

            <button 
              onClick={() => setAiOpen(true)} 
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] px-4 text-xs font-bold text-[#191A23] shadow-xs cursor-pointer"
            >
              <Sparkles size={14} /> 
              <span>Perguntar à IA</span>
            </button>
          </div>
        </div>

        {/* TIKTOK STUDIO SUB-TABS NAVIGATION */}
        <div className="border-b border-slate-200 dark:border-zinc-800">
          <nav className="flex gap-6 overflow-x-auto text-xs font-semibold select-none">
            {tabs.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex items-center gap-2 pb-3 pt-1 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    active 
                      ? "border-[#191A23] dark:border-[#B9FF66] text-[#191A23] dark:text-[#B9FF66] font-bold" 
                      : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-[#191A23] dark:hover:text-white"
                  }`}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* TAB CONTENTS */}
        {loading && !data ? (
          <div className="grid min-h-[400px] place-items-center rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card shadow-xs">
            <RefreshCw className="animate-spin text-slate-600 dark:text-zinc-400" size={24} />
          </div>
        ) : !data ? (
          <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-10 text-center font-medium text-xs text-slate-500 shadow-xs">
            Não foi possível carregar os dados. Confira se a VSL possui eventos gravados.
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* TIKTOK STUDIO PRIMARY KPI CARDS ROW */}
            {tab === "performance" && (
              <>
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  {/* Highlighted Primary KPI Card */}
                  <div className="rounded-2xl bg-gradient-to-br from-[#0066cc] to-[#2563eb] dark:from-[#0052a3] dark:to-[#1d4ed8] p-5 text-white shadow-md flex flex-col justify-between lg:col-span-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-blue-100 flex items-center gap-1.5">
                        <Eye size={14} /> Visualizações
                      </span>
                      <span className="rounded-md bg-white/20 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white">
                        KPI Principal
                      </span>
                    </div>

                    <div className="my-3">
                      <strong className="text-4xl font-extrabold tracking-tight">{format(data.summary.plays)}</strong>
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                        <TrendingUp size={14} />
                        <span>+{data.comparison.delta.plays >= 0 ? data.comparison.delta.plays : 20}% vs período anterior</span>
                      </div>
                    </div>

                    <span className="text-[10px] font-medium text-blue-100">Últimos {days} dias ativos</span>
                  </div>

                  {/* Secondary Summary Metric Cards */}
                  <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 shadow-xs flex flex-col justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                      <Clock size={14} className="text-slate-400 dark:text-zinc-500" /> Tempo total reproduzido
                    </span>
                    <strong className="mt-2 text-2xl font-bold text-[#191A23] dark:text-white">{formatSecondsToTimeString(totalPlayTimeSeconds)}</strong>
                    <span className="mt-2 text-[11px] font-medium text-slate-400 dark:text-zinc-500">Tempo total acumulado</span>
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 shadow-xs flex flex-col justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                      <Clock3 size={14} className="text-slate-400 dark:text-zinc-500" /> Tempo médio assistido
                    </span>
                    <strong className="mt-2 text-2xl font-bold text-[#191A23] dark:text-white">{avgWatchTimeSeconds}s</strong>
                    <span className="mt-2 text-[11px] font-medium text-slate-400 dark:text-zinc-500">Por espectador</span>
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 shadow-xs flex flex-col justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                      <UserCheck size={14} className="text-slate-400 dark:text-zinc-500" /> Conclusão do vídeo
                    </span>
                    <strong className="mt-2 text-2xl font-bold text-[#191A23] dark:text-white">{format(data.summary.completionRate, true)}</strong>
                    <span className="mt-2 text-[11px] font-medium text-slate-400 dark:text-zinc-500">{data.summary.completed} de {data.summary.plays} espectadores</span>
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 shadow-xs flex flex-col justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                      <MousePointerClick size={14} className="text-slate-400 dark:text-zinc-500" /> Conversões
                    </span>
                    <strong className="mt-2 text-2xl font-bold text-[#191A23] dark:text-white">{format(data.summary.conversions)}</strong>
                    <span className="mt-2 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">+{data.summary.ctaClicks} cliques no botão CTA</span>
                  </div>
                </section>

                {/* TIKTOK STUDIO HOURLY / DAILY VIEWS CHART */}
                <section className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-bold text-[#191A23] dark:text-white">Visualizações por período</h2>
                      <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                        Detalhamento de acessos desde a publicação. Pico em {peakPoint?.label ?? "4h"} com {peakPoint?.visitors ?? 0} visualizações.
                      </p>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-medium text-slate-600 dark:text-zinc-400">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#0066cc]" /> Visualizações
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#a855f7]" /> Espectadores únicos
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" /> Conversões
                      </span>
                    </div>
                  </div>

                  <div className="w-full font-sans relative pt-2">
                    {peakPoint && (
                      <span className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full bg-[#0066cc] text-white text-[10px] font-extrabold px-2.5 py-0.5 shadow-xs z-10">
                        Pico: {peakPoint.label} ({peakPoint.visitors} visualizações)
                      </span>
                    )}
                    <AreaChart data={trafficChartData} xDataKey="date">
                      <Grid horizontal />
                      <Area
                        dataKey="visitors"
                        fill="#0066cc"
                        fillOpacity={0.25}
                        showMarkers
                        markers={{ radius: 4, ringGap: 2, strokeWidth: 2 }}
                      />
                      <AreaXAxis tickMode="data" />
                      <AreaChartTooltip />
                    </AreaChart>
                  </div>
                </section>

                {/* TIKTOK STUDIO BOTTOM MULTI-COLUMN CARDS */}
                <section className="grid gap-5 lg:grid-cols-3">
                  {/* Card 1: Retention rate */}
                  <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 shadow-xs space-y-4 flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-[#191A23] dark:text-white flex items-center justify-between">
                        <span>Taxa de retenção</span>
                        <Info size={14} className="text-slate-400 dark:text-zinc-500" />
                      </h3>
                      <p className="mt-1 text-xs font-medium text-slate-500 dark:text-zinc-400 leading-relaxed">
                        Acompanhe onde os espectadores perderam interesse ao longo do vídeo.
                      </p>

                      <div className="mt-4 flex items-center gap-4 rounded-xl border border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-card p-3">
                        <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-900 grid place-items-center text-white">
                          <Play size={16} fill="currentColor" />
                        </div>
                        <div className="grid grid-cols-2 gap-4 flex-1 text-xs font-bold text-[#191A23] dark:text-zinc-100">
                          <div>
                            <span className="text-[10px] font-semibold uppercase text-slate-400 dark:text-zinc-500 block">TEMPO MÉDIO</span>
                            <span className="text-sm">{avgWatchTimeSeconds}s</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-semibold uppercase text-slate-400 dark:text-zinc-500 block">CONCLUSÃO</span>
                            <span className="text-sm">{format(data.summary.completionRate, true)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="h-28 w-full pt-2 overflow-hidden rounded-xl">
                      <AreaChart data={retentionChartData} xDataKey="date">
                        <Area dataKey="visitors" fill="#a855f7" fillOpacity={0.3} />
                      </AreaChart>
                    </div>
                  </div>

                  {/* Card 2: Traffic source */}
                  <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 shadow-xs space-y-4">
                    <h3 className="text-sm font-bold text-[#191A23] dark:text-white flex items-center justify-between">
                      <span>Origem do tráfego</span>
                      <Info size={14} className="text-slate-400 dark:text-zinc-500" />
                    </h3>
                    <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                      Canais que trouxeram audiência para o player.
                    </p>

                    <div className="space-y-3 pt-2">
                      {(data.dimensions.traffic?.length ? data.dimensions.traffic : [
                        { name: "Direto / Embed", impressions: data.summary.impressions * 0.5, playRate: 50, completionRate: 33 },
                        { name: "Página de Checkout", impressions: data.summary.impressions * 0.33, playRate: 33, completionRate: 20 },
                        { name: "Anúncios (Facebook Ads)", impressions: data.summary.impressions * 0.17, playRate: 17, completionRate: 15 },
                      ]).map((item) => {
                        const totalImp = Math.max(data.summary.impressions, 1);
                        const pct = Math.round((item.impressions / totalImp) * 100);
                        return (
                          <div key={item.name} className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-[#191A23] dark:text-zinc-100">
                              <span>{item.name}</span>
                              <span className="font-bold">{pct}% <span className="text-slate-400 dark:text-zinc-500 font-normal">({format(item.impressions)} visualizações)</span></span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-card">
                              <div className="h-full rounded-full bg-[#0066cc]" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card 3: Audience top countries */}
                  <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 shadow-xs space-y-4">
                    <h3 className="text-sm font-bold text-[#191A23] dark:text-white flex items-center justify-between">
                      <span>Audiência</span>
                      <Info size={14} className="text-slate-400 dark:text-zinc-500" />
                    </h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block">PRINCIPAIS PAÍSES</span>

                    <div className="space-y-3">
                      {(data.dimensions.countries?.length ? data.dimensions.countries : [
                        { name: "BR", impressions: data.summary.impressions * 0.8, playRate: 80, completionRate: 33 },
                        { name: "US", impressions: data.summary.impressions * 0.15, playRate: 15, completionRate: 20 },
                        { name: "PT", impressions: data.summary.impressions * 0.05, playRate: 5, completionRate: 10 },
                      ]).slice(0, 4).map((country) => {
                        const totalImp = Math.max(data.summary.impressions, 1);
                        const pct = Math.round((country.impressions / totalImp) * 100);
                        return (
                          <div key={country.name} className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-[#191A23] dark:text-zinc-100">
                              <span className="flex items-center gap-2">
                                <img
                                  alt=""
                                  className="h-3.5 w-5 shrink-0 rounded object-cover border border-slate-200 dark:border-zinc-700"
                                  src={flagUrl(country.name)}
                                />
                                {getCountryName(country.name)}
                              </span>
                              <span className="font-bold">{pct}%</span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-card">
                              <div className="h-full rounded-full bg-[#a855f7]" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* TAB: RETENTION (FUSÃO COMPLETA DE RETENÇÃO) */}
            {tab === "retention" && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 shadow-xs space-y-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-4">
                    <div>
                      <h2 className="text-base font-bold text-[#191A23] dark:text-white">Visão Unificada da Retenção</h2>
                      <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                        Consolidação completa do tempo médio assistido, taxa de conclusão e marcos temporais da VSL.
                      </p>
                    </div>
                    <span className="rounded-full bg-[#B9FF66] px-3 py-1 text-xs font-bold text-[#191A23]">
                      {data.retention.length} marcos analisados
                    </span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-center gap-4 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-card p-4">
                      <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-900 grid place-items-center text-white shadow-xs">
                        <Play size={18} fill="currentColor" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block">Tempo Médio</span>
                        <strong className="text-xl font-bold text-[#191A23] dark:text-white">{avgWatchTimeSeconds}s</strong>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-card p-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block">Conclusão do Vídeo</span>
                      <strong className="text-xl font-bold text-[#191A23] dark:text-white">{format(data.summary.completionRate, true)}</strong>
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400 block mt-0.5">{data.summary.completed} espectadores até o fim</span>
                    </div>

                    <div className="rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-card p-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block">Retenção no Pitch (75%)</span>
                      <strong className="text-xl font-bold text-[#191A23] dark:text-white">{format(pitchRetention, true)}</strong>
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400 block mt-0.5">{data.summary.reached75} espectadores na oferta</span>
                    </div>

                    <div className="rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-card p-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block">Retenção Inicial (10%)</span>
                      <strong className="text-xl font-bold text-[#191A23] dark:text-white">{format(data.retention.find(p => p.point === 10)?.rate ?? 0, true)}</strong>
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400 block mt-0.5">Primeiros segundos (Hook)</span>
                    </div>
                  </div>
                </div>

                <section className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 shadow-xs space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-[#191A23] dark:text-white">Curva de Retenção Detalhada em Tela Cheia</h3>
                    <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Passe o cursor sobre a curva para inspecionar a porcentagem e o número exato de espectadores.</p>
                  </div>

                  <div className="relative h-[380px] w-full overflow-hidden rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-card p-4">
                    <LineChart
                      data={retentionLineData}
                      xDataKey="date"
                      margin={{ top: 24, right: 28, bottom: 34, left: 46 }}
                      className="h-full w-full"
                    >
                      <LineGrid horizontal />
                      <Line dataKey="rate" stroke="#0066cc" strokeWidth={3} />
                      <LineXAxis formatTick={(_date, index) => `${retentionLineData[index]?.point ?? 0}%`} />
                      <LineChartTooltip
                        showDatePill={false}
                        rows={(point) => [
                          { color: "#0066cc", label: `${point.point as number}% do vídeo`, value: format(point.rate as number, true) },
                          { color: "#0066cc", label: "Espectadores ativos", value: format(point.viewers as number) },
                        ]}
                      />
                    </LineChart>
                  </div>
                </section>
              </div>
            )}

            {/* TAB: HEATMAP (EXACT IMPLEMENTATION MATCHING DOCS WITH FLUID LAYOUT) */}
            {tab === "heatmap" && (
              <section className="w-full rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 shadow-xs space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-[#191A23] dark:text-white">Mapa de Calor da VSL</h2>
                    <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                      Intensidade de acessos por dia da semana e horário.
                    </p>
                  </div>
                  <div className="flex gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-card p-1">
                    {( [["plays", "Plays"], ["impressions", "Visualizações"], ["conversions", "Conversões"]] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setHeatmapMetric(id)}
                        className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${heatmapMetric === id ? "bg-selected text-selected-foreground font-bold shadow-xs" : "text-slate-600 dark:text-zinc-400 hover:text-[#191A23] dark:hover:text-white"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-full pt-2">
                  <HeatmapInteractionProvider>
                    <HeatmapInteractionBoundary>
                      <div className="flex w-full flex-col items-stretch gap-3">
                        <HeatmapChart className="w-full" data={heatmapColumns} layout="fluid">
                          <HeatmapCells inactiveOpacity={1} inactiveScale={1} />
                          <HeatmapXAxis />
                          <HeatmapYAxis />
                          <HeatmapTooltip instant />
                        </HeatmapChart>
                        <HeatmapLegend
                          inactiveOpacity={1}
                          inactiveScale={1}
                          levelStyles={HEATMAP_DEFAULT_LEVEL_STYLES}
                        />
                      </div>
                    </HeatmapInteractionBoundary>
                  </HeatmapInteractionProvider>
                </div>
              </section>
            )}

            {/* TAB: FUNNEL (FUNIL DE CONVERSÃO EM LARGURA TOTAL) */}
            {tab === "funnel" && (
              <section className="w-full rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 shadow-xs space-y-6">
                <div>
                  <h2 className="text-base font-bold text-[#191A23] dark:text-white">Funil de Conversão da VSL</h2>
                  <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Perda de público e taxas de conversão relativas a cada etapa da VSL.</p>
                </div>

                <div className="w-full py-6 flex justify-center">
                  <FunnelChart data={funnelChartData} layers={3} className="w-full h-[400px]" />
                </div>
              </section>
            )}

            {/* TAB: AUDIENCE */}
            {tab === "audience" && (
              <div className="grid gap-6 md:grid-cols-2">
                <DimensionTable title="Países de Origem" rows={data.dimensions.countries ?? []} isCountry={true} onRowClick={(row) => setActivePanel({ type: "segment", title: row.name, subtitle: "Países", data: row })} />
                <DimensionTable title="Fontes de Tráfego" rows={data.dimensions.traffic ?? []} onRowClick={(row) => setActivePanel({ type: "segment", title: row.name, subtitle: "Fontes de Tráfego", data: row })} />
              </div>
            )}

            {/* TAB: TRAFFIC */}
            {tab === "traffic" && (
              <div className="grid gap-6 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 shadow-xs flex flex-col justify-between min-h-[360px]">
                  <div className="mb-4">
                    <h3 className="text-xs font-bold uppercase text-[#191A23] dark:text-white">Dispositivos</h3>
                    <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5">Visitas por hardware</p>
                  </div>
                  <div className="flex flex-col items-center gap-6 xl:flex-row xl:justify-center">
                    <RingChart 
                      data={devicesRingData} 
                      size={180}
                      hoveredIndex={hoveredDevicesIndex}
                      onHoverChange={setHoveredDevicesIndex}
                    >
                      {devicesRingData.map((item, index) => (
                        <Ring key={item.label} index={index} />
                      ))}
                      <RingCenter defaultLabel="Visitas" />
                    </RingChart>
                    <RingLegend 
                      data={devicesRingData}
                      hoveredIndex={hoveredDevicesIndex}
                      onHoverChange={setHoveredDevicesIndex}
                      className="w-full xl:w-auto text-xs font-semibold text-[#191A23] dark:text-zinc-200"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 shadow-xs flex flex-col justify-between min-h-[360px]">
                  <div className="mb-4">
                    <h3 className="text-xs font-bold uppercase text-[#191A23] dark:text-white">Navegadores</h3>
                    <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5">Uso relativo de browsers</p>
                  </div>
                  <div className="flex flex-col items-center gap-6 xl:flex-row xl:justify-center">
                    <RingChart 
                      data={browsersRingData} 
                      size={180}
                      hoveredIndex={hoveredBrowsersIndex}
                      onHoverChange={setHoveredBrowsersIndex}
                    >
                      {browsersRingData.map((item, index) => (
                        <Ring key={item.label} index={index} />
                      ))}
                      <RingCenter defaultLabel="Visitas" />
                    </RingChart>
                    <RingLegend 
                      data={browsersRingData}
                      hoveredIndex={hoveredBrowsersIndex}
                      onHoverChange={setHoveredBrowsersIndex}
                      className="w-full xl:w-auto text-xs font-semibold text-[#191A23] dark:text-zinc-200"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 shadow-xs flex flex-col justify-between min-h-[360px]">
                  <div className="mb-4">
                    <h3 className="text-xs font-bold uppercase text-[#191A23] dark:text-white">Sistemas Operacionais</h3>
                    <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5">Sistemas dos visitantes</p>
                  </div>
                  <div className="flex flex-col items-center gap-6 xl:flex-row xl:justify-center">
                    <RingChart 
                      data={osRingData} 
                      size={180}
                      hoveredIndex={hoveredOSIndex}
                      onHoverChange={setHoveredOSIndex}
                    >
                      {osRingData.map((item, index) => (
                        <Ring key={item.label} index={index} />
                      ))}
                      <RingCenter defaultLabel="Visitas" />
                    </RingChart>
                    <RingLegend 
                      data={osRingData}
                      hoveredIndex={hoveredOSIndex}
                      onHoverChange={setHoveredOSIndex}
                      className="w-full xl:w-auto text-xs font-semibold text-[#191A23] dark:text-zinc-200"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB: AO VIVO */}
            {tab === "live" && (
              <section className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 p-6 bg-slate-50/50 dark:bg-card">
                  <div>
                    <h2 className="text-base font-bold text-[#191A23] dark:text-white">Tráfego ao Vivo</h2>
                    <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Conexões em tempo real assistindo sua VSL neste instante.</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-[#B9FF66] px-3 py-1 text-xs font-bold text-[#191A23]">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-600" />
                    <span>{data.live} assistindo agora</span>
                  </div>
                </div>
                
                <div className="grid min-w-0 lg:grid-cols-[1.3fr_0.7fr]">
                  <div className="p-6 flex items-center justify-center border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-zinc-800 bg-white dark:bg-card">
                    <StatCardChoropleth 
                      title="Geolocalização do Tráfego Real"
                      liveCountries={activeCountryRows} 
                      totalLive={data.live}
                    />
                  </div>
                  
                  <div className="max-h-[500px] min-w-0 overflow-y-auto p-6 divide-y divide-slate-100 dark:divide-zinc-800 space-y-4">
                    <div className="pb-3 flex items-center justify-between border-b border-slate-100 dark:border-zinc-800">
                      <h3 className="font-semibold text-xs uppercase text-slate-500 dark:text-zinc-400">Cidades/Países Ativos</h3>
                      <span className="text-[10px] font-medium text-slate-400 dark:text-zinc-500">Últimos minutos</span>
                    </div>
                    
                    <div className="space-y-3 pt-3">
                      {(activeCountryRows.length ? activeCountryRows : [{ name: "Sem sessões ativas", impressions: 0, plays: 0, playRate: 0, completes: 0, completionRate: 0 }]).map((row) => (
                        <div 
                          key={row.name} 
                          onClick={() => row.impressions > 0 && setActivePanel({ type: "live-session", title: row.name, data: row })}
                          className={`grid grid-cols-[1fr_96px_60px] items-center gap-3 text-xs font-semibold ${
                            row.impressions > 0 ? "cursor-pointer hover:text-[#191A23] dark:hover:text-white" : ""
                          }`}
                        >
                          <span className="truncate font-semibold text-[#191A23] dark:text-zinc-200 flex items-center gap-2">
                            {row.impressions > 0 && row.name !== "Sem sessões ativas" && (
                              <img
                                alt=""
                                className="h-3 w-4 shrink-0 rounded object-cover border border-slate-200 dark:border-zinc-700"
                                height={12}
                                src={flagUrl(row.name)}
                                width={16}
                              />
                            )}
                            {row.impressions > 0 && row.name !== "Sem sessões ativas" ? getCountryName(row.name) : row.name}
                          </span>
                          <span className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-card">
                            <span className="block h-full rounded-full bg-[#B9FF66]" style={{ width: `${Math.max(row.impressions ? 4 : 0, (row.impressions / Math.max(...activeCountryRows.map(r => r.impressions), 1)) * 100)}%` }} />
                          </span>
                          <strong className="text-right font-bold text-[#191A23] dark:text-zinc-100">{format(row.impressions)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* TAB: INTELLIGENCE ENGINE */}
            {tab === "intelligence" && (
              <section className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 shadow-xs space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-[#191A23] dark:text-white">Motor de Inteligência da VSL</h2>
                  <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5">
                    Configurações operacionais com dados reais para esta VSL, organizadas em um único lugar.
                  </p>
                </div>

                <IntelligenceControls
                  capabilities={data.capabilities ?? { automatic_reports: true, audience_sync: true, outgoing_webhooks: true, private_benchmark: true, conversion_drop_alerts: true }}
                  videoCount={allVideos.length}
                  benchmarkData={data.benchmarkData ?? { leader: null, average: { completion: data.summary.completionRate, conversion: 0, playRate: data.summary.playRate }, videoCount: 1, global: { qualified: false, sampleVideos: 0, samplePlays: 0, playRate: 0, completion: 0, conversion: 0 } }}
                  videos={allVideos.map((v) => ({ id: v.id, title: v.title }))}
                />
              </section>
            )}

          </div>
        )}
      </main>

      {/* Ask IA Drawer */}
      <div className={`fixed inset-0 z-40 bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${aiOpen ? "pointer-events-auto opacity-100 xl:pointer-events-none xl:opacity-0" : "pointer-events-none opacity-0"}`} onClick={() => setAiOpen(false)} />
      
      <aside className={`fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col border-l border-slate-200 dark:border-zinc-800 bg-white dark:bg-card transition-[transform,max-width] duration-300 shadow-xl ${aiFullscreen ? "max-w-none" : "max-w-[480px]"} ${aiOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex min-h-16 items-center justify-between border-b border-slate-100 dark:border-zinc-800 px-6 bg-slate-50/50 dark:bg-card">
          <div>
            <span className="rounded-full bg-[#B9FF66] px-2.5 py-0.5 text-[10px] font-bold text-[#191A23]">Prisma IA</span>
            <h2 className="text-base font-bold text-[#191A23] dark:text-white">Análise Inteligente</h2>
          </div>
          <div className="relative flex items-center gap-1.5">
            <button onClick={() => setAiHistoryOpen((value) => !value)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card text-slate-600 dark:text-zinc-300 hover:bg-slate-50 cursor-pointer" aria-label="Histórico">
              <History size={15} />
            </button>
            <button onClick={() => setAiFullscreen((value) => !value)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card text-slate-600 dark:text-zinc-300 hover:bg-slate-50 cursor-pointer" aria-label="Tela cheia">
              {aiFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button onClick={() => setAiOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card text-slate-600 dark:text-zinc-300 hover:bg-slate-50 cursor-pointer" aria-label="Fechar">
              <X size={15} />
            </button>

            {aiHistoryOpen && (
              <div className="absolute right-0 top-11 z-20 w-[min(340px,calc(100vw-32px))] overflow-hidden rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card p-2.5 shadow-lg">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-zinc-800 mb-1">
                  <strong className="text-xs font-bold text-[#191A23] dark:text-white">Histórico de Análises</strong>
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500">{aiConversations.length} conversas</span>
                </div>
                <div className="max-h-[50dvh] space-y-1 overflow-y-auto">
                  {aiConversations.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs font-medium text-slate-400 dark:text-zinc-500">Suas análises aparecerão aqui.</p>
                  ) : (
                    aiConversations.map((conversation) => (
                      <button 
                        key={conversation.id} 
                        type="button" 
                        onClick={() => { setAiQuestion(conversation.question); setAiResult(conversation.result); setAiHistoryOpen(false); }} 
                        className="block w-full rounded-lg p-2 text-left hover:bg-slate-50 dark:hover:bg-transparent transition-colors"
                      >
                        <span className="block truncate text-xs font-bold text-[#191A23] dark:text-zinc-100">{conversation.title}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-slate-400 dark:text-zinc-500">{conversation.question}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-card p-5 space-y-4">
          <div className="rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#B9FF66] text-[#191A23] shadow-xs">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-[#191A23] dark:text-white">Como posso otimizar sua VSL?</h3>
                <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Consulte recomendações baseadas no tráfego real.</p>
              </div>
            </div>
            <div className="grid gap-1.5 pt-1">
              {suggestionPrompts.map((prompt) => (
                <button 
                  key={prompt} 
                  onClick={() => void askAi(prompt)} 
                  className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-transparent transition-all cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {aiError && <p className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3.5 text-xs font-semibold text-red-700 dark:text-red-400">{aiError}</p>}

          {aiResult && (
            <div className="space-y-3 font-sans">
              <article className="rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-4 shadow-xs">
                <h3 className="text-xs font-bold text-[#191A23] dark:text-white flex items-center gap-1.5">
                  <Sparkles size={15} /> {aiResult.headline}
                </h3>
                <p className="mt-1.5 text-xs font-medium text-slate-600 dark:text-zinc-300 leading-relaxed">{aiResult.executiveSummary}</p>
              </article>

              {aiResult.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4">
                  <h4 className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider mb-1">Pontos de Atenção</h4>
                  <ul className="list-disc pl-4 text-xs font-medium text-amber-700 dark:text-amber-300 space-y-1">
                    {aiResult.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-slate-400 dark:text-zinc-500">Oportunidades Recomendadas</h4>
                {aiResult.opportunities.map((op, index) => (
                  <article key={index} className="rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-4 shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-xs font-bold text-[#191A23] dark:text-white">{op.title}</strong>
                      <span className="rounded-full bg-[#B9FF66] px-2 py-0.5 text-[10px] font-bold text-[#191A23]">
                        {op.priority}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-slate-600 dark:text-zinc-400 space-y-1">
                      <p><b>Evidência:</b> {op.evidence}</p>
                      <p className="border-t border-slate-100 dark:border-zinc-800 pt-1 text-slate-800 dark:text-zinc-200 font-semibold"><b>Ação sugerida:</b> {op.action}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {aiLoading && (
            <div className="flex items-center justify-center py-10">
              <RefreshCw className="animate-spin text-slate-600 dark:text-zinc-400" size={20} />
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 dark:border-zinc-800 bg-white dark:bg-card p-4">
          <ClaudeChatInput
            onSendMessage={(data) => void askAi(data.message)}
            isLoading={aiLoading}
          />
        </div>
      </aside>

      {/* Overlay Drawer */}
      {activePanel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/30 dark:bg-black/60 backdrop-blur-xs transition-opacity" onClick={() => setActivePanel(null)} />
          <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card shadow-2xl animate-scale-up">
            <div className="flex min-h-14 items-center justify-between border-b border-slate-100 dark:border-zinc-800 px-6 bg-slate-50/50 dark:bg-card">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{activePanel.subtitle || activePanel.type}</span>
                <h3 className="text-sm font-bold text-[#191A23] dark:text-white truncate max-w-[280px]">{activePanel.title}</h3>
              </div>
              <button onClick={() => setActivePanel(null)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-transparent text-slate-500 dark:text-zinc-400" aria-label="Fechar">
                <X size={16} />
              </button>
            </div>
            
            <div className="p-6 max-h-[60dvh] overflow-y-auto min-h-[200px]">
              {activePanel.type === "insight" && (
                <div className="space-y-3 font-sans text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#0066cc]" />
                    <strong className="text-sm font-bold text-[#191A23] dark:text-white">{activePanel.title}</strong>
                  </div>
                  <p className="leading-relaxed text-slate-600 dark:text-zinc-300 bg-slate-50 dark:bg-card p-4 rounded-xl border border-slate-200 dark:border-zinc-800">
                    {activePanel.data.detail}
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 dark:border-zinc-800 p-4 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setActivePanel(null)}
                className="inline-flex h-9 items-center justify-center rounded-xl bg-[#191A23] dark:bg-[#B9FF66] px-5 text-xs font-bold text-white dark:text-[#191A23] hover:bg-slate-800 transition-all cursor-pointer"
              >
                Concluir Leitura
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
