"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import AdminSelect from "@/components/ui/custom/AdminSelect";

const platforms = ["google-aio", "chatgpt", "perplexity", "gemini", "copilot"] as const;

async function post(body: Record<string, unknown>, method = "POST") {
  const response = await fetch("/api/admin/seo/targets", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error((await response.json().catch(() => ({})) as { error?: string }).error ?? "request_failed");
}

export function SeoTargetForm() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form onSubmit={(event) => { event.preventDefault(); if (!keyword.trim() || busy) return; setBusy(true); post({ keyword }).then(() => { setKeyword(""); router.refresh(); }).catch(() => undefined).finally(() => setBusy(false)); }} className="flex gap-2 p-5">
      <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Ex.: melhor player de VSL" maxLength={200} className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-xs dark:border-zinc-800 dark:bg-card" aria-label="Nova palavra-chave" />
      <button type="submit" disabled={busy || !keyword.trim()} className="h-10 rounded-xl bg-selected px-4 text-xs font-bold text-selected-foreground disabled:opacity-40">Adicionar</button>
    </form>
  );
}

export function SeoCheckForm({ targetId }: { targetId: string }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<string>(platforms[0]);
  const [runs, setRuns] = useState("3");
  const [cited, setCited] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <form onSubmit={(event) => { event.preventDefault(); if (busy) return; setBusy(true); post({ targetId, platform, cited, runs: Number(runs) }).then(() => router.refresh()).catch(() => undefined).finally(() => setBusy(false)); }} className="flex flex-wrap items-center gap-2">
      <AdminSelect label="Plataforma" value={platform} onChange={setPlatform} className="min-w-36" options={platforms.map((item) => ({ value: item, label: item }))} />
      <AdminSelect label="Execuções" value={runs} onChange={setRuns} className="min-w-24" options={["1", "3", "5"].map((item) => ({ value: item, label: `${item}x` }))} />
      <label className="flex items-center gap-1.5 text-[11px] font-semibold"><input type="checkbox" checked={cited} onChange={(event) => setCited(event.target.checked)} className="h-4 w-4 accent-[#B9FF66]" /> Citado</label>
      <button type="submit" disabled={busy} className="h-8 rounded-lg bg-selected px-2.5 text-[11px] font-bold text-selected-foreground disabled:opacity-40">Registrar</button>
    </form>
  );
}
