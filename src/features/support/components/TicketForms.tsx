"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminSelect from "@/components/ui/custom/AdminSelect";

async function post(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { error?: string; id?: string };
  if (!response.ok) throw new Error(data.error ?? "request_failed");
  return data;
}

/** Abre ticket vinculado à própria conta, com prioridade. */
export function TicketForm() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("geral");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <form onSubmit={(event) => { event.preventDefault(); if (busy || subject.trim().length < 3) return; setBusy(true); setNotice(""); post("/api/support/cases", { subject, category, priority }).then((data) => router.push(`/dashboard/support/${data.id}`)).catch((error: unknown) => { setNotice("Não foi possível criar o chamado. Tente novamente."); setBusy(false); }); }} className="grid gap-3">
      <div>
        <label htmlFor="ticket-subject" className="mb-1 block text-[12px] font-semibold">O que está acontecendo?</label>
        <input id="ticket-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={140} placeholder="Ex.: meu embed parou de carregar" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm dark:border-zinc-800 dark:bg-card" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><span className="mb-1 block text-[12px] font-semibold">Assunto</span><AdminSelect label="Assunto" value={category} onChange={setCategory} options={[{ value: "geral", label: "Dúvida geral" }, { value: "tecnico", label: "Problema técnico" }, { value: "cobranca", label: "Cobrança" }, { value: "conta", label: "Minha conta" }, { value: "reembolso", label: "Reembolso" }, { value: "outro", label: "Outro" }]} /></div>
        <div><span className="mb-1 block text-[12px] font-semibold">Prioridade</span><AdminSelect label="Prioridade" value={priority} onChange={setPriority} options={[{ value: "baixa", label: "Baixa" }, { value: "normal", label: "Normal" }, { value: "alta", label: "Alta" }, { value: "urgente", label: "Urgente" }]} /></div>
      </div>
      <button type="submit" disabled={busy || subject.trim().length < 3} className="h-11 rounded-xl bg-selected px-4 text-sm font-bold text-selected-foreground disabled:opacity-40">Abrir ticket</button>
      {notice && <p className="text-[13px] text-red-500" role="alert">{notice}</p>}
    </form>
  );
}

/** Resposta do cliente no próprio ticket. */
export function TicketReplyForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form onSubmit={(event) => { event.preventDefault(); if (busy || body.trim().length < 1) return; setBusy(true); post("/api/support/notes", { caseId, body }).then(() => { setBody(""); router.refresh(); }).catch(() => undefined).finally(() => setBusy(false)); }} className="flex gap-2">
      <input value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder="Escreva sua mensagem…" aria-label="Sua mensagem" className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-sm dark:border-zinc-800 dark:bg-card" />
      <button type="submit" disabled={busy || !body.trim()} className="h-11 shrink-0 rounded-xl bg-selected px-4 text-sm font-bold text-selected-foreground disabled:opacity-40">Enviar</button>
    </form>
  );
}
