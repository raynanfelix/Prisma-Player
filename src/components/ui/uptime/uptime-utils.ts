/**
 * Tipos e helpers puros do UptimeCard (kokonutui, MIT — adaptado Prisma).
 * Extraídos do componente para respeitar o teto de 350 linhas do repositório
 * (quality/max-lines) e manter a lógica de simulação testável isolada.
 */

/** Quanto mais larga a barra sob o ponteiro e o alcance do inchaço, em barras. */
const MAGNIFY = 5;
const SPREAD = 2.4;
/** Barras convergem para a largura alvo nesta taxa, por segundo. */
export const EASE = 18;
export const DAY = 86_400_000;

export type DayStatus = "up" | "degraded" | "down" | "none";

export interface IncidentUpdate {
  /** HH:MM, no fuso da página de status. */
  time: string;
  label: string;
  note?: string;
}

export interface Incident {
  title: string;
  status: Exclude<DayStatus, "up" | "none">;
  /** Minutos de impacto no dia. */
  minutes: number;
  updates: IncidentUpdate[];
}

export interface UptimeService {
  name: string;
  /** Incidentes por índice de dia, 0 sendo o dia mais antigo exibido. */
  incidents?: Record<number, Incident>;
  /** Dias sem dados (antes do serviço existir), a partir do início. */
  missing?: number;
}

export interface UptimeCardProps {
  title?: string;
  services?: UptimeService[];
  days?: number;
  /** Último dia exibido, como YYYY-MM-DD. */
  endDate?: string;
  className?: string;
}

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export const formatDay = (ms: number) =>
  new Date(ms).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });

export function statusOf(service: UptimeService, day: number): DayStatus {
  if (day < (service.missing ?? 0)) {
    return "none";
  }
  return service.incidents?.[day]?.status ?? "up";
}

/** Indisponibilidade conta integral; degradado pela metade. Sem dados → null. */
export function uptimeOf(service: UptimeService, days: number): number | null {
  const tracked = days - (service.missing ?? 0);
  if (tracked <= 0) {
    return null;
  }
  let lost = 0;
  for (const incident of Object.values(service.incidents ?? {})) {
    lost += incident.minutes * (incident.status === "down" ? 1 : 0.5);
  }
  return 100 * (1 - lost / (tracked * 1440));
}

/** Larguras alvo: inchaço ao redor do foco, plano sem foco. */
export function swell(count: number, focus: number | null, out: Float64Array) {
  for (let i = 0; i < count; i++) {
    out[i] =
      focus === null
        ? 1
        : 1 + MAGNIFY * Math.exp(-(((i - focus) / SPREAD) ** 2));
  }
  return out;
}

/** A barra sob x (0 a 1) quando as barras têm estas larguras. */
export function barAt(weights: Float64Array, x: number) {
  let total = 0;
  for (const w of weights) {
    total += w;
  }
  let at = x * total;
  for (let i = 0; i < weights.length; i++) {
    at -= weights[i];
    if (at <= 0) {
      return i;
    }
  }
  return weights.length - 1;
}

export const BAR_COLOR: Record<DayStatus, string> = {
  up: "bg-emerald-500 dark:bg-emerald-400",
  degraded: "bg-amber-400 dark:bg-amber-300",
  down: "bg-red-500 dark:bg-red-400",
  none: "bg-black/10 dark:bg-white/10",
};

export const STATUS_TEXT: Record<DayStatus, string> = {
  up: "Operacional",
  degraded: "Degradado",
  down: "Indisponível",
  none: "Sem dados",
};
