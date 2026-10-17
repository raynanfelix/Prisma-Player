"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, Gift, Inbox, LoaderCircle, Trash2 } from "lucide-react";

type Item = { id: string; title: string; message: string; action_label: string | null; action_url: string | null; read_at: string | null };

export default function InboxButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let active = true;
    void fetch("/api/account/inbox", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (active) setItems(data?.items ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function read(id: string) {
    await fetch("/api/account/inbox", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    setItems((current) => current.map((item) => (item.id === id ? { ...item, read_at: new Date().toISOString() } : item)));
  }

  async function dismiss(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    const response = await fetch("/api/account/inbox", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
    if (!response?.ok) {
      // Devolve à lista se o servidor recusar.
      void fetch("/api/account/inbox", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => setItems(data?.items ?? []))
        .catch(() => undefined);
    }
  }

  const unread = items.filter((item) => !item.read_at).length;
  // O sino lista apenas NÃO LIDAS: ler a mensagem a consome (o histórico
  // completo, lidas incluídas, vive em /dashboard/inbox). Antes itens lidos
  // continuavam listados no dropdown para sempre — "limpar" parecia não
  // funcionar.
  const unreadItems = items.filter((item) => !item.read_at);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Inbox"
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-transparent cursor-pointer shadow-xs transition-colors"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#B9FF66] px-1 text-[10px] font-bold text-[#191A23]">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 max-h-[460px] w-[min(380px,calc(100vw-24px))] overflow-y-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card p-3 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-2 px-1">
            <p className="text-sm font-bold text-[#191A23] dark:text-white flex items-center gap-2">
              <Inbox size={15} /> Inbox Prisma
            </p>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
              {unread} não lidas
            </span>
          </div>

          {loading ? (
            <LoaderCircle className="mx-auto my-8 animate-spin text-[#191A23] dark:text-[#B9FF66]" />
          ) : unreadItems.length === 0 ? (
            <p className="p-6 text-center text-xs font-medium text-slate-400 dark:text-zinc-500">
              Nenhuma notificação nova.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {unreadItems.slice(0, 5).map((item) => (
                <article
                  key={item.id}
                  className={`rounded-xl p-3.5 border transition-all ${
                    item.read_at
                      ? "border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-card"
                      : "border-[#B9FF66]/50 bg-[#B9FF66]/10 dark:bg-[#B9FF66]/5"
                  }`}
                >
                  <div className="flex gap-2.5">
                    <Gift size={16} className="mt-0.5 shrink-0 text-[#191A23] dark:text-[#B9FF66]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold text-[#191A23] dark:text-white truncate">{item.title}</p>
                        <button
                          type="button"
                          onClick={() => void dismiss(item.id)}
                          aria-label="Excluir mensagem"
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-transparent cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] font-medium text-slate-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                        {item.message}
                      </p>
                      {item.action_url && (
                        <Link
                          href={item.action_url}
                          onClick={() => {
                            setOpen(false);
                            void read(item.id);
                          }}
                          className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#191A23] dark:text-[#B9FF66] hover:underline"
                        >
                          <span>{item.action_label || "Abrir"}</span>
                          <ArrowRight size={12} />
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="mt-3 border-t border-slate-100 dark:border-zinc-800 pt-2 text-center">
            <Link
              href="/dashboard/inbox"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 py-1 text-xs font-bold text-[#191A23] dark:text-[#B9FF66] hover:underline"
            >
              <span>Ver todas as mensagens no Inbox</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
