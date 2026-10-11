"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Plan = { slug: string; name: string };

async function post(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string; warning?: string };
  if (!response.ok) throw new Error(data.error ?? "request_failed");
  return data;
}

/** Ações de suporte por conta. Toda mutação exige confirmação e gera trilha. */
export default function UserActions({ userId, plans, subStatus }: { userId: string; plans: Plan[]; subStatus: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [planSlug, setPlanSlug] = useState(plans[0]?.slug ?? "");
  const [delta, setDelta] = useState("50");
  const [reason, setReason] = useState("");

  async function run(label: string, task: () => Promise<{ warning?: string }>) {
    if (busy) return;
    if (!window.confirm(`${label} — confirmar?`)) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await task();
      setNotice(result.warning ?? "Feito.");
      router.refresh();
    } catch (error) {
      setNotice(`Falhou: ${error instanceof Error ? error.message : "erro"}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold themeable-text-ink-muted-48 hover:themeable-text-ink dark:border-zinc-800">Gerenciar</button>;
  }

  return (
    <div className="space-y-2 rounded-xl border p-3 themeable-border-hairline">
      <div className="flex items-center gap-2">
        <select value={planSlug} onChange={(event) => setPlanSlug(event.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] dark:border-zinc-800 dark:bg-card" aria-label="Plano">
          {plans.map((plan) => <option key={plan.slug} value={plan.slug}>{plan.name}</option>)}
        </select>
        <button type="button" disabled={busy} onClick={() => void run("Trocar plano (só na Prisma; conciliar na AbacatePay)", () => post("/api/admin/users/plan", { userId, planSlug }))} className="h-8 rounded-lg bg-selected px-2.5 text-[11px] font-bold text-selected-foreground disabled:opacity-40">Trocar plano</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {subStatus !== "suspended"
          ? <button type="button" disabled={busy} onClick={() => void run("Suspender acesso (só na Prisma)", () => post("/api/admin/users/status", { userId, action: "suspend" }))} className="h-8 rounded-lg border border-red-300 px-2.5 text-[11px] font-semibold text-red-600 dark:border-red-900">Suspender</button>
          : <button type="button" disabled={busy} onClick={() => void run("Reativar acesso por 30 dias", () => post("/api/admin/users/status", { userId, action: "reactivate" }))} className="h-8 rounded-lg border border-emerald-300 px-2.5 text-[11px] font-semibold text-emerald-600 dark:border-emerald-900">Reativar</button>}
        <button type="button" disabled={busy} onClick={() => void run("Estender trial em 14 dias", () => post("/api/admin/users/status", { userId, action: "trial_extend", days: 14 }))} className="h-8 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold dark:border-zinc-800">Trial +14d</button>
        <button type="button" disabled={busy} onClick={() => void run("Resetar trial (volta a disponível)", () => post("/api/admin/users/status", { userId, action: "trial_reset" }))} className="h-8 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold dark:border-zinc-800">Reset trial</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={delta} onChange={(event) => setDelta(event.target.value)} inputMode="numeric" className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-[11px] dark:border-zinc-800 dark:bg-card" aria-label="Créditos (+/-)" />
        <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo obrigatório" className="h-8 min-w-36 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] dark:border-zinc-800 dark:bg-card" aria-label="Motivo" />
        <button type="button" disabled={busy || !reason.trim()} onClick={() => void run(`Ajustar ${delta} créditos`, () => post("/api/admin/credits/adjust", { userId, delta: Number(delta), reason }))} className="h-8 rounded-lg bg-selected px-2.5 text-[11px] font-bold text-selected-foreground disabled:opacity-40">Aplicar</button>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] themeable-text-ink-muted-48" role="status">{busy ? "Enviando…" : notice}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] font-semibold themeable-text-ink-muted-48">Fechar</button>
      </div>
    </div>
  );
}
