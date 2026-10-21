import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { AdminHeader, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import { SupportCaseForm } from "@/components/admin/SupportForms";
import { db, schema } from "@/lib/db";

const { profiles, supportCases } = schema;

export const dynamic = "force-dynamic";

type Search = { status?: string; q?: string };

/** Casos de suporte interno. Sem envio externo: notas internas + contato via email. */
export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const statusFilter = (params.status ?? "aberto").trim();
  const caseFilter = ["aberto", "em_andamento", "aguardando_cliente", "resolvido"].includes(statusFilter)
    ? eq(supportCases.status, statusFilter)
    : undefined;
  const cases = await db
    .select({
      id: supportCases.id,
      userId: supportCases.userId,
      subject: supportCases.subject,
      category: supportCases.category,
      priority: supportCases.priority,
      status: supportCases.status,
      updatedAt: supportCases.updatedAt,
    })
    .from(supportCases)
    .where(caseFilter)
    .orderBy(desc(supportCases.updatedAt))
    .limit(100);
  const userIds = [...new Set(cases.map((item) => item.userId).filter(Boolean))] as string[];
  const owners = userIds.length ? await db.select({ id: profiles.id, email: profiles.email }).from(profiles).where(inArray(profiles.id, userIds)) : [];
  const emailOf = new Map(owners.map((item) => [item.id, item.email]));

  return <div><AdminHeader title="Suporte" description="Casos internos vinculados a contas. Notas internas nunca são enviadas ao cliente." />
    <div className="mb-5 flex flex-wrap gap-2">
      {["aberto", "em_andamento", "aguardando_cliente", "resolvido"].map((status) => (
        <Link key={status} href={status === "aberto" ? "/admin/support" : `/admin/support?status=${status}`} className={`rounded-xl px-3.5 py-2 text-[12px] font-semibold ${statusFilter === status ? "bg-selected text-selected-foreground" : "border border-slate-200 dark:border-zinc-800"}`}>{status}</Link>
      ))}
    </div>
    <div className="mb-5"><AdminPanel title="Abrir caso" description="Vincule à conta quando souber qual é."><SupportCaseForm /></AdminPanel></div>
    <AdminPanel title={`${cases.length} casos`} description="Ordenados pela atualização mais recente."><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">Assunto</th><th className="px-5 py-3 font-medium">Conta</th><th className="px-5 py-3 font-medium">Categoria</th><th className="px-5 py-3 font-medium">Prioridade</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Atualizado</th></tr></thead><tbody>{cases.map((item) => <tr key={item.id} className="border-t themeable-border-hairline hover:bg-black/[0.02] dark:hover:bg-transparent"><td className="max-w-[320px] truncate px-5 py-4 font-semibold themeable-text-ink"><Link href={`/admin/support/${item.id}`} className="hover:underline">{item.subject}</Link></td><td className="max-w-[200px] truncate px-5 py-4 themeable-text-ink-muted-48">{item.userId ? <Link href={`/admin/users/${item.userId}`} className="hover:underline">{emailOf.get(item.userId) ?? item.userId.slice(0, 8)}</Link> : "-"}</td><td className="px-5 py-4 themeable-text-ink-muted-48">{item.category}</td><td className="px-5 py-4 themeable-text-ink-muted-48">{item.priority}</td><td className="px-5 py-4"><StatusPill value={item.status} /></td><td className="px-5 py-4 themeable-text-ink-muted-48">{item.updatedAt.toLocaleString("pt-BR")}</td></tr>)}
      {cases.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center themeable-text-ink-muted-48">Nenhum caso neste status.</td></tr>}</tbody></table></div></AdminPanel>
  </div>;
}
