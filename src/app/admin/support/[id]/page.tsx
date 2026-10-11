import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import { SupportCaseControls, SupportNoteForm, SupportReplyForm } from "@/components/admin/SupportForms";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AdminSupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const admin = createAdminClient();
  const { data: item } = await admin.from("support_cases").select("id,user_id,subject,category,priority,status,created_at,updated_at").eq("id", id).maybeSingle();
  if (!item) notFound();
  const [notes, account] = await Promise.all([
    admin.from("support_notes").select("id,author_admin_id,body,is_internal,created_at").eq("case_id", id).order("created_at", { ascending: true }).limit(200),
    item.user_id ? admin.from("profiles").select("id,email,full_name").eq("id", item.user_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const authorIds = [...new Set((notes.data ?? []).map((note) => note.author_admin_id).filter(Boolean))] as string[];
  const authors = authorIds.length ? await admin.from("profiles").select("id,email").in("id", authorIds) : { data: [] as Array<{ id: string; email: string }> };
  const authorEmail = new Map((authors.data ?? []).map((entry) => [entry.id, entry.email]));

  return <div>
    <AdminHeader title={item.subject} description={`Aberto em ${new Date(item.created_at).toLocaleString("pt-BR")} · atualizado ${new Date(item.updated_at).toLocaleString("pt-BR")}`} />
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <StatusPill value={item.status} />
      <span className="text-[12px] themeable-text-ink-muted-48">{item.category} · prioridade {item.priority}</span>
      {account.data && <Link href={`/admin/users/${account.data.id}`} className="text-[12px] font-semibold underline">{account.data.full_name || account.data.email}</Link>}
      <span className="ml-auto"><SupportCaseControls caseId={item.id} status={item.status} priority={item.priority} /></span>
    </div>
    <AdminPanel title="Conversa" description="Visível ao cliente e notas internas. Responder move o caso para em andamento."><div className="space-y-3 p-5">{(notes.data ?? []).map((note) => <div key={note.id} className="rounded-[14px] border p-4 themeable-border-hairline"><p className="text-[13px] leading-relaxed themeable-text-ink">{note.body}</p><p className="mt-2 text-[11px] themeable-text-ink-muted-48">{note.author_admin_id ? (authorEmail.get(note.author_admin_id) ?? "equipe") : "cliente"} · {note.is_internal ? "nota interna" : "visível ao cliente"} · {new Date(note.created_at).toLocaleString("pt-BR")}</p></div>)}
      {(notes.data ?? []).length === 0 && <p className="text-[12px] themeable-text-ink-muted-48">Sem mensagens ainda.</p>}</div><SupportReplyForm caseId={item.id} /><SupportNoteForm caseId={item.id} /></AdminPanel>
    <p className="mt-6 text-[12px] themeable-text-ink-muted-48"><Link href="/admin/support" className="font-semibold underline">← Voltar para suporte</Link></p>
  </div>;
}
