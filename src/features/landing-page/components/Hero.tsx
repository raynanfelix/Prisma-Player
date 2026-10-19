"use client";

import Link from "next/link";
import {
  Play,
  Zap,
  ShieldCheck,
  ArrowUpRight,
  LayoutDashboard,
  Video,
  LineChart,
  Globe,
  Settings,
  Search,
  DollarSign,
} from "lucide-react";

const sidebarItems = [
  { label: "Início", icon: LayoutDashboard, active: true },
  { label: "Vídeos", icon: Video },
  { label: "Analytics", icon: LineChart },
  { label: "Domínios", icon: Globe },
  { label: "Configurações", icon: Settings },
];

const stats = [
  { label: "Plays no mês", value: "14.8k", delta: "+16.4%", positive: true },
  { label: "Retenção até o pitch", value: "84,2%", delta: "+12.8%", positive: true },
  { label: "Pitch views", value: "38%", delta: "+4.8%", positive: true },
  { label: "Carregamento", value: "0,18s", delta: "-12%", positive: true },
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Céu suave com nuvens difusas */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[900px]">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#A9CFEA_0%,#CFE4F4_32%,#EDF6FB_64%,#FFFFFF_100%)]" />
        <div className="absolute -left-24 top-24 h-56 w-[30rem] rounded-full bg-white/80 blur-[70px]" />
        <div className="absolute -right-24 top-8 h-64 w-[32rem] rounded-full bg-white/70 blur-[80px]" />
        <div className="absolute left-[18%] top-[360px] h-52 w-[26rem] rounded-full bg-white/70 blur-[70px]" />
        <div className="absolute right-[14%] top-[300px] h-40 w-[18rem] rounded-full bg-white/60 blur-[60px]" />
      </div>

      <div className="relative mx-auto max-w-5xl px-6 pt-32 text-center md:pt-40">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3.5 py-1.5 text-[12px] font-medium tracking-tight text-[#191A23]/70 backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-[#B9FF66]" />
          Player de VSL para lançamentos e ofertas
        </span>

        <h1 className="mx-auto mt-6 max-w-4xl text-balance text-[38px] font-bold leading-[1.05] tracking-[-0.03em] text-[#191A23] sm:text-6xl lg:text-[68px]">
          Player de VSL com pitch no segundo exato e carregamento instantâneo.
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#191A23]/60 sm:text-lg">
          Pitch delay sincronizado, analytics de retenção, testes A/B e proteção anti-download.
          Feito para operações de lançamento que colocam VSL no ar todos os dias.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex w-full items-center justify-center rounded-full bg-[#191A23] px-7 py-3.5 text-sm font-medium text-white shadow-[0_16px_40px_-18px_rgba(25,26,35,0.7)] transition hover:bg-[#191A23]/90 active:scale-[0.99] sm:w-auto"
          >
            Testar 14 Dias Grátis
          </Link>
          <a
            href="#recursos"
            className="inline-flex w-full items-center justify-center gap-2.5 rounded-full border border-[#191A23]/10 bg-white/70 px-6 py-3.5 text-sm font-medium text-[#191A23] backdrop-blur-md transition-colors hover:bg-white sm:w-auto"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#191A23]/20">
              <Play className="ml-0.5 h-2.5 w-2.5 fill-[#191A23]" />
            </span>
            Ver Recursos do Player
          </a>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] font-medium text-[#191A23]/45">
          <span className="inline-flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Carregamento em &lt; 250ms
          </span>
          <span className="h-1 w-1 rounded-full bg-[#191A23]/20" />
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Proteção Anti-Download
          </span>
        </div>
      </div>

      {/* Mockup do produto com fade para a página */}
      <div className="relative mx-auto mt-14 max-w-5xl px-4 sm:px-6">
        <div className="[mask-image:linear-gradient(to_bottom,#000_56%,transparent_100%)]">
          <div className="overflow-hidden rounded-t-[26px] border border-white/70 bg-white/65 shadow-[0_-1px_0_rgba(255,255,255,0.9),0_50px_120px_-50px_rgba(25,26,35,0.45)] backdrop-blur-xl">
            {/* Barra da janela */}
            <div className="flex items-center justify-between border-b border-[#191A23]/[0.06] bg-white/60 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#191A23]/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#191A23]/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#191A23]/15" />
                </div>
                <span className="hidden items-center gap-2 sm:flex">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#191A23]">
                    <Play className="ml-0.5 h-2 w-2 fill-[#B9FF66]" />
                  </span>
                  <span className="text-[12px] font-semibold tracking-tight text-[#191A23]">
                    Prisma Player
                  </span>
                </span>
              </div>

              <div className="hidden items-center gap-2 rounded-full border border-[#191A23]/[0.06] bg-white/70 px-3 py-1.5 md:flex">
                <Search className="h-3.5 w-3.5 text-[#191A23]/30" />
                <span className="text-[11px] text-[#191A23]/35">Buscar VSL, domínio ou evento</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#191A23]/[0.04] px-2.5 py-1 text-[10px] font-medium tabular-nums text-[#191A23]/50">
                  00:12:45
                </span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#B9FF66] text-[10px] font-bold text-[#191A23]">
                  P
                </span>
              </div>
            </div>

            <div className="flex">
              {/* Sidebar */}
              <aside className="hidden w-44 shrink-0 border-r border-[#191A23]/[0.06] bg-white/40 p-3 sm:block">
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#191A23]/30">
                  Operação
                </p>
                <div className="space-y-0.5">
                  {sidebarItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.label}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium ${
                          item.active ? "bg-[#191A23] text-white" : "text-[#191A23]/55"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {item.label}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-xl border border-[#191A23]/[0.06] bg-white/70 p-3">
                  <p className="text-[10px] font-semibold text-[#191A23]/40">Pitch Delay</p>
                  <p className="mt-1 text-[13px] font-bold tabular-nums text-[#191A23]">12:45</p>
                  <p className="mt-0.5 text-[9px] text-[#191A23]/35">sincronizado ao vídeo</p>
                </div>
              </aside>

              {/* Conteúdo */}
              <div className="min-w-0 flex-1 p-3 sm:p-5">
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <p className="text-[13px] font-semibold tracking-tight text-[#191A23]">
                      Olá, produtor
                    </p>
                    <p className="text-[11px] text-[#191A23]/40">O que vamos otimizar hoje?</p>
                  </div>
                  <span className="hidden rounded-full border border-[#191A23]/[0.06] bg-white/70 px-2.5 py-1 text-[10px] font-medium text-[#191A23]/45 sm:block">
                    Últimos 7 dias
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-xl border border-[#191A23]/[0.06] bg-white/80 p-3"
                    >
                      <p className="truncate text-[10px] font-medium text-[#191A23]/40">
                        {stat.label}
                      </p>
                      <div className="mt-1.5 flex items-baseline justify-between gap-1">
                        <span className="text-lg font-semibold tabular-nums tracking-tight text-[#191A23]">
                          {stat.value}
                        </span>
                        <span
                          className={`text-[9px] font-semibold ${
                            stat.positive ? "text-emerald-600" : "text-rose-500"
                          }`}
                        >
                          {stat.delta}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  {/* Player */}
                  <div className="lg:col-span-2 overflow-hidden rounded-xl border border-[#191A23]/[0.06] bg-[#101117]">
                    <div className="relative aspect-[16/8]">
                      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_0%,#24263a_0%,#101117_60%)]" />
                      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-[#B9FF66]/30 bg-black/40 px-2.5 py-1 text-[9px] font-medium text-[#B9FF66] backdrop-blur">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#B9FF66]" />
                        Pitch Delay 12:45
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#B9FF66] shadow-[0_10px_30px_-8px_rgba(185,255,102,0.8)]">
                          <Play className="ml-0.5 h-5 w-5 fill-[#191A23]" />
                        </span>
                      </div>
                      <div className="absolute inset-x-3 bottom-3">
                        <div className="h-1 overflow-hidden rounded-full bg-white/15">
                          <div className="h-full w-[62%] rounded-full bg-[#B9FF66]" />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[9px] tabular-nums text-white/50">
                          <span>08:02</span>
                          <span>12:45</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Retenção */}
                  <div className="rounded-xl border border-[#191A23]/[0.06] bg-white/80 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-medium text-[#191A23]/45">Retenção por minuto</p>
                      <ArrowUpRight className="h-3 w-3 text-[#191A23]/25" />
                    </div>
                    <svg viewBox="0 0 120 44" className="mt-2 w-full" role="img" aria-label="Gráfico de retenção">
                      <path
                        d="M0 34 L14 30 L28 32 L42 24 L56 26 L70 17 L84 19 L98 12 L112 14 L120 10"
                        fill="none"
                        stroke="#B9FF66"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M0 34 L14 30 L28 32 L42 24 L56 26 L70 17 L84 19 L98 12 L112 14 L120 10 L120 44 L0 44 Z"
                        fill="#B9FF66"
                        opacity="0.16"
                      />
                    </svg>
                    <div className="mt-1 flex items-center justify-between text-[9px] text-[#191A23]/35">
                      <span>00:00</span>
                      <span className="font-semibold text-[#191A23]">84,2%</span>
                      <span>22:00</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#B9FF66]/20 px-2 py-1.5">
                      <DollarSign className="h-3 w-3 text-[#191A23]" />
                      <span className="text-[9px] font-medium text-[#191A23]/70">
                        +38% de cliques no checkout
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
