import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TicketForm } from "@/features/support/components/TicketForms";

export const dynamic = "force-dynamic";

/** Ajuda: meus tickets + abrir novo. Só casos da própria conta. */
export default async function SupportPage() {
  const userId = await requireUser("/dashboard/support");
  const admin = createAdminClient();
  const { data: cases } = await admin.from("support_cases").select("id,subject,category,priority,status,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(50);
  const statusLabel: Record<string, string> = { aberto: "Aguardando atendimento", em_andamento: "Em atendimento", aguardando_cliente: "Aguardando você", resolvido: "Resolvido" };
  return <main className="mx-auto w-full max-w-3xl space-y-6 pb-16">
    <header><h1 className="text-[24px] font-semibold tracking-[-.03em] themeable-text-ink">Ajuda e tickets</h1><p className="mt-1 text-[13px] themeable-text-ink-muted-48">Abra um ticket e acompanhe a resposta da equipe aqui mesmo.</p></header>
    <section className="rounded-[20px] border bg-white p-5 themeable-border-hairline dark:bg-card"><h2 className="mb-3 text-[15px] font-semibold themeable-text-ink">Novo ticket</h2><TicketForm /></section>
    <section className="rounded-[20px] border bg-white themeable-border-hairline dark:bg-card">
      <h2 className="border-b px-5 py-4 text-[15px] font-semibold themeable-text-ink themeable-border-hairline">Meus tickets</h2>
      <div className="divide-y divide-slate-100 dark:divide-zinc-800/60">
        {(cases ?? []).map((item) => <Link key={item.id} href={`/dashboard/support/${item.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-black/[0.02] dark:hover:bg-transparent"><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold themeable-text-ink">{item.subject}</span><span className="text-[11px] themeable-text-ink-muted-48">{statusLabel[item.status] ?? item.status} · {new Date(item.updated_at).toLocaleString("pt-BR")}</span></span><span aria-hidden>→</span></Link>)}
        {(cases ?? []).length === 0 && <p className="px-5 py-8 text-center text-[13px] themeable-text-ink-muted-48">Nenhum ticket ainda. Abra o primeiro acima.</p>}
      </div>
    </section>
  </main>;
}
