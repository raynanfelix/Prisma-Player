"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminConfirm from "@/components/admin/AdminConfirm";
import AdminSelect from "@/components/ui/custom/AdminSelect";

type Plan = { slug: string; name: string };
type Pending =
  | { kind: "plan" }
  | { kind: "suspend" }
  | { kind: "reactivate" }
  | { kind: "trial_extend" }
  | { kind: "trial_reset" }
  | { kind: "credits" };

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

/** Ações de suporte por conta, com modal de confirmação e motivo auditado. */
export default function UserActions({ userId, email, plans, subStatus }: { userId: string; email: string; plans: Plan[]; subStatus: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [planSlug, setPlanSlug] = useState(plans[0]?.slug ?? "");
  const [delta, setDelta] = useState("50");
  const [reason, setReason] = useState("");

  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    setNotice("");
    try {
      let result: { warning?: string } = {};
      if (pending.kind === "plan") result = await post("/api/admin/users/plan", { userId, planSlug, reason });
      else if (pending.kind === "credits") result = await post("/api/admin/credits/adjust", { userId, delta: Number(delta), reason });
      else if (pending.kind === "trial_extend") result = await post("/api/admin/users/status", { userId, action: "trial_extend", days: 14, reason });
      else result = await post("/api/admin/users/status", { userId, action: pending.kind, reason });
      setNotice(result.warning ?? "Feito.");
      setPending(null);
      router.refresh();
    } catch (error) {
      setNotice(`Falhou: ${error instanceof Error ? error.message : "erro"}`);
    } finally {
      setBusy(false);
    }
  }

  const meta: Record<Pending["kind"], { title: string; consequence: string; confirm: string; danger?: boolean }> = {
    plan: { title: "Trocar plano", consequence: "Vale só na Prisma. A cobrança na AbacatePay precisa de conciliação manual.", confirm: "Trocar plano" },
    suspend: { title: "Suspender conta", consequence: "Bloqueia produto, embed e analytics. Não apaga dados. Recorrência no provedor continua.", confirm: "Suspender", danger: true },
    reactivate: { title: "Reativar conta", consequence: "Reativa o acesso por 30 dias. Não reativa cobrança cancelada no provedor.", confirm: "Reativar" },
    trial_extend: { title: "Estender trial", consequence: "Trial ativo por mais 14 dias a partir do vencimento atual.", confirm: "Estender" },
    trial_reset: { title: "Resetar trial", consequence: "Volta para disponível. Use com critério: não contorna elegibilidade.", confirm: "Resetar", danger: true },
    credits: { title: "Ajustar créditos", consequence: "Movimento auditado no ledger. Saldo nunca fica negativo.", confirm: "Aplicar" },
  };

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold themeable-text-ink-muted-48 hover:themeable-text-ink dark:border-zinc-800">Gerenciar</button>;
  }

  return (
    <div className="space-y-2 rounded-xl border p-3 themeable-border-hairline">
      <div className="flex items-center gap-2">
        <AdminSelect label="Plano" value={planSlug} onChange={setPlanSlug} className="min-w-44 flex-1" options={plans.map((plan) => ({ value: plan.slug, label: plan.name }))} />
        <button type="button" onClick={() => { setReason(""); setPending({ kind: "plan" }); }} className="h-9 shrink-0 rounded-xl bg-selected px-3 text-[12px] font-bold text-selected-foreground">Trocar plano</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {subStatus === null ? (
          // Sem linha de assinatura (trial ou nunca assinou): suspender
          // falharia com subscription_not_found. Estado honesto no lugar.
          <span title="Sem assinatura ativa" className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold themeable-text-ink-muted-48 dark:border-zinc-800">Trial / sem assinatura</span>
        ) : subStatus !== "suspended" ? (
          <button type="button" onClick={() => { setReason(""); setPending({ kind: "suspend" }); }} className="h-8 rounded-lg border border-red-300 px-2.5 text-[11px] font-semibold text-red-600 dark:border-red-900">Suspender</button>
        ) : (
          <button type="button" onClick={() => { setReason(""); setPending({ kind: "reactivate" }); }} className="h-8 rounded-lg border border-emerald-300 px-2.5 text-[11px] font-semibold text-emerald-600 dark:border-emerald-900">Reativar</button>
        )}
        <button type="button" onClick={() => { setReason(""); setPending({ kind: "trial_extend" }); }} className="h-8 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold dark:border-zinc-800">Trial +14d</button>
        <button type="button" onClick={() => { setReason(""); setPending({ kind: "trial_reset" }); }} className="h-8 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold dark:border-zinc-800">Reset trial</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={delta} onChange={(event) => setDelta(event.target.value)} inputMode="numeric" className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-[11px] dark:border-zinc-800 dark:bg-card" aria-label="Créditos (+/-)" />
        <button type="button" onClick={() => { setReason(""); setPending({ kind: "credits" }); }} className="h-8 rounded-lg bg-selected px-2.5 text-[11px] font-bold text-selected-foreground">Créditos…</button>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] themeable-text-ink-muted-48" role="status">{notice}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] font-semibold themeable-text-ink-muted-48">Fechar</button>
      </div>
      {pending && (
        <AdminConfirm
          open
          title={meta[pending.kind].title}
          lines={[{ label: "Conta", value: email }, ...(pending.kind === "plan" ? [{ label: "Novo plano", value: planSlug }] : []), ...(pending.kind === "credits" ? [{ label: "Ajuste", value: delta }] : [])]}
          consequence={meta[pending.kind].consequence}
          confirmLabel={meta[pending.kind].confirm}
          danger={meta[pending.kind].danger}
          busy={busy}
          reasonRequired
          reason={reason}
          onReason={setReason}
          onConfirm={() => void confirm()}
          onClose={() => { if (!busy) setPending(null); }}
        />
      )}
    </div>
  );
}
