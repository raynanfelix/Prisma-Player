"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminConfirm from "@/components/admin/AdminConfirm";

/** Ativa assinatura a partir de um checkout pago sem assinatura (conciliação). */
export default function OrphanActivateButton({ userId, email, planSlug, planName }: { userId: string; email: string; planSlug: string; planName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <button type="button" onClick={() => { setReason(""); setPending(true); }} className="rounded-lg bg-selected px-2.5 py-1 text-[11px] font-bold text-selected-foreground">Ativar</button>
      <AdminConfirm open={pending} title="Ativar assinatura" lines={[{ label: "Conta", value: email }, { label: "Plano", value: `${planName} (+30 dias)` }]} consequence="Cria a assinatura ativa a partir do checkout pago. Não mexe no provedor." confirmLabel="Ativar" busy={busy} reasonRequired reason={reason} onReason={setReason}
        onConfirm={() => { setBusy(true); fetch("/api/admin/users/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, planSlug, reason }) }).then((response) => { if (!response.ok) throw new Error(); setPending(false); router.refresh(); }).catch(() => undefined).finally(() => setBusy(false)); }}
        onClose={() => { if (!busy) setPending(false); }} />
    </>
  );
}
