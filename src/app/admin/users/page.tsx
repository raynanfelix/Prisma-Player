import { AdminHeader, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import UserActions from "@/components/admin/UserActions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export default async function AdminUsersPage() {
  const admin = createAdminClient();
  const [profiles, subscriptions, wallets, plans, logs] = await Promise.all([
    admin.from("profiles").select("id,email,full_name,created_at").order("created_at", { ascending: false }).limit(200),
    admin.from("subscriptions").select("user_id,status,current_period_end,plan:billing_plans(name,slug)").limit(500),
    admin.from("ai_credit_wallets").select("user_id,balance").limit(500),
    admin.from("billing_plans").select("slug,name").eq("is_active", true).order("display_order"),
    admin.from("admin_audit_log").select("action,target_user_id,admin_user_id,details,created_at").order("created_at", { ascending: false }).limit(30),
  ]);
  const subscriptionMap = new Map((subscriptions.data ?? []).map((item) => [item.user_id, item]));
  const walletMap = new Map((wallets.data ?? []).map((item) => [item.user_id, item.balance]));
  const involved = [...new Set((logs.data ?? []).flatMap((log) => [log.admin_user_id, log.target_user_id]).filter(Boolean))] as string[];
  const involvedProfiles = involved.length
    ? await admin.from("profiles").select("id,email").in("id", involved)
    : { data: [] as Array<{ id: string; email: string }> };
  const emailOf = new Map((involvedProfiles.data ?? []).map((item) => [item.id, item.email]));
  const actionLabel: Record<string, string> = {
    plan_change: "Troca de plano", subscription_suspend: "Suspensão", subscription_reactivate: "Reativação",
    trial_extend: "Trial estendido", trial_reset: "Trial resetado", credit_adjust: "Ajuste de créditos",
  };
  return <div><AdminHeader title="Contas" description="Assinatura, saldo Prisma IA e identificação dos clientes sem misturar dados entre contas." />
    <AdminPanel title={`${profiles.data?.length ?? 0} contas recentes`} description="A listagem é limitada às 200 contas mais recentes para manter o painel leve."><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">Cliente</th><th className="px-5 py-3 font-medium">Plano</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Créditos</th><th className="px-5 py-3 font-medium">Cadastro</th><th className="px-5 py-3 font-medium">Suporte</th></tr></thead><tbody>{(profiles.data ?? []).map((profile) => { const subscription = subscriptionMap.get(profile.id); const plan = Array.isArray(subscription?.plan) ? subscription.plan[0] : subscription?.plan; return <tr key={profile.id} className="border-t themeable-border-hairline"><td className="px-5 py-4"><p className="font-semibold themeable-text-ink">{profile.full_name || "Sem nome"}</p><p className="mt-0.5 themeable-text-ink-muted-48">{profile.email}</p></td><td className="px-5 py-4 themeable-text-ink">{plan?.name ?? "Sem plano"}</td><td className="px-5 py-4">{subscription?.status ? <StatusPill value={subscription.status} /> : <span className="themeable-text-ink-muted-48">—</span>}</td><td className="px-5 py-4 font-semibold text-prisma-blue">{(walletMap.get(profile.id) ?? 0).toLocaleString("pt-BR")}</td><td className="px-5 py-4 themeable-text-ink-muted-48">{new Date(profile.created_at).toLocaleDateString("pt-BR")}</td><td className="px-5 py-4"><UserActions userId={profile.id} plans={plans.data ?? []} subStatus={subscription?.status ?? null} /></td></tr>; })}</tbody></table></div></AdminPanel>
    <div className="mt-6"><AdminPanel title="Trilha de auditoria" description="Últimas 30 ações manuais do suporte."><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">Ação</th><th className="px-5 py-3 font-medium">Conta afetada</th><th className="px-5 py-3 font-medium">Operador</th><th className="px-5 py-3 font-medium">Quando</th></tr></thead><tbody>{(logs.data ?? []).map((log, index) => <tr key={index} className="border-t themeable-border-hairline"><td className="px-5 py-3 font-semibold themeable-text-ink">{actionLabel[log.action] ?? log.action}</td><td className="px-5 py-3 themeable-text-ink-muted-48">{log.target_user_id ? (emailOf.get(log.target_user_id) ?? log.target_user_id) : "—"}</td><td className="px-5 py-3 themeable-text-ink-muted-48">{emailOf.get(log.admin_user_id) ?? log.admin_user_id}</td><td className="px-5 py-3 themeable-text-ink-muted-48">{new Date(log.created_at).toLocaleString("pt-BR")}</td></tr>)}</tbody></table></div></AdminPanel></div>
  </div>;
}
