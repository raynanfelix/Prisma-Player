"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminConfirm from "@/components/admin/AdminConfirm";
import AdminSelect from "@/components/ui/custom/AdminSelect";

async function post(path: string, body: Record<string, unknown>, method = "POST") {
  const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { error?: string; id?: string };
  if (!response.ok) throw new Error(data.error ?? "request_failed");
  return data;
}

export function SupportCaseForm({ userId }: { userId?: string }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("geral");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const input = "h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-xs dark:border-zinc-800 dark:bg-card";
  return (
    <form onSubmit={(event) => { event.preventDefault(); if (busy || subject.trim().length < 3) return; setBusy(true); setNotice(""); post("/api/admin/support/cases", { userId: userId || undefined, subject, category, priority }).then((data) => { router.push(`/admin/support/${data.id}`); }).catch((error: unknown) => { setNotice(`Falhou: ${error instanceof Error ? error.message : "erro"}`); setBusy(false); }); }} className="grid gap-2 p-5 sm:grid-cols-[1fr_160px_140px_auto]">
      <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={140} placeholder="Assunto do caso (mín. 3 letras)" className={input} aria-label="Assunto" />
      <AdminSelect label="Categoria" value={category} onChange={setCategory} options={["geral", "cobranca", "tecnico", "conta", "reembolso", "outro"].map((item) => ({ value: item, label: item }))} />
      <AdminSelect label="Prioridade" value={priority} onChange={setPriority} options={["baixa", "normal", "alta", "urgente"].map((item) => ({ value: item, label: item }))} />
      <button type="submit" disabled={busy} className="h-10 rounded-xl bg-selected px-4 text-xs font-bold text-selected-foreground disabled:opacity-40">Abrir caso</button>
      {notice && <p className="text-[12px] text-red-500 sm:col-span-4" role="alert">{notice}</p>}
    </form>
  );
}

export function SupportCaseControls({ caseId, status, priority }: { caseId: string; status: string; priority: string }) {
  const router = useRouter();
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  function update(patch: Record<string, unknown>) {
    setBusy(true);
    post("/api/admin/support/cases", { caseId, ...patch }).then(() => router.refresh()).catch(() => undefined).finally(() => setBusy(false));
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AdminSelect label="Status" value={status} onChange={(value) => update({ status: value })} className="min-w-44" options={["aberto", "em_andamento", "aguardando_cliente", "resolvido"].map((item) => ({ value: item, label: item }))} />
      <AdminSelect label="Prioridade" value={priority} onChange={(value) => update({ priority: value })} className="min-w-32" options={["baixa", "normal", "alta", "urgente"].map((item) => ({ value: item, label: item }))} />
      {status !== "resolvido" && <button type="button" onClick={() => setConfirmClose(true)} className="h-9 rounded-lg bg-selected px-3 text-[11px] font-bold text-selected-foreground">Encerrar</button>}
      <AdminConfirm open={confirmClose} title="Encerrar caso" lines={[{ label: "Caso", value: caseId.slice(0, 8) }]} consequence="Marca como resolvido. O histórico permanece." confirmLabel="Encerrar" busy={busy}
        onConfirm={() => { setBusy(true); post("/api/admin/support/cases", { caseId, status: "resolvido" }).then(() => { setConfirmClose(false); router.refresh(); }).catch(() => undefined).finally(() => setBusy(false)); }}
        onClose={() => { if (!busy) setConfirmClose(false); }} />
    </div>
  );
}

export function SupportNoteForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form onSubmit={(event) => { event.preventDefault(); if (busy || body.trim().length < 1) return; setBusy(true); post("/api/admin/support/notes", { caseId, body }).then(() => { setBody(""); router.refresh(); }).catch(() => undefined).finally(() => setBusy(false)); }} className="flex gap-2 p-5">
      <input value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder="Nota interna - nada aqui é enviado ao cliente" className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-xs dark:border-zinc-800 dark:bg-card" aria-label="Nota interna" />
      <button type="submit" disabled={busy || !body.trim()} className="h-10 rounded-xl bg-selected px-4 text-xs font-bold text-selected-foreground disabled:opacity-40">Anotar</button>
    </form>
  );
}

export function SupportReplyForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form onSubmit={(event) => { event.preventDefault(); if (busy || body.trim().length < 1) return; setBusy(true); post("/api/admin/support/notes", { caseId, body, reply: true }).then(() => { setBody(""); router.refresh(); }).catch(() => undefined).finally(() => setBusy(false)); }} className="flex gap-2 px-5 pb-5">
      <input value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder="Responder ao cliente - ele vê esta mensagem" className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-xs dark:border-zinc-800 dark:bg-card" aria-label="Responder ao cliente" />
      <button type="submit" disabled={busy || !body.trim()} className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold dark:border-zinc-800">Responder</button>
    </form>
  );
}
