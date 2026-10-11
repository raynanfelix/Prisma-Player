"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Liga/desliga plano no catálogo (vale para novos checkouts). */
export default function PlanToggle({ planId, isActive, planName }: { planId: string; isActive: boolean; planName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (!window.confirm(`${isActive ? "Desativar" : "Ativar"} o plano ${planName}? Novos checkouts ${isActive ? "deixam" : "voltam a"} ver esse plano.`)) return;
        setBusy(true);
        fetch("/api/admin/plans/toggle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId, isActive: !isActive }) })
          .then((response) => { if (!response.ok) throw new Error(); router.refresh(); })
          .catch(() => undefined)
          .finally(() => setBusy(false));
      }}
      className={`h-7 rounded-full px-3 text-[11px] font-bold disabled:opacity-40 ${isActive ? "bg-selected text-selected-foreground" : "border border-slate-200 themeable-text-ink-muted-48 dark:border-zinc-800"}`}
    >
      {isActive ? "Ativo" : "Inativo"}
    </button>
  );
}
