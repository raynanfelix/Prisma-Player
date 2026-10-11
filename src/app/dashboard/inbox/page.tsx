"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Clock,
  ExternalLink,
  Gift,
  Inbox as InboxIcon,
  Mail,
  MailOpen,
  Search,
  Shield,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import PageHeader from "@/components/dashboard/PageHeader";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface InboxItem {
  id: string;
  kind: string;
  title: string;
  message: string;
  action_label: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
}

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "system" | "tips">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDialog, confirm] = useConfirm();

  const loadInbox = useCallback(async () => {
    try {
      const res = await fetch("/api/account/inbox", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setItems(data.items ?? []);
        if (data.items?.length > 0 && !selectedId) {
          setSelectedId(data.items[0].id);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    // A promise resolve após o paint, evitando cascata de setState sincronizado.
    void (async () => {
      await loadInbox();
    })();
  }, [loadInbox]);

  const markAsRead = async (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read_at: new Date().toISOString() } : item))
    );
    await fetch("/api/account/inbox", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };

  const markAllAsRead = async () => {
    setItems((prev) =>
      prev.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() }))
    );
    await fetch("/api/account/inbox", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
  };

  const deleteMessage = async (id: string) => {
    const nextList = items.filter((item) => item.id !== id);
    setItems(nextList);
    if (selectedId === id) {
      setSelectedId(nextList[0]?.id ?? null);
    }
    await fetch("/api/account/inbox", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };

  const clearAllMessages = async () => {
    if (!(await confirm({ title: "Excluir todas as mensagens", description: "Tem certeza que deseja excluir todas as mensagens da caixa de entrada?" }))) return;
    setItems([]);
    setSelectedId(null);
    await fetch("/api/account/inbox", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clearAll: true }),
    });
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        !search.trim() ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.message.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (activeTab === "unread") return !item.read_at;
      if (activeTab === "system") return item.kind === "alert" || item.kind === "system" || item.kind === "trial";
      if (activeTab === "tips") return item.kind === "welcome" || item.kind === "tip";

      return true;
    });
  }, [items, search, activeTab]);

  const selectedItem = useMemo(() => {
    return items.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null;
  }, [items, selectedId, filteredItems]);

  const unreadCount = items.filter((item) => !item.read_at).length;
  const systemCount = items.filter((item) => item.kind === "alert" || item.kind === "system" || item.kind === "trial").length;

  const getKindBadge = (kind: string) => {
    switch (kind) {
      case "alert":
        return { label: "Alerta do Sistema", bg: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/50", icon: AlertTriangle };
      case "trial":
        return { label: "Conta & Teste", bg: "bg-[#B9FF66]/20 dark:bg-[#B9FF66]/10 text-[#191A23] dark:text-[#B9FF66] border-[#B9FF66]/40", icon: Shield };
      case "tip":
        return { label: "Dica & Recursos", bg: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50", icon: Sparkles };
      case "welcome":
        return { label: "Boas-vindas", bg: "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-900/50", icon: Gift };
      default:
        return { label: "Notificação", bg: "bg-slate-100 dark:bg-card text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700", icon: Bell };
    }
  };

  return (
    <>
      <section className="dashboard-content flex flex-1 flex-col space-y-5 pb-12">
      <PageHeader
        icon={<InboxIcon size={20} />}
        title="Inbox & Notificações"
      />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-zinc-400">
              <Mail size={15} className="text-[#191A23] dark:text-[#B9FF66]" />
              Total de Mensagens
            </span>
            <strong className="mt-2 block text-2xl font-bold text-[#191A23] dark:text-white">
              {items.length}
            </strong>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 dark:bg-card text-[#191A23] dark:text-white font-bold">
            {items.length}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-zinc-400">
              <MailOpen size={15} className="text-[#191A23] dark:text-[#B9FF66]" />
              Não Lidas
            </span>
            <strong className="mt-2 block text-2xl font-bold text-[#191A23] dark:text-white">
              {unreadCount}
            </strong>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#B9FF66] text-[#191A23] font-bold text-sm">
            {unreadCount}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-zinc-400">
              <AlertTriangle size={15} className="text-amber-500" />
              Alertas & Sistema
            </span>
            <strong className="mt-2 block text-2xl font-bold text-[#191A23] dark:text-white">
              {systemCount}
            </strong>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold">
            {systemCount}
          </div>
        </article>
      </div>

      {/* Main Inbox Workspace */}
      <div className="grid gap-5 lg:grid-cols-12 min-h-[540px]">
        {/* Left Column: Filter & Message List */}
        <div className="lg:col-span-5 flex flex-col rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-4 shadow-xs">
          {/* Filter Bar & Controls */}
          <div className="space-y-3 pb-3 border-b border-slate-100 dark:border-zinc-800">
            {/* Search Input */}
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar mensagens..."
                className="h-9 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card pl-9 pr-3.5 text-xs font-medium text-[#191A23] dark:text-white outline-none focus:border-[#B9FF66]"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "all", label: "Todas" },
                { id: "unread", label: "Não lidas", count: unreadCount },
                { id: "system", label: "Sistema" },
                { id: "tips", label: "Dicas" },
              ].map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer border ${
                      active
                        ? "bg-[#B9FF66] text-[#191A23] font-bold border-slate-300 dark:border-zinc-700 shadow-xs"
                        : "bg-slate-50 dark:bg-card text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-800 hover:text-[#191A23] dark:hover:text-white"
                    }`}
                  >
                    <span>{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className="rounded-full bg-[#191A23] px-1.5 py-0.2 text-[10px] font-bold text-[#B9FF66]">
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={markAllAsRead}
                disabled={unreadCount === 0}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-[#191A23] dark:hover:text-white disabled:opacity-40 cursor-pointer"
              >
                <CheckCheck size={14} /> Marcar todas como lidas
              </button>
              <button
                type="button"
                onClick={clearAllMessages}
                disabled={items.length === 0}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 cursor-pointer"
              >
                <Trash2 size={14} /> Limpar inbox
              </button>
            </div>
          </div>

          {/* List of Messages */}
          <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1 max-h-[480px]">
            {loading ? (
              <div className="p-8 text-center text-xs font-medium text-slate-400 dark:text-zinc-500">
                Carregando caixa de entrada...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center text-xs font-medium text-slate-400 dark:text-zinc-500">
                Nenhuma mensagem encontrada nesta categoria.
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedId === item.id;
                const isUnread = !item.read_at;
                const badge = getKindBadge(item.kind);
                const IconComponent = badge.icon;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      if (isUnread) void markAsRead(item.id);
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                      isSelected
                        ? "border-[#B9FF66] bg-[#B9FF66]/10 dark:bg-[#B9FF66]/5 shadow-xs"
                        : isUnread
                        ? "border-slate-300 dark:border-zinc-700 bg-slate-50/80 dark:bg-card font-semibold"
                        : "border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-card hover:bg-slate-50 dark:hover:bg-transparent"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs ${badge.bg}`}>
                          <IconComponent size={14} />
                        </span>
                        <h4 className={`text-xs truncate ${isUnread ? "font-bold text-[#191A23] dark:text-white" : "font-semibold text-slate-700 dark:text-zinc-300"}`}>
                          {item.title}
                        </h4>
                      </div>

                      {isUnread && (
                        <span className="h-2 w-2 rounded-full bg-[#B9FF66] shrink-0 mt-1" title="Não lida" />
                      )}
                    </div>

                    <p className="mt-1.5 text-[11px] font-medium text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>

                    <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {new Date(item.created_at).toLocaleDateString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${badge.bg}`}>
                        {badge.label}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Message Reader Detail View */}
        <div className="lg:col-span-7 flex flex-col rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 shadow-xs">
          {selectedItem ? (
            <div className="flex flex-1 flex-col justify-between space-y-6">
              <div className="space-y-5">
                {/* Header info */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-5">
                  <div className="space-y-2">
                    {(() => {
                      const badge = getKindBadge(selectedItem.kind);
                      const IconComp = badge.icon;
                      return (
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${badge.bg}`}>
                          <IconComp size={14} />
                          {badge.label}
                        </span>
                      );
                    })()}
                    <h2 className="text-xl font-bold text-[#191A23] dark:text-white leading-tight">
                      {selectedItem.title}
                    </h2>
                    <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-zinc-500">
                      <span>Remetente: <strong className="text-[#191A23] dark:text-zinc-200">Equipe Prisma Player</strong></span>
                      <span>•</span>
                      <span>{new Date(selectedItem.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void deleteMessage(selectedItem.id)}
                    title="Excluir mensagem"
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-card text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Body Content */}
                <div className="rounded-xl border border-slate-100 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-card p-5">
                  <p className="text-sm font-medium text-[#191A23] dark:text-zinc-200 leading-relaxed whitespace-pre-line">
                    {selectedItem.message}
                  </p>
                </div>
              </div>

              {/* Action Bar Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-zinc-800 pt-5">
                {selectedItem.action_url ? (
                  <Link
                    href={selectedItem.action_url}
                    onClick={() => void markAsRead(selectedItem.id)}
                    className="flex min-h-10 items-center gap-2 rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] px-5 text-xs font-bold text-[#191A23] shadow-xs transition-all"
                  >
                    <span>{selectedItem.action_label || "Acessar funcionalidade"}</span>
                    <ExternalLink size={14} />
                  </Link>
                ) : (
                  <div />
                )}

                {!selectedItem.read_at && (
                  <button
                    type="button"
                    onClick={() => void markAsRead(selectedItem.id)}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-transparent cursor-pointer"
                  >
                    <Check size={14} /> Marcar como lida
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-card text-slate-400 dark:text-zinc-500">
                <Mail size={32} />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#191A23] dark:text-white">Nenhuma mensagem selecionada</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400 max-w-xs">
                Selecione uma mensagem da lista ao lado para ler seu conteúdo completo e tomar ações.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
      {confirmDialog}
    </>
  );
}