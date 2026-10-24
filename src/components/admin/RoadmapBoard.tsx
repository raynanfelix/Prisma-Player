"use client";

import { useCallback, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
  type KanbanItem,
} from "@/components/kibo-ui/kanban";
import Dialog from "@/components/ui/Dialog";
import AdminConfirm from "@/components/admin/AdminConfirm";
import {
  ROADMAP_STAGE_LABELS,
  ROADMAP_STAGES,
  type RoadmapStage,
} from "@/lib/admin/roadmap";

export type RoadmapTask = {
  id: string;
  title: string;
  description: string | null;
  requesterName: string | null;
  stage: string;
  createdAt: string;
  updatedAt: string;
};

const COLUMNS: Array<{ id: RoadmapStage; name: string; color: string }> = [
  { id: "backlog", name: ROADMAP_STAGE_LABELS.backlog, color: "#6B7280" },
  { id: "faremos", name: ROADMAP_STAGE_LABELS.faremos, color: "#F59E0B" },
  { id: "preparando", name: ROADMAP_STAGE_LABELS.preparando, color: "#3B82F6" },
  { id: "pronto", name: ROADMAP_STAGE_LABELS.pronto, color: "#10B981" },
];

const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs outline-none focus:border-selected dark:border-zinc-800 dark:bg-card";

function toKanbanItem(task: RoadmapTask): KanbanItem {
  return { ...task, column: task.stage };
}

