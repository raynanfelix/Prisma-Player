import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AdminDelta } from "@/components/admin/AdminKit";

/**
 * AdminUi — implementações legadas com a MESMA assinatura de API, agora
 * renderizando a linguagem visual do redesign (spec: docs/specs/ADMIN_REDESIGN_SPEC.md).
 * Páginas antigas migram de aparência sem tocar em código; páginas novas usam
 * AdminKit diretamente.
 */

export function AdminHeader({ eyebrow = "Prisma Control", title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#8fd42e]">{eyebrow}</p>
        <h1 className="mt-1 text-[30px] font-bold tracking-[-.04em] themeable-text-ink">{title}</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed themeable-text-ink-muted-48">{description}</p>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

export function AdminMetric({ label, value, detail, icon: Icon, tone = "blue", delta }: { label: string; value: string; detail: string; icon: LucideIcon; tone?: "blue" | "green" | "amber" | "red"; delta?: number | null }) {
  const tones = {
    blue: "bg-slate-100 text-[#191A23] dark:bg-white/10 dark:text-white",
    green: "bg-[#B9FF66]/25 text-[#3f6a12] dark:text-[#B9FF66]",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
  } as const;
  return (
    <article className="animate-fade-in rounded-[22px] border bg-white p-5 themeable-border-hairline dark:bg-white/[0.035]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-medium themeable-text-ink-muted-48">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-[11px] ${tones[tone]}`}>
          <Icon size={17} aria-hidden />
        </span>
      </div>
      <strong className="mt-3 block text-[27px] font-bold tracking-[-.04em] themeable-text-ink">{value}</strong>
      <p className="mt-1.5 flex items-center gap-2 text-[11px] themeable-text-ink-muted-48">
        {delta !== undefined && delta !== null && <AdminDelta value={delta} />}
        {detail}
      </p>
    </article>
  );
}

export function AdminPanel({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="animate-fade-in overflow-hidden rounded-[22px] border bg-white themeable-border-hairline dark:bg-white/[0.035]">
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
          <div>
            <h2 className="text-[16px] font-bold tracking-[-.02em] themeable-text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-[12px] themeable-text-ink-muted-48">{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Pill de status com ponto (mesma semântica do pill antigo, visual novo). */
export function StatusPill({ value }: { value: string }) {
  const ok = ["active", "paid", "processed", "ready", "completed", "resolvido"].includes(value);
  const warning = ["pending", "processing", "creating", "received", "em_andamento", "aguardando_cliente"].includes(value);
  const dot = ok ? "bg-emerald-500" : warning ? "bg-amber-500" : "bg-red-500";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold capitalize text-slate-600 dark:text-zinc-300">
      <span className={`size-1.5 rounded-full ${ok ? "bg-emerald-500" : warning ? "bg-amber-500" : "bg-red-500"}`} aria-hidden />
      {value}
    </span>
  );
}