import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";
import { TicketReplyForm } from "@/features/support/components/TicketForms";
import { db, schema } from "@/lib/db";

const { supportCases, supportNotes } = schema;

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Chat do ticket: mensagens do cliente + respostas da equipe. Notas internas ocultas. */
export default async function SupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const userId = await requireUser(`/dashboard/support/${id}`);
  const [item] = await db
    .select({
      id: supportCases.id,
      subject: supportCases.subject,
      category: supportCases.category,
      priority: supportCases.priority,
      status: supportCases.status,
    })
    .from(supportCases)
    .where(and(eq(supportCases.id, id), eq(supportCases.userId, userId)))
    .limit(1);
  if (!item) notFound();
  const notes = await db
    .select({
      id: supportNotes.id,
      authorAdminId: supportNotes.authorAdminId,
      body: supportNotes.body,
      createdAt: supportNotes.createdAt,
    })
    .from(supportNotes)
    .where(and(eq(supportNotes.caseId, id), eq(supportNotes.isInternal, false)))
    .orderBy(asc(supportNotes.createdAt))
    .limit(200);
  const statusLabel: Record<string, string> = { aberto: "Aguardando atendimento", em_andamento: "Em atendimento pela equipe", aguardando_cliente: "Aguardando você", resolvido: "Resolvido" };
  const teamReplies = notes.filter((note) => note.authorAdminId);
  const lastReply = teamReplies.length ? teamReplies[teamReplies.length - 1].createdAt : null;

  const dayLabel = (date: Date) => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Hoje";
    if (date.toDateString() === yesterday.toDateString()) return "Ontem";
    return date.toLocaleDateString("pt-BR");
  };
  let lastDay = "";

  return <main className="mx-auto w-full max-w-3xl space-y-5 pb-16">
    <header><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-prisma-blue dark:text-white">Ticket</p><h1 className="mt-1 text-[22px] font-semibold tracking-[-.03em] themeable-text-ink">{item.subject}</h1><p className="mt-1 text-[12px] themeable-text-ink-muted-48">{statusLabel[item.status] ?? item.status} · {item.category} · prioridade {item.priority}{lastReply ? ` · equipe respondeu em ${lastReply.toLocaleString("pt-BR")}` : ""}</p></header>
    <section aria-label="Conversa" className="space-y-3">
      {notes.flatMap((note) => {
        const day = dayLabel(note.createdAt);
        const divider = day !== lastDay ? [{ divider: (lastDay = day) }] : [];
        return [...divider, { note }];
      }).map((entry, index) => {
        if ("divider" in entry) return <p key={`day-${index}`} className="pt-1 text-center text-[11px] font-semibold themeable-text-ink-muted-48">{entry.divider}</p>;
        const note = entry.note;
        const mine = !note.authorAdminId;
        return <div key={note.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
          {!mine && <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-[#B9FF66] text-[11px] font-bold text-[#191A23]">P</span>}
          <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${mine ? "bg-selected text-selected-foreground" : "border bg-white themeable-border-hairline dark:bg-card"}`}>
            {!mine && <p className="mb-1 text-[10px] font-bold uppercase tracking-wide themeable-text-ink-muted-48">Equipe Prisma</p>}
            <p className="text-[13px] leading-relaxed">{note.body}</p>
            <p className={`mt-1 text-[10px] ${mine ? "opacity-70" : "themeable-text-ink-muted-48"}`}>{mine ? "Você" : "Suporte"} · {note.createdAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
          {mine && <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">V</span>}
        </div>;
      })}
      {notes.length === 0 && <p className="rounded-2xl border p-5 text-center text-[13px] themeable-border-hairline themeable-text-ink-muted-48">Recebemos seu ticket. A equipe responde aqui mesmo — pode escrever abaixo se lembrar de mais detalhes.</p>}
    </section>
    {item.status !== "resolvido" ? <TicketReplyForm caseId={item.id} /> : <p className="rounded-2xl border p-4 text-center text-[13px] themeable-border-hairline themeable-text-ink-muted-48">Ticket resolvido. Precisa de mais ajuda? <Link href="/dashboard/support" className="font-semibold underline">Abra um novo</Link>.</p>}
    <p><Link href="/dashboard/support" className="text-[12px] font-semibold underline">← Todos os tickets</Link></p>
  </main>;
}
