import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { AdminHeader, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import { SupportCaseControls, SupportNoteForm, SupportReplyForm } from "@/components/admin/SupportForms";
import { db, schema } from "@/lib/db";

const { profiles, supportCases, supportNotes } = schema;

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AdminSupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const [caseRow] = await db
    .select({
      id: supportCases.id,
      userId: supportCases.userId,
      subject: supportCases.subject,
      category: supportCases.category,
      priority: supportCases.priority,
      status: supportCases.status,
      createdAt: supportCases.createdAt,
      updatedAt: supportCases.updatedAt,
    })
    .from(supportCases)
    .where(eq(supportCases.id, id))
    .limit(1);
  if (!caseRow) notFound();
  const notes = await db
    .select({
      id: supportNotes.id,
      authorAdminId: supportNotes.authorAdminId,
      body: supportNotes.body,
      isInternal: supportNotes.isInternal,
      createdAt: supportNotes.createdAt,
    })
    .from(supportNotes)
    .where(eq(supportNotes.caseId, id))
    .orderBy(asc(supportNotes.createdAt))
    .limit(200);
  const account = caseRow.userId
    ? (await db.select({ id: profiles.id, email: profiles.email, fullName: profiles.fullName }).from(profiles).where(eq(profiles.id, caseRow.userId)).limit(1))[0] ?? null
    : null;
  const authorIds = [...new Set(notes.map((note) => note.authorAdminId).filter(Boolean))] as string[];
  const authors = authorIds.length ? await db.select({ id: profiles.id, email: profiles.email }).from(profiles).where(inArray(profiles.id, authorIds)) : [];
  const authorEmail = new Map(authors.map((entry) => [entry.id, entry.email]));
  const handledBy = [...notes].reverse().find((note) => note.authorAdminId)?.authorAdminId;
  const handledByEmail = handledBy ? authorEmail.get(handledBy) : null;

  return <div>
    <AdminHeader title={caseRow.subject} description={`Aberto em ${caseRow.createdAt.toLocaleString("pt-BR")} · atualizado ${caseRow.updatedAt.toLocaleString("pt-BR")}`} />
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <StatusPill value={caseRow.status} />
      <span className="text-[12px] themeable-text-ink-muted-48">{caseRow.category} · prioridade {caseRow.priority}{handledByEmail ? ` · atendido por ${handledByEmail}` : ""}</span>
      {account && <Link href={`/admin/users/${account.id}`} className="text-[12px] font-semibold underline">{account.fullName || account.email}</Link>}
      <span className="ml-auto"><SupportCaseControls caseId={caseRow.id} status={caseRow.status} priority={caseRow.priority} /></span>
    </div>
    <AdminPanel title="Conversa" description="Visível ao cliente e notas internas. Responder move o caso para em andamento."><div className="space-y-3 p-5">{notes.map((note) => <div key={note.id} className={`rounded-[14px] border p-4 ${note.isInternal ? "border-amber-500/30 bg-amber-500/[0.04] themeable-border-hairline" : "themeable-border-hairline"}`}><p className="text-[13px] leading-relaxed themeable-text-ink">{note.body}</p><p className="mt-2 text-[11px] themeable-text-ink-muted-48">{note.authorAdminId ? (authorEmail.get(note.authorAdminId) ?? "equipe") : "cliente"} · {note.isInternal ? "nota interna (só equipe)" : "visível ao cliente"} · {note.createdAt.toLocaleString("pt-BR")}</p></div>)}
      {notes.length === 0 && <p className="text-[12px] themeable-text-ink-muted-48">Sem mensagens ainda.</p>}</div><SupportReplyForm caseId={caseRow.id} /><SupportNoteForm caseId={caseRow.id} /></AdminPanel>
    <p className="mt-6 text-[12px] themeable-text-ink-muted-48"><Link href="/admin/support" className="font-semibold underline">← Voltar para suporte</Link></p>
  </div>;
}
