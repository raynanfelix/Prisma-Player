"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminSelect from "@/components/ui/custom/AdminSelect";

type Props = {
  query: string;
  plan: string;
  status: string;
  trial: string;
  plans: Array<{ slug: string; name: string }>;
};

/** Filtros da lista de contas com dropdowns próprios (filtros vivem na URL). */
export default function AdminUserFilters({ query, plan, status, trial, plans }: Props) {
  const router = useRouter();
  const [q, setQ] = useState(query);
  const [planValue, setPlanValue] = useState(plan);
  const [statusValue, setStatusValue] = useState(status);
  const [trialValue, setTrialValue] = useState(trial);

  function submit() {
    const current = new URLSearchParams();
    if (q.trim()) current.set("q", q.trim());
    if (planValue) current.set("plan", planValue);
    if (statusValue) current.set("status", statusValue);
    if (trialValue) current.set("trial", trialValue);
    const suffix = current.toString();
    router.push(`/admin/users${suffix ? `?${suffix}` : ""}`);
  }

  const selectClass = "min-w-44 flex-1 sm:flex-none";
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <input
        value={q}
        onChange={(event) => setQ(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
        placeholder="Nome, email ou UUID"
        maxLength={80}
        aria-label="Buscar conta"
        className="h-9 min-w-52 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-[12px] dark:border-zinc-800 dark:bg-card"
      />
      <AdminSelect label="Plano" value={planValue} onChange={setPlanValue} className={selectClass} options={[{ value: "", label: "Todos os planos" }, ...plans.map((item) => ({ value: item.slug, label: item.name }))]} />
      <AdminSelect label="Assinatura" value={statusValue} onChange={setStatusValue} className={selectClass} options={[{ value: "", label: "Qualquer assinatura" }, ...["active", "past_due", "suspended", "cancelled", "expired", "pending"].map((item) => ({ value: item, label: item })), { value: "none", label: "Sem assinatura" }]} />
      <AdminSelect label="Trial" value={trialValue} onChange={setTrialValue} className={selectClass} options={[{ value: "", label: "Qualquer trial" }, ...["available", "active", "used", "expired"].map((item) => ({ value: item, label: item }))]} />
      <button type="button" onClick={submit} className="h-9 rounded-xl bg-selected px-4 text-[12px] font-bold text-selected-foreground">Filtrar</button>
      {(query || plan || status || trial) && <Link href="/admin/users" className="grid h-9 place-items-center rounded-xl border border-slate-200 px-4 text-[12px] font-semibold dark:border-zinc-800">Limpar</Link>}
    </div>
  );
}
