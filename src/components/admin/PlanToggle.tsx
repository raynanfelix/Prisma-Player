"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminConfirm from "@/components/admin/AdminConfirm";

/** Liga/desliga plano no catálogo (vale para novos checkouts). */
export default function PlanToggle({ planId, isActive, planName }: { planId: string; isActive: boolean; planName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => setPending(true)}
        className={`h-7 rounded-full px-3 text-[11px] font-bold disabled:opacity-40 ${isActive ? "bg-selected text-selected-foreground" : "border border-slate-200 themeable-text-ink-muted-48 dark:border-zinc-800"}`}
      >
        {isActive ? "Ativo" : "Inativo"}
      </button>
      <AdminConfirm
        open={pending}
        title={`${isActive ? "Desativar" : "Ativar"} plano`}
        lines={[{ label: "Plano", value: planName }]}
        consequence={isActive ? "Some do checkout para novos clientes. Assinaturas ativas continuam." : "Volta a aparecer para novos checkouts."}
        confirmLabel={isActive ? "Desativar" : "Ativar"}
        danger={isActive}
        busy={busy}
        onConfirm={() => {
          setBusy(true);
          fetch("/api/admin/plans/toggle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId, isActive: !isActive }) })
            .then((response) => { if (!response.ok) throw new Error(); setPending(false); router.refresh(); })
            .catch(() => undefined)
            .finally(() => setBusy(false));
        }}
        onClose={() => { if (!busy) setPending(false); }}
      />
    </>
  );
}
