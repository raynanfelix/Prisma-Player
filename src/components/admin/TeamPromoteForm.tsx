"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminConfirm from "@/components/admin/AdminConfirm";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function TeamPromoteForm() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 p-5">
      <input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="UUID da conta" maxLength={36} className="h-10 min-w-64 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-xs dark:border-zinc-800 dark:bg-card" aria-label="UUID da conta" />
      <button type="button" disabled={!uuid.test(userId.trim())} onClick={() => setPending(true)} className="h-10 rounded-xl bg-selected px-4 text-xs font-bold text-selected-foreground disabled:opacity-40">Promover a admin</button>
      {notice && <p className="w-full text-[12px] text-red-500" role="alert">{notice}</p>}
      <AdminConfirm open={pending} title="Promover a administrador" lines={[{ label: "Conta", value: userId.trim() }]} consequence="Acesso total imediato: dados de todos os clientes, billing e suporte." confirmLabel="Promover" danger busy={busy}
        onConfirm={() => {
          setBusy(true);
          fetch("/api/admin/team/role", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: userId.trim(), role: "admin" }) })
            .then(async (response) => { if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "request_failed"); setPending(false); setUserId(""); setNotice(""); router.refresh(); })
            .catch((error: unknown) => setNotice(`Falhou: ${error instanceof Error ? error.message : "erro"}`))
            .finally(() => setBusy(false));
        }}
        onClose={() => { if (!busy) setPending(false); }} />
    </div>
  );
}
