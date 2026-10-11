import type { LucideIcon } from "lucide-react";

export function AdminHeader({ eyebrow = "Prisma Control", title, description }: { eyebrow?: string; title: string; description: string }) {
  return <header className="mb-7"><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-prisma-blue">{eyebrow}</p><h1 className="mt-2 text-[28px] font-semibold tracking-[-.04em] themeable-text-ink">{title}</h1><p className="mt-1 max-w-2xl text-[13px] leading-relaxed themeable-text-ink-muted-48">{description}</p></header>;
}

export function AdminMetric({ label, value, detail, icon: Icon, tone = "blue" }: { label: string; value: string; detail: string; icon: LucideIcon; tone?: "blue" | "green" | "amber" | "red" }) {
  const tones = { blue: "bg-prisma-blue/10 text-prisma-blue", green: "bg-prisma-blue-on-dark/25 text-prisma-blue dark:text-white", amber: "bg-amber-500/10 text-amber-600", red: "bg-red-500/10 text-red-600" };
  return <article className="rounded-[18px] border bg-white p-5 themeable-border-hairline dark:bg-white/[0.035]"><div className="flex items-start justify-between gap-3"><p className="text-[12px] font-medium themeable-text-ink-muted-48">{label}</p><span className={`grid h-9 w-9 place-items-center rounded-[11px] ${tones[tone]}`}><Icon size={17} /></span></div><strong className="mt-3 block text-[27px] font-semibold tracking-[-.04em] themeable-text-ink">{value}</strong><p className="mt-1 text-[11px] themeable-text-ink-muted-48">{detail}</p></article>;
}

export function AdminPanel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-[20px] border bg-white themeable-border-hairline dark:bg-white/[0.035]"><header className="border-b px-5 py-4 themeable-border-hairline"><h2 className="text-[16px] font-semibold themeable-text-ink">{title}</h2>{description && <p className="mt-1 text-[12px] themeable-text-ink-muted-48">{description}</p>}</header>{children}</section>;
}

export function StatusPill({ value }: { value: string }) {
  const ok = ["active", "paid", "processed", "ready"].includes(value);
  const warning = ["pending", "processing", "creating", "received"].includes(value);
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${ok ? "bg-emerald-500/10 text-emerald-600" : warning ? "bg-amber-500/10 text-amber-600" : "bg-red-500/10 text-red-600"}`}>{value}</span>;
}
