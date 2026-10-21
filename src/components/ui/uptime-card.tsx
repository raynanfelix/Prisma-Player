"use client";

/**
 * @author: @dorianbaffier (kokonutui)
 * @description: Uptime Card - Status do Sistema (Prisma Player)
 * @version: 1.0.0
 * @license: MIT
 * @website: https://kokonutui.com/docs/cards/uptime-card
 * @github: https://github.com/kokonut-labs/kokonutui
 *
 * Origem (registro conforme src/components/README.md):
 * - Biblioteca: kokonutui - componente original "Uptime Card"
 *   (components/kokonutui/uptime-card.tsx, versão 1.0.0 de 2026-10-15);
 * - Licença: MIT; consulta em 2026-10-17 (raw.githubusercontent.com, main);
 * - Adaptações Prisma: cópia integral da lógica de interação (magnify de
 *   barras, teclado, aria, dia fixado) com textos e datas em pt-BR, cores
 *   nos tokens/superfícies do projeto (escuro = preto, hairlines brancas,
 *   destrutivo em red), `DEFAULT_SERVICES` removido (os serviços são reais,
 *   vindos do servidor) e estados "Operacional/Degradado/Indisponível/Sem
 *   dados". Ajustes estruturais para o lint do repositório (react-compiler):
 *   ajuste de tamanho das barras fora do render, loop de animação via
 *   `tickRef`; tipos/helpers em `./uptime/uptime-utils.ts`, barras em
 *   `uptime-bars.tsx` e log do dia em `uptime-day-log.tsx` (teto de linhas).
 */

import { CircleCheck, TriangleAlert } from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { UptimeBars } from "./uptime/uptime-bars";
import { UptimeDayLog } from "./uptime/uptime-day-log";
import {
  DAY,
  EASE,
  type UptimeCardProps,
  barAt,
  clamp,
  formatDay,
  statusOf,
  swell,
  uptimeOf,
} from "./uptime/uptime-utils";

export type {
  Incident,
  UptimeCardProps,
  UptimeService,
} from "./uptime/uptime-utils";