function TaskCardFace({ task, onDelete }: { task: RoadmapTask; onDelete?: (task: RoadmapTask) => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="m-0 truncate text-sm font-medium text-[#191A23] dark:text-white">{task.title}</p>
        {task.description ? <p className="m-0 line-clamp-2 text-[11px] text-slate-500 dark:text-zinc-400">{task.description}</p> : null}
        <p className="m-0 text-[10px] text-slate-400 dark:text-zinc-500">
          {shortDate.format(new Date(task.createdAt))}
          {task.requesterName ? ` · por ${task.requesterName}` : ""}
        </p>
      </div>
      {onDelete ? (
        <button
          type="button"
          aria-label={`Excluir ${task.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(task);
          }}
          className="shrink-0 rounded-lg p-1 text-slate-300 hover:bg-red-50 hover:text-red-500 dark:text-zinc-600 dark:hover:bg-red-500/10"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export default function RoadmapBoard({ initialTasks }: { initialTasks: RoadmapTask[] }) {
  const [tasks, setTasks] = useState<RoadmapTask[]>(initialTasks);
  const [notice, setNotice] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTask, setDeleteTask] = useState<RoadmapTask | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ title: "", description: "", requesterName: "", stage: "backlog" as RoadmapStage });

  const refreshList = useCallback(async () => {
    const response = await fetch("/api/admin/roadmap", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { tasks?: RoadmapTask[] };
    if (response.ok && Array.isArray(data.tasks)) setTasks(data.tasks);
  }, []);

  const moveTask = useCallback(
    (next: KanbanItem[]) => {
      const previous = tasks;
      const moved = next.find((item) => previous.find((p) => p.id === item.id)?.stage !== item.column);
      if (!moved) return;
      setTasks(next.map((item) => ({ ...(item as unknown as RoadmapTask), stage: item.column })));
      fetch(`/api/admin/roadmap/${moved.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: moved.column }),
      })
        .then(async (response) => {
          if (!response.ok) {
            const data = (await response.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error ?? "task_move_failed");
          }
        })
        .catch((error: unknown) => {
          setTasks(previous);
          setNotice(`Falha ao mover: ${error instanceof Error ? error.message : "erro"}`);
        });
    },
    [tasks],
  );

  function submitTask(event: React.FormEvent) {
    event.preventDefault();
    if (busy || form.title.trim().length < 3) return;
    setBusy(true);
    setNotice("");
    fetch("/api/admin/roadmap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(data.error ?? "task_create_failed");
        setAddOpen(false);
        setForm({ title: "", description: "", requesterName: "", stage: "backlog" });
        return refreshList();
      })
      .catch((error: unknown) => {
        setNotice(`Falhou: ${error instanceof Error ? error.message : "erro"}`);
      })
      .finally(() => setBusy(false));
  }

  function confirmDelete() {
    if (!deleteTask) return;
    setBusy(true);
    fetch(`/api/admin/roadmap/${deleteTask.id}`, { method: "DELETE" })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(data.error ?? "task_delete_failed");
        setDeleteTask(null);
        return refreshList();
      })
      .catch((error: unknown) => {
        setNotice(`Falha ao excluir: ${error instanceof Error ? error.message : "erro"}`);
      })
      .finally(() => setBusy(false));
  }

  const kanbanItems = tasks.map(toKanbanItem);

  return (
    <div className="flex min-h-[70dvh] flex-col gap-3">
      {notice ? (
        <p className="m-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400" role="alert">
          {notice}
        </p>
      ) : null}
      <KanbanProvider
        columns={COLUMNS}
        data={kanbanItems}
        onDataChange={(next) => moveTask(next)}
        overlay={(item) => {
          const task = tasks.find((entry) => entry.id === item.id);
          return task ? <TaskCardFace task={task} /> : null;
        }}
      >
        {(column) => (
          <KanbanBoard id={column.id} key={column.id}>
            <KanbanHeader>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: column.color }} />
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">{column.name}</span>
                <span className="rounded-full bg-slate-200 px-2 text-[10px] font-bold text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {tasks.filter((task) => task.stage === column.id).length}
                </span>
              </div>
              {column.id === "backlog" ? (
                <button
                  type="button"
                  onClick={() => { setAddOpen(true); setNotice(""); }}
                  className="flex h-8 items-center gap-1 rounded-lg bg-selected px-2.5 text-[11px] font-bold text-selected-foreground hover:opacity-90"
                >
                  <Plus className="size-3.5" />
                  Adicionar task
                </button>
              ) : null}
            </KanbanHeader>
            <KanbanCards id={column.id}>
              {(item) => {
                const task = tasks.find((entry) => entry.id === item.id);
                if (!task) return null;
                return (
                  <KanbanCard key={task.id} id={task.id} column={task.stage} name={task.title}>
                    <TaskCardFace task={task} onDelete={(target) => setDeleteTask(target)} />
                  </KanbanCard>
                );
              }}
            </KanbanCards>
          </KanbanBoard>
        )}
      </KanbanProvider>

      <Dialog
        open={addOpen}
        onClose={() => { if (!busy) setAddOpen(false); }}
        title="Adicionar task ao roadmap"
        description="Descreva o que você quer que o agente faça. As tasks entram na coluna escolhida e os admins movem pelos estágios."
        footer={
          <>
            <button type="button" onClick={() => setAddOpen(false)} disabled={busy} className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold dark:border-zinc-800">Cancelar</button>
            <button type="submit" form="roadmap-add-form" disabled={busy || form.title.trim().length < 3} className="h-10 rounded-xl bg-selected px-4 text-xs font-bold text-selected-foreground disabled:opacity-40">
              {busy ? "Adicionando..." : "Adicionar"}
            </button>
          </>
        }
      >
        <form id="roadmap-add-form" onSubmit={submitTask} className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Título</span>
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              maxLength={200}
              placeholder="Ex.: Exportar métricas do player em CSV"
              className={inputClass}
              autoFocus
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Descrição (opcional)</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              maxLength={2000}
              rows={3}
              placeholder="Detalhe o pedido: contexto, objetivo, onde mora no produto..."
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs outline-none focus:border-selected dark:border-zinc-800 dark:bg-card"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Solicitado por (opcional)</span>
              <input
                value={form.requesterName}
                onChange={(event) => setForm((prev) => ({ ...prev, requesterName: event.target.value }))}
                maxLength={80}
                placeholder="Quem quer isso"
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Coluna inicial</span>
              <select
                value={form.stage}
                onChange={(event) => setForm((prev) => ({ ...prev, stage: event.target.value as RoadmapStage }))}
                className={inputClass}
              >
                {ROADMAP_STAGES.map((stage) => (
                  <option key={stage} value={stage}>{ROADMAP_STAGE_LABELS[stage]}</option>
                ))}
              </select>
            </label>
          </div>
          {notice && addOpen ? (
            <p className="m-0 text-[12px] font-semibold text-red-500" role="alert">{notice}</p>
          ) : null}
        </form>
      </Dialog>

      <AdminConfirm
        open={Boolean(deleteTask)}
        title="Excluir task"
        lines={deleteTask ? [{ label: "Task", value: deleteTask.title.slice(0, 60) }] : []}
        consequence="A task sai do kanban para sempre. Não há como desfazer."
        confirmLabel="Excluir"
        danger
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => { if (!busy) setDeleteTask(null); }}
      />
    </div>
  );
}
