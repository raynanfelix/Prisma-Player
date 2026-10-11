"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Check, FlaskConical, FolderPlus, Plus, Search, Trash2 } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import Dialog from "@/components/ui/Dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Metrics { impressions: number; plays: number; completed: number; reached75: number; playRate: number; completionRate: number; retention75: number }
interface Variant { id: string; video_id: string; weight: number; videos: { title: string } | { title: string }[] | null; metrics: Metrics }
interface Experiment { id: string; name: string; status: string; ab_test_variants: Variant[] }
interface TestFolder { id: string; name: string }
interface VideoItem { id: string; title: string; status: string }

export default function AbTestsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [folders, setFolders] = useState<TestFolder[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [query, setQuery] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [name, setName] = useState("");
  const [folderName, setFolderName] = useState("");
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmDialog, confirm] = useConfirm();

  const load = useCallback(async () => {
    const [testsResponse, videosResponse] = await Promise.all([fetch("/api/ab-tests", { cache: "no-store" }), fetch("/api/videos", { cache: "no-store" })]);
    const [testsData, videosData] = await Promise.all([testsResponse.json(), videosResponse.json()]);
    if (testsResponse.ok) { setFolders(testsData.folders ?? []); setExperiments(testsData.tests ?? []); }
    if (videosResponse.ok) setVideos((videosData.videos ?? []).filter((video: VideoItem) => video.status === "ready"));
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const visible = useMemo(() => experiments.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [experiments, query]);
  const videoTitle = (variant: Variant) => Array.isArray(variant.videos) ? variant.videos[0]?.title ?? "VSL" : variant.videos?.title ?? "VSL";

  async function createExperiment() {
    if (!name.trim() || selectedVideos.length < 2) return;
    setCreating(true);
    const response = await fetch("/api/ab-tests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "test", name: name.trim(), videoIds: selectedVideos }) });
    setCreating(false);
    if (response.ok) { setName(""); setSelectedVideos([]); setTestOpen(false); await load(); }
  }
  async function createFolder() { if (!folderName.trim()) return; const response = await fetch("/api/ab-tests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "folder", name: folderName.trim() }) }); if (response.ok) { setFolderName(""); setFolderOpen(false); await load(); } }
  async function removeTest(id: string) { if (!(await confirm({ title: "Excluir teste", description: "Excluir este teste e todas as métricas coletadas?" }))) return; const response = await fetch(`/api/ab-tests/${id}`, { method: "DELETE" }); if (response.ok) await load(); }
  async function copyEmbed(id: string) { const origin = window.location.origin; await navigator.clipboard.writeText(`<prisma-player data-prisma-player="${id}" data-mode="ab" data-title="Teste A/B Prisma" style="display:block;margin:0 auto;width:100%;position:relative;padding-top:56.25%;background:#000;overflow:hidden"></prisma-player>\n<script async src="${origin}/api/player-loader/${id}?v=4" data-prisma-loader="${id}"></script>`); setCopied(id); setTimeout(() => setCopied(null), 1600); }

  const headerActions = [
    { label: "Nova pasta", icon: <FolderPlus size={15} />, primary: false, onClick: () => setFolderOpen(true) },
    { label: "Novo teste", icon: <Plus size={15} />, primary: true, onClick: () => setTestOpen(true) }
  ];

  return <>
    <section className="dashboard-content flex flex-1 flex-col space-y-5">
      <PageHeader
        icon={<FlaskConical size={20} />}
        title="Testes A/B de VSL"
        actions={headerActions}
      />

      <div className="flex min-h-[430px] flex-1 flex-col rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-2 shadow-xs">
        {folders.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-b border-slate-100 dark:border-zinc-800 p-4">
            {folders.map((folder) => (
              <span key={folder.id} className="flex min-h-9 shrink-0 items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3.5 text-xs font-semibold text-slate-700 dark:text-zinc-300 shadow-xs">
                <FolderPlus size={14} className="text-slate-500 dark:text-zinc-400" />{folder.name}
              </span>
            ))}
          </div>
        )}
        <div className="flex border-b border-slate-100 dark:border-zinc-800 p-4 sm:justify-end">
          <label className="relative block w-full sm:w-[280px]">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
            <span className="sr-only">Pesquisar testes</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar testes A/B" className="h-9 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card pl-9 pr-3.5 text-xs font-medium text-[#191A23] dark:text-zinc-100 outline-none focus:border-[#B9FF66]" />
          </label>
        </div>
        {visible.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#B9FF66] text-[#191A23] shadow-xs">
              <FlaskConical size={28} />
            </div>
            <h3 className="mt-4 text-xl font-bold text-[#191A23] dark:text-white">Nenhum teste A/B ativo</h3>
            <p className="mt-1 max-w-md text-xs font-medium text-slate-500 dark:text-zinc-400">
              Selecione pelo menos duas VSLs publicadas. As métricas começam zeradas e crescem com visitantes reais.
            </p>
            <button type="button" onClick={() => setTestOpen(true)} className="mt-5 min-h-10 rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] px-5 text-xs font-bold text-[#191A23] shadow-xs transition-all cursor-pointer">
              Criar primeiro teste A/B
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {visible.map((test) => {
              const totals = test.ab_test_variants.reduce((sum, variant) => sum + variant.metrics.impressions, 0);
              return (
                <article key={test.id} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#B9FF66] text-[#191A23] shadow-xs">
                      <BarChart3 size={18} />
                    </div>
                    <button type="button" onClick={() => setExpanded(expanded === test.id ? null : test.id)} className="min-w-0 flex-1 text-left">
                      <h3 className="truncate text-sm font-bold text-[#191A23] dark:text-zinc-100">{test.name}</h3>
                      <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-zinc-400">{test.ab_test_variants.length} VSLs · {totals} impressões reais</p>
                    </button>
                    <span className="w-fit rounded-full bg-[#B9FF66] px-3 py-0.5 text-xs font-bold text-[#191A23]">Ativo</span>
                    <button type="button" onClick={() => void copyEmbed(test.id)} className="min-h-9 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3.5 text-xs font-semibold text-slate-700 dark:text-zinc-200 shadow-xs hover:bg-slate-50 dark:hover:bg-transparent cursor-pointer">
                      {copied === test.id ? "Embed copiado" : "Copiar embed A/B"}
                    </button>
                    <button type="button" onClick={() => void removeTest(test.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {expanded === test.id && (
                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      {test.ab_test_variants.map((variant) => (
                        <div key={variant.id} className="rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-card p-4">
                          <div className="flex items-center justify-between gap-3">
                            <h4 className="truncate text-xs font-bold text-[#191A23] dark:text-zinc-100">{videoTitle(variant)}</h4>
                            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Tráfego {variant.weight}%</span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {[["Impressões", variant.metrics.impressions], ["Play rate", `${variant.metrics.playRate.toFixed(1)}%`], ["Chegaram a 75%", `${variant.metrics.retention75.toFixed(1)}%`], ["Conclusão", `${variant.metrics.completionRate.toFixed(1)}%`]].map(([label, value]) => (
                              <div key={label} className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card p-2.5">
                                <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase">{label}</p>
                                <p className="mt-0.5 text-sm font-bold text-[#191A23] dark:text-zinc-100">{value}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-card">
                            <div className="h-full rounded-full bg-[#B9FF66] transition-[width]" style={{ width: `${variant.metrics.completionRate}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>

    <Dialog open={testOpen} onClose={() => setTestOpen(false)} title="Criar teste A/B real" description="Escolha de 2 a 10 VSLs publicadas. O tráfego será dividido automaticamente." size="lg" footer={<><button type="button" onClick={() => setTestOpen(false)} className="min-h-10 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300">Cancelar</button><button type="button" onClick={() => void createExperiment()} disabled={creating || !name.trim() || selectedVideos.length < 2} className="min-h-10 rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] px-5 text-xs font-bold text-[#191A23] shadow-xs disabled:opacity-40">{creating ? "Criando teste…" : `Criar com ${selectedVideos.length} VSLs`}</button></>}>
      <label className="block text-xs font-semibold text-[#191A23] dark:text-zinc-200">
        Nome do teste
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Oferta principal — julho" className="mt-2 h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3.5 text-xs font-medium text-[#191A23] dark:text-white outline-none focus:border-[#B9FF66]" />
      </label>
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-[#191A23] dark:text-zinc-200">Selecione as VSLs</p>
        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          {videos.map((video) => {
            const checked = selectedVideos.includes(video.id);
            return (
              <button type="button" key={video.id} onClick={() => setSelectedVideos((items) => checked ? items.filter((id) => id !== video.id) : items.length < 10 ? [...items, video.id] : items)} className={`flex min-h-10 w-full items-center gap-3 rounded-xl border px-3.5 text-left font-medium ${checked ? "border-slate-300 dark:border-zinc-700 bg-[#B9FF66] text-[#191A23] font-bold shadow-xs" : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-card text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-transparent"}`}>
                <span className={`grid h-4 w-4 place-items-center rounded border ${checked ? "bg-[#191A23] border-[#191A23] text-[#B9FF66]" : "bg-white dark:bg-card border-slate-300 dark:border-zinc-700"}`}>
                  {checked && <Check size={11} />}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">{video.title}</span>
              </button>
            );
          })}
          {videos.length < 2 && (
            <p className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-3 text-xs font-medium text-amber-900 dark:text-amber-300">
              Publique pelo menos duas VSLs antes de criar um teste.
            </p>
          )}
        </div>
      </div>
    </Dialog>

    <Dialog open={folderOpen} onClose={() => setFolderOpen(false)} title="Criar pasta de testes" size="sm" footer={<button type="button" onClick={() => void createFolder()} disabled={!folderName.trim()} className="min-h-10 rounded-xl bg-[#B9FF66] px-5 text-xs font-bold text-[#191A23] shadow-xs disabled:opacity-40">Criar pasta</button>}>
      <label className="block text-xs font-semibold text-[#191A23] dark:text-zinc-200">
        Nome
        <input value={folderName} onChange={(event) => setFolderName(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3.5 text-xs font-medium text-[#191A23] dark:text-white outline-none focus:border-[#B9FF66]" />
      </label>
    </Dialog>
    {confirmDialog}
  </>;
}