export default function UptimeCard({
  title = "Status do sistema",
  services = [],
  days = 90,
  endDate,
  className,
}: UptimeCardProps) {
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const tickRef = useRef<(now: number) => void>(() => {});
  const sim = useRef({
    weights: new Float64Array(days).fill(1),
    target: new Float64Array(days).fill(1),
    focus: null as number | null,
    raf: 0,
    last: 0,
    reduceMotion: false,
  });

  const end = Date.parse(`${endDate ?? "1970-01-01"}T00:00:00Z`);
  const dateOf = useCallback(
    (day: number) => end - (days - 1 - day) * DAY,
    [end, days],
  );
  const uptimes = useMemo(
    () => services.map((s) => uptimeOf(s, days)),
    [services, days],
  );
  const openIssues = services.filter(
    (s) => statusOf(s, days - 1) !== "up" && statusOf(s, days - 1) !== "none",
  );

  /** Realoca os vetores quando `days` muda (fora do render). */
  const ensureArrays = useCallback((count: number) => {
    const s = sim.current;
    if (s.weights.length !== count) {
      s.weights = new Float64Array(count).fill(1);
      s.target = new Float64Array(count).fill(1);
    }
  }, []);

  // Larguras são escritas direto nas barras, um flex-grow por barra.
  const paint = useCallback(() => {
    const s = sim.current;
    ensureArrays(s.weights.length ? s.weights.length : days);
    const rows = barsRef.current?.querySelectorAll<HTMLElement>("[data-row]");
    for (const row of rows ?? []) {
      const bars = row.children;
      for (let i = 0; i < bars.length && i < s.weights.length; i++) {
        (bars[i] as HTMLElement).style.flexGrow = s.weights[i].toFixed(3);
      }
    }
  }, [days, ensureArrays]);

  const tick = useCallback(
    (now: number) => {
      const s = sim.current;
      s.raf = 0;
      const dt = s.last ? Math.min((now - s.last) / 1000, 1 / 30) : 1 / 60;
      s.last = now;
      const k = 1 - Math.exp(-EASE * dt);
      let moving = false;
      for (let i = 0; i < s.weights.length; i++) {
        const gap = s.target[i] - s.weights[i];
        if (Math.abs(gap) > 0.002) {
          s.weights[i] += gap * k;
          moving = true;
        } else {
          s.weights[i] = s.target[i];
        }
      }
      paint();
      if (moving) {
        s.raf = requestAnimationFrame((time) => tickRef.current?.(time));
      } else {
        s.last = 0;
      }
    },
    [paint],
  );

  const focusOn = useCallback(
    (focus: number | null) => {
      const s = sim.current;
      ensureArrays(days);
      s.focus = focus;
      swell(s.weights.length, focus, s.target);
      if (s.reduceMotion) {
        s.weights.set(s.target);
        paint();
      } else if (!s.raf) {
        s.raf = requestAnimationFrame((time) => tickRef.current?.(time));
      }
    },
    [days, ensureArrays, paint],
  );

  useEffect(() => {
    tickRef.current = tick;
    const s = sim.current;
    s.reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    return () => cancelAnimationFrame(s.raf);
  }, [tick]);

  /** O dia sob o ponteiro, calculado contra o layout inchado. */
  const dayAt = (clientX: number) => {
    const rect = barsRef.current?.getBoundingClientRect();
    if (!rect) {
      return 0;
    }
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    const probe = new Float64Array(days);
    let day = Math.round(x * (days - 1));
    for (let pass = 0; pass < 3; pass++) {
      day = barAt(swell(days, day, probe), x);
    }
    return day;
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType !== "mouse" &&
      !event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      return;
    }
    const day = dayAt(event.clientX);
    setActive(day);
    focusOn(day);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    if (event.pointerType !== "mouse") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const day = dayAt(event.clientX);
    setActive(day);
    focusOn(day);
  };

  const handleClick = () => {
    if (active !== null) {
      setPinned((p) => (p === active ? null : active));
    }
  };

  const leave = () => {
    setActive(null);
    focusOn(pinned);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = active ?? pinned ?? days - 1;
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      Home: -days,
      End: days,
    };
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setPinned((p) => (p === from ? null : from));
      return;
    }
    if (event.key === "Escape") {
      setPinned(null);
      leave();
      return;
    }
    const move = moves[event.key];
    if (move === undefined) {
      return;
    }
    event.preventDefault();
    const day = clamp(from + move, 0, days - 1);
    setActive(day);
    focusOn(day);
  };

  const shownDay = active ?? pinned;
  const shownIncidents =
    shownDay === null
      ? []
      : services.flatMap((s) => {
          const incident = s.incidents?.[shownDay];
          return incident ? [{ service: s.name, incident }] : [];
        });
  let summary = "Passe o cursor sobre um dia para ver o que aconteceu";
  if (shownDay !== null) {
    const first = shownIncidents[0];
    const what = first
      ? `${first.service} ${first.incident.status === "down" ? "indisponível" : "degradado"} por ${first.incident.minutes} min${shownIncidents.length > 1 ? `, +${shownIncidents.length - 1} mais` : ""}`
      : "Nenhum incidente";
    summary = `${formatDay(dateOf(shownDay))} · ${what}`;
  }
  const pinnedIncidents =
    pinned === null
      ? []
      : services.flatMap((s) => {
          const incident = s.incidents?.[pinned];
          return incident ? [{ service: s.name, incident }] : [];
        });

  return (
    <div
      className={cn(
        "w-full select-none rounded-2xl border border-slate-200/80 bg-white p-5 text-[#191A23] shadow-xs dark:border-zinc-800 dark:bg-card dark:text-zinc-100",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium">{title}</p>
        {openIssues.length ? (
          <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
            <TriangleAlert aria-hidden className="size-4" />
            {openIssues.length}{" "}
            {openIssues.length > 1 ? "serviços afetados" : "serviço afetado"}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CircleCheck aria-hidden className="size-4" />
            Todos os sistemas operacionais
          </p>
        )}
      </div>
      <p
        aria-live="polite"
        className="mt-1 truncate text-sm tabular-nums text-[#7a7a7a] dark:text-zinc-400"
      >
        {summary}
      </p>

      <div
        aria-label={`Status diário dos últimos ${days} dias. Use as setas para navegar entre os dias e Enter para fixar um dia.`}
        aria-valuemax={days}
        aria-valuemin={1}
        aria-valuenow={(shownDay ?? days - 1) + 1}
        aria-valuetext={summary}
        className="mt-4 cursor-pointer touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onLostPointerCapture={leave}
        onPointerDown={handlePointerDown}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") {
            leave();
          }
        }}
        onPointerMove={handlePointerMove}
        ref={barsRef}
        role="slider"
        tabIndex={0}
      >
        <UptimeBars services={services} days={days} uptimes={uptimes} shownDay={shownDay} />
        <div className="mt-2 flex justify-between text-xs text-[#7a7a7a] dark:text-zinc-500">
          <span>{days} dias atrás</span>
          <span>Hoje</span>
        </div>
      </div>

      {/* Um dia fixado abre o registro de incidentes. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-[260ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
          pinned === null
            ? "grid-rows-[0fr] opacity-0"
            : "grid-rows-[1fr] opacity-100",
        )}
      >
        <div className="overflow-hidden">
          {pinned !== null && (
            <UptimeDayLog
              dayMs={dateOf(pinned)}
              incidents={pinnedIncidents}
              onClose={() => {
                setPinned(null);
                focusOn(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
