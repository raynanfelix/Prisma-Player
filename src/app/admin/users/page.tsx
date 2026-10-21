import Link from "next/link";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { AdminHeader, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import AdminUserFilters from "@/components/admin/AdminUserFilters";
import { subscriptionDisplayStatus } from "@/lib/access/service";
import { db, schema } from "@/lib/db";

const { accountAccess, aiCreditWallets, billingPlans, profiles, subscriptions } = schema;

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

type Search = { q?: string; plan?: string; status?: string; trial?: string; page?: string };

/** Contas com busca, filtros e paginação no servidor. Filtros vivem na URL. */
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 80);
  const planFilter = (params.plan ?? "").trim();
  const statusFilter = (params.status ?? "").trim();
  const trialFilter = (params.trial ?? "").trim();
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const searchFilter = query
    ? or(ilike(profiles.email, `%${query.replace(/[%_]/g, "")}%`), ilike(profiles.fullName, `%${query.replace(/[%_]/g, "")}%`))
    : undefined;

  const [profileRows, totalRows, subscriptionRows, walletRows, planRows, trialRows] = await Promise.all([
    db.select({ id: profiles.id, email: profiles.email, fullName: profiles.fullName, createdAt: profiles.createdAt })
      .from(profiles)
      .where(searchFilter)
      .orderBy(desc(profiles.createdAt))
      .limit(PAGE_SIZE)
      .offset(from),
    db.select({ count: sql<number>`count(*)::int` }).from(profiles).where(searchFilter),
    db.select({
      userId: subscriptions.userId,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      planSlug: billingPlans.slug,
      planName: billingPlans.name,
    })
      .from(subscriptions)
      .leftJoin(billingPlans, eq(billingPlans.id, subscriptions.planId))
      .limit(5000),
    db.select({ userId: aiCreditWallets.userId, balance: aiCreditWallets.balance }).from(aiCreditWallets).limit(5000),
    db.select({ slug: billingPlans.slug, name: billingPlans.name }).from(billingPlans).where(eq(billingPlans.isActive, true)).orderBy(asc(billingPlans.displayOrder)),
    db.select({ userId: accountAccess.userId, trialStatus: accountAccess.trialStatus }).from(accountAccess).limit(5000),
  ]);

  const total = totalRows[0]?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const subscriptionMap = new Map(subscriptionRows.map((item) => [item.userId, {
    status: item.status,
    current_period_end: item.currentPeriodEnd ? item.currentPeriodEnd.toISOString() : null,
    plan: item.planSlug ? { slug: item.planSlug, name: item.planName ?? "" } : null,
  }]));
  const walletMap = new Map(walletRows.map((item) => [item.userId, item.balance]));
  const trialMap = new Map(trialRows.map((item) => [item.userId, item.trialStatus]));

  const rows = profileRows.map((profile) => ({
    id: profile.id,
    email: profile.email,
    full_name: profile.fullName,
    created_at: profile.createdAt.toISOString(),
  })).filter((profile) => {
    const sub = subscriptionMap.get(profile.id);
    if (planFilter && sub?.plan?.slug !== planFilter) return false;
    if (statusFilter && (sub?.status ?? "none") !== statusFilter) return false;
    if (trialFilter && (trialMap.get(profile.id) ?? "none") !== trialFilter) return false;
    return true;
  });

  const href = (extra: Record<string, string>) => {
    const current = new URLSearchParams({ ...(query ? { q: query } : {}), ...(planFilter ? { plan: planFilter } : {}), ...(statusFilter ? { status: statusFilter } : {}), ...(trialFilter ? { trial: trialFilter } : {}), ...extra });
    return `/admin/users?${current.toString()}`;
  };
  return <div><AdminHeader title="Contas" description="Busca, filtros e paginação no servidor. Clique na conta para o perfil 360." />
    <AdminUserFilters query={query} plan={planFilter} status={statusFilter} trial={trialFilter} plans={planRows} />
    <AdminPanel title={`${total.toLocaleString("pt-BR")} contas`} description={`Página ${page} de ${pages}. Filtros aplicados no banco; plano/status/trial refinam a página.`}><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">Cliente</th><th className="px-5 py-3 font-medium">Plano</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Trial</th><th className="px-5 py-3 font-medium">Créditos</th><th className="px-5 py-3 font-medium">Cadastro</th></tr></thead><tbody>{rows.map((profile) => { const subscription = subscriptionMap.get(profile.id); const plan = subscription?.plan; return <tr key={profile.id} className="border-t themeable-border-hairline hover:bg-black/[0.02] dark:hover:bg-transparent"><td className="px-5 py-4"><Link href={`/admin/users/${profile.id}`} className="font-semibold themeable-text-ink hover:underline">{profile.full_name || "Sem nome"}</Link><p className="mt-0.5 themeable-text-ink-muted-48">{profile.email}</p></td><td className="px-5 py-4 themeable-text-ink">{plan?.name ?? "Sem plano"}</td><td className="px-5 py-4">{subscription ? <StatusPill value={subscriptionDisplayStatus(subscription)} /> : <span className="themeable-text-ink-muted-48">-</span>}</td><td className="px-5 py-4 themeable-text-ink-muted-48">{trialMap.get(profile.id) ?? "-"}</td><td className="px-5 py-4 font-semibold text-prisma-blue dark:text-white">{(walletMap.get(profile.id) ?? 0).toLocaleString("pt-BR")}</td><td className="px-5 py-4 themeable-text-ink-muted-48">{new Date(profile.created_at).toLocaleDateString("pt-BR")}</td></tr>; })}{rows.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center themeable-text-ink-muted-48">Nenhuma conta com esses filtros. <Link href="/admin/users" className="font-semibold underline">Limpar filtros</Link></td></tr>}</tbody></table></div>
      <div className="flex items-center justify-between border-t px-5 py-3 themeable-border-hairline">
        <span className="text-[12px] themeable-text-ink-muted-48">Página {page} de {pages}</span>
        <div className="flex gap-2">
          {page > 1 ? <Link href={href({ page: String(page - 1) })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold dark:border-zinc-800">Anterior</Link> : <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] opacity-40 dark:border-zinc-800">Anterior</span>}
          {page < pages ? <Link href={href({ page: String(page + 1) })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold dark:border-zinc-800">Próxima</Link> : <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] opacity-40 dark:border-zinc-800">Próxima</span>}
        </div>
      </div></AdminPanel>
  </div>;
}
