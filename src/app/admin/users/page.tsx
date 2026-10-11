import Link from "next/link";
import { AdminHeader, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import AdminUserFilters from "@/components/admin/AdminUserFilters";
import { subscriptionDisplayStatus } from "@/lib/access/service";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const to = from + PAGE_SIZE - 1;

  const admin = createAdminClient();
  let profilesQuery = admin.from("profiles").select("id,email,full_name,created_at", { count: "exact" }).order("created_at", { ascending: false });
  if (query) {
    const like = `%${query.replace(/[%_]/g, "")}%`;
    profilesQuery = profilesQuery.or(`email.ilike.${like},full_name.ilike.${like}`);
  }
  const [profiles, subscriptions, wallets, plans, trials] = await Promise.all([
    profilesQuery.range(from, to),
    admin.from("subscriptions").select("user_id,status,current_period_end,plan:billing_plans(slug,name)").limit(5000),
    admin.from("ai_credit_wallets").select("user_id,balance").limit(5000),
    admin.from("billing_plans").select("slug,name").eq("is_active", true).order("display_order"),
    admin.from("account_access").select("user_id,trial_status").limit(5000),
  ]);

  const total = profiles.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const subscriptionMap = new Map((subscriptions.data ?? []).map((item) => [item.user_id, item]));
  const walletMap = new Map((wallets.data ?? []).map((item) => [item.user_id, item.balance]));
  const trialMap = new Map((trials.data ?? []).map((item) => [item.user_id, item.trial_status]));

  const rows = (profiles.data ?? []).filter((profile) => {
    const sub = subscriptionMap.get(profile.id);
    const plan = Array.isArray(sub?.plan) ? sub.plan[0] : sub?.plan;
    if (planFilter && plan?.slug !== planFilter) return false;
    if (statusFilter && (sub?.status ?? "none") !== statusFilter) return false;
    if (trialFilter && (trialMap.get(profile.id) ?? "none") !== trialFilter) return false;
    return true;
  });

  const href = (extra: Record<string, string>) => {
    const current = new URLSearchParams({ ...(query ? { q: query } : {}), ...(planFilter ? { plan: planFilter } : {}), ...(statusFilter ? { status: statusFilter } : {}), ...(trialFilter ? { trial: trialFilter } : {}), ...extra });
    return `/admin/users?${current.toString()}`;
  };
  return <div><AdminHeader title="Contas" description="Busca, filtros e paginação no servidor. Clique na conta para o perfil 360." />
    <AdminUserFilters query={query} plan={planFilter} status={statusFilter} trial={trialFilter} plans={plans.data ?? []} />
    <AdminPanel title={`${total.toLocaleString("pt-BR")} contas`} description={`Página ${page} de ${pages}. Filtros aplicados no banco; plano/status/trial refinam a página.`}><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">Cliente</th><th className="px-5 py-3 font-medium">Plano</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Trial</th><th className="px-5 py-3 font-medium">Créditos</th><th className="px-5 py-3 font-medium">Cadastro</th></tr></thead><tbody>{rows.map((profile) => { const subscription = subscriptionMap.get(profile.id); const plan = Array.isArray(subscription?.plan) ? subscription.plan[0] : subscription?.plan; return <tr key={profile.id} className="border-t themeable-border-hairline hover:bg-black/[0.02] dark:hover:bg-transparent"><td className="px-5 py-4"><Link href={`/admin/users/${profile.id}`} className="font-semibold themeable-text-ink hover:underline">{profile.full_name || "Sem nome"}</Link><p className="mt-0.5 themeable-text-ink-muted-48">{profile.email}</p></td><td className="px-5 py-4 themeable-text-ink">{plan?.name ?? "Sem plano"}</td><td className="px-5 py-4">{subscription ? <StatusPill value={subscriptionDisplayStatus(subscription)} /> : <span className="themeable-text-ink-muted-48">—</span>}</td><td className="px-5 py-4 themeable-text-ink-muted-48">{trialMap.get(profile.id) ?? "—"}</td><td className="px-5 py-4 font-semibold text-prisma-blue dark:text-white">{(walletMap.get(profile.id) ?? 0).toLocaleString("pt-BR")}</td><td className="px-5 py-4 themeable-text-ink-muted-48">{new Date(profile.created_at).toLocaleDateString("pt-BR")}</td></tr>; })}{rows.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center themeable-text-ink-muted-48">Nenhuma conta com esses filtros. <Link href="/admin/users" className="font-semibold underline">Limpar filtros</Link></td></tr>}</tbody></table></div>
      <div className="flex items-center justify-between border-t px-5 py-3 themeable-border-hairline">
        <span className="text-[12px] themeable-text-ink-muted-48">Página {page} de {pages}</span>
        <div className="flex gap-2">
          {page > 1 ? <Link href={href({ page: String(page - 1) })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold dark:border-zinc-800">Anterior</Link> : <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] opacity-40 dark:border-zinc-800">Anterior</span>}
          {page < pages ? <Link href={href({ page: String(page + 1) })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold dark:border-zinc-800">Próxima</Link> : <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] opacity-40 dark:border-zinc-800">Próxima</span>}
        </div>
      </div></AdminPanel>
  </div>;
}
