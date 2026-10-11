"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminConfirm from "@/components/admin/AdminConfirm";

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/team/role", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "request_failed");
}

export default function TeamRoleButtons({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setPending(true)} className="rounded-lg border border-red-300 px-2.5 py-1 text-[11px] font-semibold text-red-600 dark:border-red-900">Remover acesso</button>
      <AdminConfirm open={pending} title="Remover acesso administrativo" lines={[{ label: "Conta", value: email }]} consequence="Perde /admin e APIs na hora. Não afeta os dados dela." confirmLabel="Remover acesso" danger busy={busy}
        onConfirm={() => { setBusy(true); post({ userId, role: "user" }).then(() => { setPending(false); router.refresh(); }).catch(() => undefined).finally(() => setBusy(false)); }}
        onClose={() => { if (!busy) setPending(false); }} />
    </>
  );
}
