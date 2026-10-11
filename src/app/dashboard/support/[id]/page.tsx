import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TicketReplyForm } from "@/features/support/components/TicketForms";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Chat do ticket: mensagens do cliente + respostas da equipe. Notas internas ocultas. */
export default async function SupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const userId = await requireUser(`/dashboard/support/${id}`);
  const admin = createAdminClient();
  const { data: item } = await admin.from("support_cases").select("id,subject,category,priority,status,created_at,updated_at").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!item) notFound();
  const { data: notes } = await admin.from("support_notes").select("id,author_admin_id,body,created_at").eq("case_id", id).eq("is_internal", false).order("created_at", { ascending: true }).limit(200);
  const statusLabel: Record<string, string> = { aberto: "Aguardando atendimento", em_andamento: "Em atendimento pela equipe", aguardando_cliente: "Aguardando você", resolvido: "Resolvido" };

  return <main className="mx-auto w-full max-w-3xl space-y-5 pb-16">
    <header><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-prisma-blue dark:text-white">Ticket</p><h1 className="mt-1 text-[22px] font-semibold tracking-[-.03em] themeable-text-ink">{item.subject}</h1><p className="mt-1 text-[12px] themeable-text-ink-muted-48">{statusLabel[item.status] ?? item.status} · {item.category} · prioridade {item.priority}</p></header>
    <section aria-label="Conversa" className="space-y-3">
      {(notes ?? []).map((note) => {
        const mine = !note.author_admin_id;
        return <div key={note.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${mine ? "bg-selected text-selected-foreground" : "border bg-white themeable-border-hairline dark:bg-card"}`}>
            <p className="text-[13px] leading-relaxed">{note.body}</p>
            <p className={`mt-1 text-[10px] ${mine ? "opacity-70" : "themeable-text-ink-muted-48"}`}>{mine ? "Você" : "Equipe Prisma"} · {new Date(note.created_at).toLocaleTimeString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>;
      })}
      {(notes ?? []).length === 0 && <p className="rounded-2xl border p-5 text-center text-[13px] themeable-border-hairline themeable-text-ink-muted-48">Recebemos seu ticket. A equipe responde aqui mesmo — pode escrever abaixo se lembrar de mais detalhes.</p>}
    </section>
    {item.status !== "resolvido" ? <TicketReplyForm caseId={item.id} /> : <p className="rounded-2xl border p-4 text-center text-[13px] themeable-border-hairline themeable-text-ink-muted-48">Ticket resolvido. Precisa de mais ajuda? <Link href="/dashboard/support" className="font-semibold underline">Abra um novo</Link>.</p>}
    <p><Link href="/dashboard/support" className="text-[12px] font-semibold underline">← Todos os tickets</Link></p>
  </main>;
}
