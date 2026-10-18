import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { requireUser } from "@/lib/auth/server";
import { TicketReplyForm } from "@/features/support/components/TicketForms";
import { db, schema } from "@/lib/db";

const { supportCases, supportNotes } = schema;

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SupportNoteRow = { id: string | number; authorAdminId: string | null; body: string; createdAt: Date };
type NoteEntry = { divider: string } | { note: SupportNoteRow };

/**
 * Agrupamento por dia extraído do JSX: reatribuir `lastDay` durante o render
 * disparava o lint react-compiler ("Cannot reassign variable after render
 * completes"). Função pura no escopo do módulo — mesmo output do flatMap
 * original (divisor na virada de dia, na ordem das notas).
 */
function groupNotesByDay(notes: SupportNoteRow[], dayLabel: (date: Date) => string): NoteEntry[] {
  const out: NoteEntry[] = [];
  let lastDay = "";
  for (const note of notes) {
    const day = dayLabel(note.createdAt);
    if (day !== lastDay) {
      lastDay = day;
      out.push({ divider: day });
    }
    out.push({ note });
  }
  return out;
}

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
  const entries = groupNotesByDay(notes, dayLabel);

  return <main className="mx-auto w-full max-w-3xl space-y-5 pb-16">
    <header><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-prisma-blue dark:text-white">Ticket</p><h1 className="mt-1 text-[22px] font-semibold tracking-[-.03em] themeable-text-ink">{item.subject}</h1><p className="mt-1 text-[12px] themeable-text-ink-muted-48">{statusLabel[item.status] ?? item.status} · {item.category} · prioridade {item.priority}{lastReply ? ` · equipe respondeu em ${lastReply.toLocaleString("pt-BR")}` : ""}</p></header>
    <section aria-label="Conversa" className="space-y-3">
      {notes.length === 0 ? (
        <p className="rounded-2xl border p-5 text-center text-[13px] themeable-border-hairline themeable-text-ink-muted-48">Recebemos seu ticket. A equipe responde aqui mesmo — pode escrever abaixo se lembrar de mais detalhes.</p>
      ) : (
        <MessageScrollerProvider>
          <MessageScroller className="h-[min(65dvh,560px)] rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-card">
            <MessageScrollerViewport className="p-4">
              <MessageScrollerContent className="gap-4">
                {entries.map((entry, index) => {
                  if ("divider" in entry) {
                    return (
                      <MessageScrollerItem key={`day-${index}`}>
                        <Marker variant="separator" className="text-[11px] font-semibold">
                          <MarkerContent>{entry.divider}</MarkerContent>
                        </Marker>
                      </MessageScrollerItem>
                    );
                  }
                  const note = entry.note;
                  const mine = !note.authorAdminId;
                  return (
                    <MessageScrollerItem key={note.id}>
                      <Message align={mine ? "end" : "start"}>
                        <MessageAvatar
                          className={
                            mine
                              ? "size-7 min-w-0 bg-slate-200 text-[11px] font-bold text-slate-600 dark:bg-zinc-800 dark:text-zinc-300"
                              : "size-7 min-w-0 bg-[#B9FF66] text-[11px] font-bold text-[#191A23]"
                          }
                        >
                          {mine ? "V" : "P"}
                        </MessageAvatar>
                        <MessageContent>
                          <Bubble variant={mine ? "default" : "outline"} align={mine ? "end" : "start"}>
                            <BubbleContent>
                              {!mine && <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Equipe Prisma</p>}
                              <p className="text-[13px] leading-relaxed">{note.body}</p>
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {mine ? "Você" : "Suporte"} · {note.createdAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  );
                })}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      )}
    </section>
    {item.status !== "resolvido" ? <TicketReplyForm caseId={item.id} /> : <p className="rounded-2xl border p-4 text-center text-[13px] themeable-border-hairline themeable-text-ink-muted-48">Ticket resolvido. Precisa de mais ajuda? <Link href="/dashboard/support" className="font-semibold underline">Abra um novo</Link>.</p>}
    <p><Link href="/dashboard/support" className="text-[12px] font-semibold underline">← Todos os tickets</Link></p>
  </main>;
}
