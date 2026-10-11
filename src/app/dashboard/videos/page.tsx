"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CheckCircle2, Clock3, Code2, Copy, ExternalLink, FileVideo2, Folder, FolderPlus, MoreHorizontal, Pencil, Play, Plus, Search, Trash2, Upload, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/dashboard/EmptyState";
import PageHeader from "@/components/dashboard/PageHeader";
import Tabs from "@/components/dashboard/Tabs";
import Dialog from "@/components/ui/Dialog";
import AdminSelect from "@/components/ui/custom/AdminSelect";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useVideoUploads } from "@/features/videos/components/VideoUploadProvider";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { StoredVideo, VideoFolder } from "@/features/videos/model/types";
import { videosService } from "@/services/videos/client";

const statusByTab: Record<string, StoredVideo["status"] | undefined> = { published: "ready", drafts: "draft", processing: "processing" };
const PAGE_SIZE = 4;

export default function VideosPage() {
  const router = useRouter();
  const { tasks, startUpload } = useVideoUploads();
  const [activeTab, setActiveTab] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [videos, setVideos] = useState<StoredVideo[]>([]);
  const [folders, setFolders] = useState<VideoFolder[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [preparingUpload, setPreparingUpload] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [manageVideo, setManageVideo] = useState<StoredVideo | null>(null);
  const [manageMode, setManageMode] = useState<"rename" | "move">("rename");
  const [manageTitle, setManageTitle] = useState("");
  const [manageFolder, setManageFolder] = useState<string>("");
  const [page, setPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmDialog, confirm] = useConfirm();

  const load = useCallback(async () => {
    const [videosData, foldersData] = await Promise.all([
      videosService.list(),
      videosService.listFolders(),
    ]);
    setVideos(videosData.videos ?? []);
    setFolders(foldersData.folders ?? []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const refresh = () => void load();
    window.addEventListener("prisma:videos-changed", refresh);
    return () => { window.clearTimeout(timer); window.removeEventListener("prisma:videos-changed", refresh); };
  }, [load]);

  const visibleVideos = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return videos.filter((item) => (!selectedFolder || item.folder_id === selectedFolder) && (!statusByTab[activeTab] || item.status === statusByTab[activeTab]) && (!normalizedQuery || item.title.toLocaleLowerCase("pt-BR").includes(normalizedQuery)));
  }, [activeTab, query, selectedFolder, videos]);

  const pageCount = Math.max(1, Math.ceil(visibleVideos.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedVideos = useMemo(
    () => visibleVideos.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [visibleVideos, currentPage],
  );

  const filterKey = `${activeTab}|${query}|${selectedFolder ?? ""}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }

  const tabs = useMemo(() => [
    { id: "all", label: "Todos", count: videos.length },
    { id: "published", label: "Publicados", count: videos.filter((item) => item.status === "ready").length },
    { id: "drafts", label: "Rascunhos", count: videos.filter((item) => item.status === "draft").length },
    { id: "processing", label: "Processando", count: videos.filter((item) => item.status === "processing").length },
  ], [videos]);

  async function handleFile(file?: File) {
    if (!file || !file.type.startsWith("video/")) { notify("Escolha um arquivo de vídeo válido"); return; }
    if (file.size > 5 * 1024 ** 3) { notify("O limite por vídeo é 5 GB"); return; }
    setPreparingUpload(true);
    try {
      const video = await startUpload(file, selectedFolder);
      setVideos((current) => [{ ...video, signed_url: null, plays: 0, player_id: null, published: false }, ...current.filter((item) => item.id !== video.id)]);
      setImportOpen(false);
      setActiveTab("processing");
      notify("Upload iniciado. Você pode continuar usando a dashboard.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível iniciar o upload");
    } finally {
      setPreparingUpload(false);
    }
  }

  async function createFolder() {
    const name = folderName.trim(); if (!name) return;
    const data = await videosService.createFolder(name);
    setSelectedFolder(data.folder.id);
    setFolderName("");
    setFolderOpen(false);
    await load();
  }

  async function removeFolder(id: string) { if (!(await confirm({ title: "Excluir pasta", description: "Excluir esta pasta? Os vídeos voltarão para Todos." }))) return; await videosService.removeFolder(id); if (selectedFolder === id) setSelectedFolder(null); await load(); }

  function edit(video: StoredVideo) {
    if (!video.signed_url) return;
    sessionStorage.setItem("prisma-mvp-video", JSON.stringify({ id: video.id, name: video.title, src: video.signed_url, type: video.mime_type }));
    router.push("/studio");
  }

  async function removeVideo(video: StoredVideo) {
    if (!(await confirm({ title: "Excluir VSL", description: `Excluir "${video.title}" definitivamente? Esta ação não pode ser desfeita.` }))) return;
    await videosService.remove(video.id);
    notify("VSL excluída definitivamente");
    await load();
  }

  function notify(message: string) { setFeedback(message); window.setTimeout(() => setFeedback(""), 2400); }

  async function ensurePlayer(video: StoredVideo) {
    if (video.player_id && video.published) return video.player_id;
    notify("Publicando player…");
    try {
      const payload = await videosService.publishPlayer(video.id);
      setVideos((items) => items.map((item) => item.id === video.id ? { ...item, player_id: payload.playerConfig.id, published: true } : item));
      return payload.playerConfig.id;
    } catch {
      notify("Não foi possível publicar o player");
      return null;
    }
  }

  async function copyEmbed(video: StoredVideo) {
    const playerId = await ensurePlayer(video); if (!playerId) return;
    const origin = window.location.origin;
    const title = video.title.replace(/"/g, "&quot;");
    await navigator.clipboard.writeText(`<prisma-player data-prisma-player="${playerId}" data-title="${title}" style="display:block;margin:0 auto;width:100%;height:1px;position:relative;background:transparent;border:0;overflow:hidden"></prisma-player>\n<script async src="${origin}/api/player-loader/${playerId}?v=4" data-prisma-loader="${playerId}"></script>`);
    notify("Código de embed copiado");
  }

  async function openPlayer(video: StoredVideo) {
    const tab = window.open("about:blank", "_blank");
    const playerId = await ensurePlayer(video);
    if (!playerId) { tab?.close(); return; }
    if (tab) { tab.opener = null; tab.location.href = `/embed/${playerId}`; }
  }

  function startManage(video: StoredVideo, mode: "rename" | "move") {
    setManageVideo(video); setManageMode(mode); setManageTitle(video.title); setManageFolder(video.folder_id ?? "");
  }

  async function saveManage() {
    if (!manageVideo) return;
    const body = manageMode === "rename" ? { title: manageTitle.trim() } : { folderId: manageFolder || null };
    if (manageMode === "rename" && !manageTitle.trim()) return;
    await videosService.update(manageVideo.id, body);
    notify(manageMode === "rename" ? "Nome da VSL atualizado" : "VSL movida para a pasta escolhida");
    setManageVideo(null);
    await load();
  }

  async function duplicateVideo(video: StoredVideo) {
    notify("Duplicando VSL…");
    try {
      await videosService.duplicate(video.id);
      notify("VSL duplicada");
      await load();
    } catch {
      notify("Não foi possível duplicar a VSL");
    }
  }

  const actions = [
    { label: "Upload", icon: <Upload size={15} />, primary: false, onClick: () => setImportOpen(true) },
    { label: "Nova pasta", icon: <FolderPlus size={15} />, primary: false, onClick: () => setFolderOpen(true) },
    { label: "Adicionar vídeo", icon: <Plus size={15} />, primary: true, onClick: () => setImportOpen(true) }
  ];

  return <>
    <input ref={fileInputRef} type="file" accept="video/*" className="sr-only" onChange={(event) => { void handleFile(event.target.files?.[0]); event.target.value = ""; }} />
    <section className="videos-library-page dashboard-content flex min-w-0 flex-col space-y-5">
      <PageHeader icon={<Video size={20} />} title={selectedFolder ? folders.find((folder) => folder.id === selectedFolder)?.name ?? "Pasta" : "Meus vídeos"} actions={actions}>
        <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 shadow-xs">
          <span className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-zinc-400">
            <Video size={15} className="text-[#191A23] dark:text-[#B9FF66]" />Biblioteca
          </span>
          <strong className="mt-2 block text-2xl font-bold text-[#191A23] dark:text-white">{videos.length}</strong>
          <small className="text-slate-500 dark:text-zinc-400 font-medium">VSLs organizadas na conta</small>
        </article>
        
        <article className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 shadow-xs">
          <span className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-zinc-400">
            <CheckCircle2 size={15} className="text-emerald-500" />Publicadas
          </span>
          <strong className="mt-2 block text-2xl font-bold text-[#191A23] dark:text-white">{tabs.find((item) => item.id === "published")?.count ?? 0}</strong>
          <small className="text-slate-500 dark:text-zinc-400 font-medium">Players disponíveis nas páginas</small>
        </article>
        
        <article className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 shadow-xs">
          <span className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-zinc-400">
            <Clock3 size={15} className="text-amber-500" />Em andamento
          </span>
          <strong className="mt-2 block text-2xl font-bold text-[#191A23] dark:text-white">{tabs.find((item) => item.id === "processing")?.count ?? 0}</strong>
          <small className="text-slate-500 dark:text-zinc-400 font-medium">Uploads e processamento ativos</small>
        </article>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedFolder(null)}
            className={`flex min-h-9 shrink-0 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition-all cursor-pointer border ${
              !selectedFolder
                ? "border-slate-300 dark:border-zinc-700 bg-[#B9FF66] text-[#191A23] font-bold shadow-xs"
                : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-card text-slate-700 dark:text-zinc-300 hover:bg-[#B9FF66]/10 hover:text-[#191A23] dark:hover:text-white"
            }`}
          >
            <Folder size={15} />Todos
          </button>
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={`flex min-h-9 shrink-0 items-center rounded-xl border transition-all ${
                selectedFolder === folder.id
                  ? "border-slate-300 dark:border-zinc-700 bg-[#B9FF66] text-[#191A23] font-bold shadow-xs"
                  : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-card text-slate-700 dark:text-zinc-300 hover:bg-[#B9FF66]/10 hover:text-[#191A23] dark:hover:text-white"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedFolder(folder.id)}
                className="flex h-full items-center gap-2 pl-3.5 pr-1.5 text-xs font-bold text-[#191A23] dark:text-zinc-100"
              >
                <Folder size={15} />{folder.name}
              </button>
              <button
                type="button"
                onClick={() => void removeFolder(folder.id)}
                aria-label={`Excluir ${folder.name}`}
                className="flex h-8 w-8 items-center justify-center text-slate-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <label className="relative block w-full lg:w-[280px]">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <span className="sr-only">Buscar vídeo</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome da VSL"
            className="h-9 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card pl-9 pr-3.5 text-xs font-medium text-[#191A23] dark:text-zinc-100 outline-none transition focus:border-[#B9FF66]"
          />
        </label>
      </div>

      <div className="min-h-[360px] rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-[#191A23] dark:text-white">
              {selectedFolder ? folders.find((folder) => folder.id === selectedFolder)?.name : "Todos os vídeos"}
            </h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-zinc-400">
              {visibleVideos.length} resultado{visibleVideos.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex min-h-9 items-center gap-2 rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] px-4 text-xs font-bold text-[#191A23] shadow-xs transition-all cursor-pointer"
          >
            <Plus size={15} />Nova VSL
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {visibleVideos.length ? (
            <div className="overflow-visible">
              <div className="hidden grid-cols-[minmax(260px,1fr)_130px_100px_90px] gap-4 border-b border-slate-100 dark:border-zinc-800 px-3 pb-3 text-xs font-semibold uppercase text-slate-400 dark:text-zinc-500 md:grid">
                <span>VSL</span>
                <span>Criado em</span>
                <span>Plays</span>
                <span className="text-right">Ações</span>
              </div>
              {pagedVideos.map((item) => {
                const task = tasks.find((candidate) => candidate.videoId === item.id);
                const progress = task?.progress ?? (item.status === "ready" ? 100 : 0);
                return (
                  <article key={item.id} className="relative grid gap-4 border-b border-slate-100 dark:border-zinc-800 py-4 last:border-b-0 md:grid-cols-[minmax(260px,1fr)_130px_100px_90px] md:items-center md:px-3">
                    <button type="button" disabled={item.status !== "ready"} onClick={() => edit(item)} className="flex min-w-0 items-center gap-3 text-left disabled:cursor-wait">
                      <span className="relative grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-900 text-white md:h-12 md:w-20">
                        <Play size={16} fill="currentColor" />
                        {item.status === "processing" && (
                          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
                            <span className="block h-full bg-[#B9FF66] transition-[width]" style={{ width: `${progress}%` }} />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <strong className="block truncate text-sm font-bold text-[#191A23] dark:text-zinc-100">{item.title}</strong>
                        <small className="mt-0.5 block text-xs font-medium text-slate-500 dark:text-zinc-400">
                          {item.published ? "Publicado" : item.status === "ready" ? "Pronto para personalizar" : item.status === "processing" ? `Enviando e processando · ${progress}%` : item.status === "failed" ? "Falha no upload" : "Rascunho"}
                        </small>
                        {task?.error && <small className="mt-1 block text-red-500">{task.error}</small>}
                      </span>
                    </button>
                    <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 dark:bg-card p-3 md:contents">
                      <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">
                        <small className="mb-1 block uppercase tracking-wide md:hidden">Criado em</small>
                        {new Date(item.created_at).toLocaleDateString("pt-BR")}
                      </span>
                      <span className="text-sm font-bold text-[#191A23] dark:text-zinc-100">
                        <small className="mb-1 block text-[10px] font-normal uppercase tracking-wide text-slate-400 dark:text-zinc-500 md:hidden">Plays</small>
                        {item.plays ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-end gap-1 border-t border-slate-100 dark:border-zinc-800 pt-3 md:border-0 md:pt-0">
                      <button disabled={item.status !== "ready"} onClick={() => router.push(`/dashboard/analytics/${item.id}`)} title="Analytics" aria-label="Ver Analytics" className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-[#B9FF66] hover:text-[#191A23] dark:hover:bg-[#B9FF66] dark:hover:text-[#191A23] disabled:opacity-30 disabled:hover:bg-transparent">
                        <BarChart3 size={16} />
                      </button>
                      <button disabled={item.status !== "ready"} onClick={() => void copyEmbed(item)} title="Copiar embed" aria-label="Copiar código embed" className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-[#B9FF66] hover:text-[#191A23] dark:hover:bg-[#B9FF66] dark:hover:text-[#191A23] disabled:opacity-30 disabled:hover:bg-transparent">
                        <Code2 size={16} />
                      </button>

                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button disabled={item.status === "processing"} aria-label="Mais ações" className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-[#B9FF66] hover:text-[#191A23] dark:hover:bg-[#B9FF66] dark:hover:text-[#191A23] disabled:opacity-30 disabled:hover:bg-transparent"><MoreHorizontal size={17} /></button>
                          }
                        />
                        <DropdownMenuContent align="end" className="w-[230px] border border-slate-200 bg-white rounded-xl p-1.5 dark:border-zinc-800 dark:bg-card">
                          {[
                            { label: "Editar e personalizar", icon: Pencil, action: () => edit(item) },
                            { label: "Ver Analytics", icon: BarChart3, action: () => router.push(`/dashboard/analytics/${item.id}`) },
                            { label: "Copiar código embed", icon: Code2, action: () => void copyEmbed(item) },
                            { label: "Abrir player", icon: ExternalLink, action: () => void openPlayer(item) },
                            { label: "Renomear", icon: Pencil, action: () => startManage(item, "rename") },
                            { label: "Mover para pasta", icon: Folder, action: () => startManage(item, "move") },
                            { label: "Duplicar", icon: Copy, action: () => void duplicateVideo(item) },
                          ].map((actionItem) => (
                            <DropdownMenuItem key={actionItem.label} onClick={actionItem.action} className="flex items-center gap-2.5 rounded-lg cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-[#B9FF66] hover:text-[#191A23] focus:bg-[#B9FF66] focus:text-[#191A23] dark:text-zinc-200 dark:hover:bg-[#B9FF66] dark:hover:text-[#191A23] dark:focus:bg-[#B9FF66] dark:focus:text-[#191A23]">
                              <actionItem.icon size={15} />
                              <span>{actionItem.label}</span>
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuItem onClick={() => void removeVideo(item)} className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg cursor-pointer border-t border-slate-100 dark:border-zinc-800 mt-1 pt-2">
                            <Trash2 size={15} />
                            <span>Excluir VSL</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Video size={28} />}
              title="Nenhum vídeo encontrado"
              description="Seus vídeos salvos aparecerão aqui."
              actionLabel="Adicionar vídeo"
              onAction={() => setImportOpen(true)}
            />
          )}
        </div>
      </div>

      {feedback && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 rounded-xl bg-[#191A23] px-4 py-2.5 text-xs font-bold text-white shadow-lg dark:bg-white dark:text-[#191A23]">
          {feedback}
        </div>
      )}
    </section>

    {/* Dialog: Import Video */}
    <Dialog open={importOpen} onClose={() => { if (!preparingUpload) setImportOpen(false); }} title="Importar vídeo" description="Depois de escolher o arquivo, o envio continua em segundo plano e aparece em Processando." size="lg">
      <button type="button" disabled={preparingUpload} onClick={() => fileInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void handleFile(event.dataTransfer.files?.[0]); }} className="flex min-h-[300px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-card p-6 disabled:cursor-wait disabled:opacity-70">
        <FileVideo2 size={36} className="text-[#191A23] dark:text-[#B9FF66]" />
        <h3 className="mt-4 text-xl font-bold text-[#191A23] dark:text-white">Solte seu vídeo aqui</h3>
        <p className="mt-2 max-w-md text-center text-xs font-medium text-slate-500 dark:text-zinc-400">Uploads grandes usam multipart e vão direto para a nuvem. Limite padrão de 5 GB por arquivo.</p>
        <span className="mt-5 rounded-xl bg-[#B9FF66] px-5 py-2.5 text-xs font-bold text-[#191A23] shadow-xs">
          {preparingUpload ? "Preparando upload…" : "Escolher arquivo"}
        </span>
      </button>
    </Dialog>

    {/* Dialog: Folder */}
    <Dialog open={folderOpen} onClose={() => setFolderOpen(false)} title="Criar nova pasta" description="A pasta ficará clicável e poderá receber seus próprios vídeos." size="sm" footer={<button type="button" onClick={() => void createFolder()} disabled={!folderName.trim()} className="min-h-10 rounded-xl bg-[#B9FF66] px-5 text-xs font-bold text-[#191A23] shadow-xs disabled:opacity-40">Criar pasta</button>}>
      <label className="block text-xs font-semibold text-[#191A23] dark:text-zinc-200">
        Nome da pasta
        <input value={folderName} onChange={(event) => setFolderName(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3.5 text-xs font-medium text-[#191A23] dark:text-white outline-none focus:border-[#B9FF66]" />
      </label>
    </Dialog>

    {/* Dialog: Rename / Move */}
    <Dialog
      open={manageVideo !== null}
      onClose={() => setManageVideo(null)}
      title={manageMode === "rename" ? "Renomear VSL" : "Mover VSL para pasta"}
      description={manageMode === "rename" ? "Este é o nome exibido na biblioteca e no código embed." : "Escolha a pasta de destino. Os vídeos ficam agrupados por pasta na biblioteca."}
      size="sm"
      footer={
        <button
          type="button"
          onClick={() => void saveManage()}
          disabled={manageMode === "rename" && !manageTitle.trim()}
          className="min-h-10 rounded-xl bg-[#B9FF66] px-5 text-xs font-bold text-[#191A23] shadow-xs disabled:opacity-40"
        >
          {manageMode === "rename" ? "Salvar nome" : "Mover"}
        </button>
      }
    >
      {manageMode === "rename" ? (
        <label className="block text-xs font-semibold text-[#191A23] dark:text-zinc-200">
          Novo nome
          <input
            value={manageTitle}
            onChange={(event) => setManageTitle(event.target.value)}
            className="mt-2 h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3.5 text-xs font-medium text-[#191A23] dark:text-white outline-none focus:border-[#B9FF66]"
          />
        </label>
      ) : (
        <label className="block text-xs font-semibold text-[#191A23] dark:text-zinc-200">
          Pasta de destino
          <AdminSelect label="Pasta de destino" value={manageFolder} onChange={setManageFolder} className="mt-2 w-full" options={[{ value: "", label: "Sem pasta" }, ...folders.map((folder) => ({ value: folder.id, label: folder.name }))]} />
        </label>
      )}
    </Dialog>
    {confirmDialog}
  </>;
}
