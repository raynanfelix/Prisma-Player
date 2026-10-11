import Link from "next/link";
import { AdminHeader, AdminMetric, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import PlanToggle from "@/components/admin/PlanToggle";
import { CircleDollarSign, TrendingDown, TrendingUp, Undo2, Users, Wallet } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Financeiro: MRR a partir das assinaturas ativas (preço do plano vigente),
 * churn e reembolsos dos últimos 30 dias, conversão trial→pago e coortes
 * mensais de cadastro. Conciliação: todo pago tem evento de webhook.
 */
export default async function AdminFinancePage() {
  const admin = createAdminClient();
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const [subs, trials, checkouts, profiles, hooks, plans, recentCheckouts] = await Promise.all([
    admin.from("subscriptions").select("user_id,status,current_period_end,cancelled_at,plan:billing_plans(name,amount_cents)").limit(5000),
    admin.from("account_access").select("trial_status").limit(5000),
    admin.from("billing_checkouts").select("user_id,amount_cents,status,paid_at").in("status", ["paid", "refunded", "disputed"]).gte("paid_at", monthAgo).limit(2000),
    admin.from("profiles").select("id,created_at").order("created_at", { ascending: false }).limit(5000),
    admin.from("payment_webhook_events").select("status").in("status", ["failed", "received", "processing"]).limit(1000),
    admin.from("billing_plans").select("id,slug,name,amount_cents,is_active").order("display_order"),
    admin.from("billing_checkouts").select("id,user_id,amount_cents,checkout_type,status,paid_at,created_at,plan:billing_plans(name)").order("created_at", { ascending: false }).limit(100),
  ]);

  const active = (subs.data ?? []).filter((item) => item.status === "active");
  const mrr = active.reduce((sum, item) => {
    const plan = Array.isArray(item.plan) ? item.plan[0] : item.plan;
    return sum + (plan?.amount_cents ?? 0);
  }, 0);
  const churned = (subs.data ?? []).filter((item) => ["cancelled", "expired"].includes(item.status) && (item.cancelled_at ?? "") >= monthAgo).length;
  const churnRate = active.length + churned > 0 ? (churned / (active.length + churned)) * 100 : 0;
  const refunded = (checkouts.data ?? []).filter((item) => ["refunded", "disputed"].includes(item.status));
  const refundCents = refunded.reduce((sum, item) => sum + item.amount_cents, 0);
  const paidCents = (checkouts.data ?? []).filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amount_cents, 0);
  const trialsUsed = (trials.data ?? []).filter((item) => ["used", "expired"].includes(item.trial_status)).length;
  const conversion = active.length + trialsUsed > 0 ? (active.length / (active.length + trialsUsed)) * 100 : 0;
  const arpu = active.length > 0 ? mrr / active.length : 0;
  const attention = (hooks.data ?? []).filter((item) => item.status === "failed").length;

  const activeIds = new Set(active.map((item) => item.user_id));
  const cohorts = new Map<string, { signups: number; paid: number }>();
  for (const profile of profiles.data ?? []) {
    const key = profile.created_at.slice(0, 7);
    const row = cohorts.get(key) ?? { signups: 0, paid: 0 };
    row.signups += 1;
    if (activeIds.has(profile.id)) row.paid += 1;
    cohorts.set(key, row);
  }

  return <div>
    <AdminHeader title="Financeiro" description="MRR, churn, reembolsos, conversão e coortes. Receita paga dos últimos 30 dias para conciliação." />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <AdminMetric label="MRR" value={money(mrr)} detail={`${active.length} assinaturas ativas`} icon={CircleDollarSign} tone="green" />
      <AdminMetric label="ARR estimado" value={money(mrr * 12)} detail="MRR × 12" icon={TrendingUp} tone="green" />
      <AdminMetric label="ARPU" value={money(Math.round(arpu))} detail="receita por conta ativa" icon={Wallet} />
      <AdminMetric label="Trial → pago" value={`${conversion.toFixed(1)}%`} detail="conversão acumulada" icon={Users} tone="green" />
      <AdminMetric label="Churn 30d" value={`${churnRate.toFixed(1)}%`} detail={`${churned} cancelamentos`} icon={TrendingDown} tone={churnRate > 10 ? "red" : "green"} />
      <AdminMetric label="Reembolsos 30d" value={money(refundCents)} detail={`${refunded.length} casos · pagos ${money(paidCents)}`} icon={Undo2} tone={refundCents > 0 ? "red" : "green"} />
    </section>
    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      <AdminPanel title="Catálogo de planos" description="Ativar/desativar vale para novos checkouts."><div className="space-y-2 p-5">{(plans.data ?? []).map((plan) => <div key={plan.id} className="flex items-center justify-between gap-2 text-[12px]"><span className="themeable-text-ink"><strong>{plan.name}</strong> <span className="themeable-text-ink-muted-48">{plan.slug} · {money(plan.amount_cents)}/mês</span></span><PlanToggle planId={plan.id} isActive={plan.is_active} planName={plan.name} /></div>)}</div></AdminPanel>
      <AdminPanel title="Checkouts recentes" description="100 últimos, com link para a conta."><div className="max-h-96 space-y-2 overflow-y-auto p-5">{(recentCheckouts.data ?? []).map((checkout) => { const plan = Array.isArray(checkout.plan) ? checkout.plan[0] : checkout.plan; return <div key={checkout.id} className="flex items-center justify-between gap-2 text-[12px]"><Link href={`/admin/users/${checkout.user_id}`} className="truncate font-semibold themeable-text-ink hover:underline">{plan?.name ?? "?"} · {money(checkout.amount_cents)}</Link><StatusPill value={checkout.status} /></div>; })}</div></AdminPanel>
    </div>
    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      <AdminPanel title="Coortes mensais" description="Cadastros por mês e quantos seguem pagando hoje."><div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">Mês</th><th className="px-5 py-3 font-medium">Cadastros</th><th className="px-5 py-3 font-medium">Pagando hoje</th><th className="px-5 py-3 font-medium">Retenção paga</th></tr></thead><tbody>{[...cohorts.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 12).map(([month, row]) => <tr key={month} className="border-t themeable-border-hairline"><td className="px-5 py-3 font-semibold themeable-text-ink">{month}</td><td className="px-5 py-3 themeable-text-ink">{row.signups}</td><td className="px-5 py-3 themeable-text-ink">{row.paid}</td><td className="px-5 py-3 themeable-text-ink">{row.signups ? `${((row.paid / row.signups) * 100).toFixed(1)}%` : "—"}</td></tr>)}</tbody></table></div></AdminPanel>
      <AdminPanel title="Conciliação" description="Pagos precisam ter evento processado; atenção lista falhas abertas."><div className="space-y-3 p-5"><div className="rounded-[14px] border p-4 themeable-border-hairline"><p className="text-[13px] font-semibold themeable-text-ink">Pagos (30d): {money(paidCents)}</p><p className="mt-1 text-[11px] themeable-text-ink-muted-48">Confira contra o extrato da AbacatePay antes de fechar o mês.</p></div><div className="rounded-[14px] border p-4 themeable-border-hairline"><p className="text-[13px] font-semibold themeable-text-ink">Webhooks com falha: {attention}</p><p className="mt-1 text-[11px] themeable-text-ink-muted-48">Detalhes em Saúde do sistema.</p></div><StatusPill value={attention ? "attention" : "paid"} /></div></AdminPanel>
    </div>
  </div>;
}
