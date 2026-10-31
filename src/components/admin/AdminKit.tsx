import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import NumberTicker from "@/components/motion/number-ticker";

/**
 * AdminKit — primitivos do redesign do painel (spec: docs/specs/ADMIN_REDESIGN_SPEC.md).
 * Cards brancos arredondados sobre canvas-parchment, KPI hero com gradiente de
 * marca, pills de status com ponto. Sem paletas paralelas: só tokens da Prisma.
 */

export function AdminGreeting({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[30px] font-bold tracking-[-.04em] themeable-text-ink">{title}</h1>
        <p className="mt-1 text-[13px] themeable-text-ink-muted-48">{subtitle}</p>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

export function AdminCard({ title, description, action, children, className = "" }: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-[22px] border bg-white themeable-border-hairline dark:bg-white/[0.035] ${className}`}>
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
          <div>
            <h2 className="text-[16px] font-bold tracking-[-.02em] themeable-text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-[12px] themeable-text-ink-muted-48">{description}</p>}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Delta percentual estilo referência (↑ 8% this month). */
export function AdminDelta({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${up ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={up ? "" : "rotate-180"}>
        <path d="M5 1.5 8.5 6H1.5z" fill="currentColor" />
      </svg>
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

/** KPI card. variant="hero" = gradiente de marca (receita principal). */
export function AdminKpi({ label, value, delta, detail, icon: Icon, variant = "default", numericValue, index = 0 }: {
  label: string;
  value: string;
  delta?: number | null;
  detail?: string;
  icon?: LucideIcon;
  variant?: "default" | "hero";
  numericValue?: number;
  index?: number;
}) {
  if (variant === "hero") {
    return (
      <article className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[#1c2b10] via-[#2c4a15] to-[#7db328] p-5 text-white shadow-[0_18px_40px_-18px_rgba(25,26,35,.45)]">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[12px] font-semibold text-white/85">{label}</p>
          {Icon && <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-white/15"><Icon size={17} className="text-[#B9FF66]" aria-hidden /></span>}
        </div>
        <strong className="mt-3 block text-[30px] font-bold tracking-[-.04em]">
          {numericValue !== undefined ? <NumberTicker value={numericValue} delay={index * 0.06} /> : value}
        </strong>
        {detail && <p className="mt-1 text-[11px] text-white/70">{detail}</p>}
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#B9FF66]/25 blur-2xl" />
      </article>
    );
  }
  return (
    <article className="rounded-[22px] border bg-white p-5 themeable-border-hairline dark:bg-white/[0.035]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-medium themeable-text-ink-muted-48">{label}</p>
        {Icon && <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-slate-100 text-[#191A23] dark:bg-white/10 dark:text-white"><Icon size={17} aria-hidden /></span>}
      </div>
      <strong className="mt-3 block text-[27px] font-bold tracking-[-.04em] themeable-text-ink">
        {numericValue !== undefined ? <NumberTicker value={numericValue} delay={index * 0.06} /> : value}
      </strong>
      <p className="mt-1.5 flex items-center gap-2 text-[11px] themeable-text-ink-muted-48">
        {delta !== undefined && <AdminDelta value={delta} />}
        {detail}
      </p>
    </article>
  );
}

/** Pill de status com ponto colorido (Completed / Pending / In Progress). */
export function AdminDotPill({ label, tone }: { label: string; tone: "ok" | "warn" | "bad" | "info" }) {
  const tones = {
    ok: "bg-emerald-500",
    warn: "bg-amber-500",
    bad: "bg-red-500",
    info: "bg-blue-500",
  } as const;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-zinc-300">
      <span className={`size-1.5 rounded-full ${tones[tone]}`} aria-hidden />
      {label}
    </span>
  );
}

/** Mapeia status de domínio → tone do pill (mesma semântica do StatusPill antigo). */
export function dotToneFor(value: string): "ok" | "warn" | "bad" | "info" {
  if (["active", "paid", "processed", "ready", "completed", "validado"].includes(value)) return "ok";
  if (["pending", "processing", "creating", "received", "investigating", "new"].includes(value)) return "warn";
  if (["failed", "expired", "cancelled", "refunded", "reopened", "past_due"].includes(value)) return "bad";
  return "info";
}
