import { AdminHeader, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export default async function AdminUsersPage() {
  const admin = createAdminClient();
  const [profiles, subscriptions, wallets] = await Promise.all([
    admin.from("profiles").select("id,email,full_name,created_at").order("created_at", { ascending: false }).limit(200),
    admin.from("subscriptions").select("user_id,status,current_period_end,plan:billing_plans(name)").limit(500),
    admin.from("ai_credit_wallets").select("user_id,balance").limit(500),
  ]);
  const subscriptionMap = new Map((subscriptions.data ?? []).map((item) => [item.user_id, item]));
  const walletMap = new Map((wallets.data ?? []).map((item) => [item.user_id, item.balance]));
  return <div><AdminHeader title="Contas" description="Assinatura, saldo Prisma IA e identificação dos clientes sem misturar dados entre contas." />
    <AdminPanel title={`${profiles.data?.length ?? 0} contas recentes`} description="A listagem é limitada às 200 contas mais recentes para manter o painel leve."><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">Cliente</th><th className="px-5 py-3 font-medium">Plano</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Créditos</th><th className="px-5 py-3 font-medium">Cadastro</th></tr></thead><tbody>{(profiles.data ?? []).map((profile) => { const subscription = subscriptionMap.get(profile.id); const plan = Array.isArray(subscription?.plan) ? subscription.plan[0] : subscription?.plan; return <tr key={profile.id} className="border-t themeable-border-hairline"><td className="px-5 py-4"><p className="font-semibold themeable-text-ink">{profile.full_name || "Sem nome"}</p><p className="mt-0.5 themeable-text-ink-muted-48">{profile.email}</p></td><td className="px-5 py-4 themeable-text-ink">{plan?.name ?? "Sem plano"}</td><td className="px-5 py-4">{subscription?.status ? <StatusPill value={subscription.status} /> : <span className="themeable-text-ink-muted-48">—</span>}</td><td className="px-5 py-4 font-semibold text-prisma-blue">{(walletMap.get(profile.id) ?? 0).toLocaleString("pt-BR")}</td><td className="px-5 py-4 themeable-text-ink-muted-48">{new Date(profile.created_at).toLocaleDateString("pt-BR")}</td></tr>; })}</tbody></table></div></AdminPanel>
  </div>;
}
