import Link from "next/link";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { AdminHeader, AdminMetric, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import OrphanActivateButton from "@/components/admin/OrphanActivateButton";
import PlanToggle from "@/components/admin/PlanToggle";
import { isSubscriptionEffective } from "@/lib/access/service";
import { CircleDollarSign, TrendingDown, TrendingUp, Undo2, Users, Wallet } from "lucide-react";
import { db, schema } from "@/lib/db";
import { formatBrlFromCents as money } from "@/lib/format/money";
import { nowMs } from "@/lib/datetime";

const {
  accountAccess,
  billingCheckouts,
  billingPlans,
  paymentWebhookEvents,
  profiles,
  subscriptions,
} = schema;

export const dynamic = "force-dynamic";

/**
 * Financeiro: MRR a partir das assinaturas ativas (preço do plano vigente),
 * churn e reembolsos dos últimos 30 dias, conversão trial→pago e coortes
 * mensais de cadastro. Conciliação: todo pago tem evento de webhook.
 */
export default async function AdminFinancePage() {
  // nowMs() (lib/datetime): Date.now() direto no corpo do componente dispara
  // o lint react-compiler; a page segue force-dynamic.
  const monthAgo = new Date(nowMs() - 30 * 86_400_000);
  const monthAgoIso = monthAgo.toISOString();
  const [subRows, trialRows, checkoutRows, profileRows, hookRows, planRows, recentCheckoutRows] = await Promise.all([
    db.select({
      userId: subscriptions.userId,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelledAt: subscriptions.cancelledAt,
      planName: billingPlans.name,
      planAmountCents: billingPlans.amountCents,
    })
      .from(subscriptions)
      .leftJoin(billingPlans, eq(billingPlans.id, subscriptions.planId))
      .limit(5000),
    db.select({ trialStatus: accountAccess.trialStatus }).from(accountAccess).limit(5000),
    db.select({ userId: billingCheckouts.userId, amountCents: billingCheckouts.amountCents, status: billingCheckouts.status, paidAt: billingCheckouts.paidAt })
      .from(billingCheckouts)
      .where(and(inArray(billingCheckouts.status, ["paid", "refunded", "disputed"]), gte(billingCheckouts.paidAt, monthAgo)))
      .limit(2000),
    db.select({ id: profiles.id, createdAt: profiles.createdAt }).from(profiles).orderBy(desc(profiles.createdAt)).limit(5000),
    db.select({ status: paymentWebhookEvents.status }).from(paymentWebhookEvents).where(inArray(paymentWebhookEvents.status, ["failed", "received", "processing"])).limit(1000),
    db.select({ id: billingPlans.id, slug: billingPlans.slug, name: billingPlans.name, amountCents: billingPlans.amountCents, isActive: billingPlans.isActive }).from(billingPlans).orderBy(asc(billingPlans.displayOrder)),
    db.select({
      id: billingCheckouts.id,
      userId: billingCheckouts.userId,
      amountCents: billingCheckouts.amountCents,
      checkoutType: billingCheckouts.checkoutType,
      status: billingCheckouts.status,
      paidAt: billingCheckouts.paidAt,
      createdAt: billingCheckouts.createdAt,
      planSlug: billingPlans.slug,
      planName: billingPlans.name,
    })
      .from(billingCheckouts)
      .leftJoin(billingPlans, eq(billingPlans.id, billingCheckouts.planId))
      .orderBy(desc(billingCheckouts.createdAt))
      .limit(100),
  ]);

  // Shapes snake_case preservados para não tocar no JSX.
  const subs = subRows.map((item) => ({
    user_id: item.userId,
    status: item.status,
    current_period_end: item.currentPeriodEnd ? item.currentPeriodEnd.toISOString() : null,
    cancelled_at: item.cancelledAt ? item.cancelledAt.toISOString() : null,
    plan: item.planName ? { name: item.planName, amount_cents: item.planAmountCents ?? 0 } : null,
  }));
  const checkouts = checkoutRows.map((item) => ({
    user_id: item.userId,
    amount_cents: item.amountCents,
    status: item.status,
    paid_at: item.paidAt ? item.paidAt.toISOString() : null,
  }));
  const profilesData = profileRows.map((item) => ({ id: item.id, created_at: item.createdAt.toISOString() }));
  const plans = planRows.map((item) => ({
    id: item.id,
    slug: item.slug,
    name: item.name,
    amount_cents: item.amountCents,
    is_active: item.isActive,
  }));
  const recentCheckouts = recentCheckoutRows.map((item) => ({
    id: item.id,
    user_id: item.userId,
    amount_cents: item.amountCents,
    checkout_type: item.checkoutType,
    status: item.status,
    paid_at: item.paidAt ? item.paidAt.toISOString() : null,
    created_at: item.createdAt.toISOString(),
    plan: item.planSlug ? { slug: item.planSlug, name: item.planName ?? "" } : null,
  }));
  const hooks = hookRows;

  const active = subs.filter((item) => isSubscriptionEffective({ status: item.status, current_period_end: item.current_period_end }));
  const activeIds = new Set(active.map((item) => item.user_id));
  const mrr = active.reduce((sum, item) => sum + (item.plan?.amount_cents ?? 0), 0);
  const churned = subs.filter((item) => ["cancelled", "expired"].includes(item.status) && (item.cancelled_at ?? "") >= monthAgoIso).length;
  const churnRate = active.length + churned > 0 ? (churned / (active.length + churned)) * 100 : 0;
  const refunded = checkouts.filter((item) => ["refunded", "disputed"].includes(item.status));
  const refundCents = refunded.reduce((sum, item) => sum + item.amount_cents, 0);
  const paidCents = checkouts.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amount_cents, 0);
  const trialsUsed = trialRows.filter((item) => ["used", "expired"].includes(item.trialStatus)).length;
  const conversion = active.length + trialsUsed > 0 ? (active.length / (active.length + trialsUsed)) * 100 : 0;
  const arpu = active.length > 0 ? mrr / active.length : 0;
  const attention = hooks.filter((item) => item.status === "failed").length;

  // Pagos sem assinatura vigente: checkout pago e conta sem acesso = falha de
  // entrega a corrigir com um clique (ativa +30d no plano do checkout).
  const orphans = recentCheckouts.filter((item) => item.status === "paid" && !activeIds.has(item.user_id));
  const orphanIds = [...new Set(orphans.map((item) => item.user_id))];
  const orphanProfiles = orphanIds.length ? await db.select({ id: profiles.id, email: profiles.email }).from(profiles).where(inArray(profiles.id, orphanIds)) : [];
  const orphanEmail = new Map(orphanProfiles.map((item) => [item.id, item.email]));

  const cohorts = new Map<string, { signups: number; paid: number }>();
  for (const profile of profilesData) {
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
      <AdminPanel title="Catálogo de planos" description="Ativar/desativar vale para novos checkouts."><div className="space-y-2 p-5">{plans.map((plan) => <div key={plan.id} className="flex items-center justify-between gap-2 text-[12px]"><span className="themeable-text-ink"><strong>{plan.name}</strong> <span className="themeable-text-ink-muted-48">{plan.slug} · {money(plan.amount_cents)}/mês</span></span><PlanToggle planId={plan.id} isActive={plan.is_active} planName={plan.name} /></div>)}</div></AdminPanel>
      <AdminPanel title="Checkouts recentes" description="100 últimos, com link para a conta."><div className="max-h-96 space-y-2 overflow-y-auto p-5">{recentCheckouts.map((checkout) => { const plan = checkout.plan; return <div key={checkout.id} className="flex items-center justify-between gap-2 text-[12px]"><Link href={`/admin/users/${checkout.user_id}`} className="truncate font-semibold themeable-text-ink hover:underline">{plan?.name ?? "?"} · {money(checkout.amount_cents)}</Link><StatusPill value={checkout.status} /></div>; })}</div></AdminPanel>
    </div>
    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      <AdminPanel title="Coortes mensais" description="Cadastros por mês e quantos seguem pagando hoje."><div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">Mês</th><th className="px-5 py-3 font-medium">Cadastros</th><th className="px-5 py-3 font-medium">Pagando hoje</th><th className="px-5 py-3 font-medium">Retenção paga</th></tr></thead><tbody>{[...cohorts.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 12).map(([month, row]) => <tr key={month} className="border-t themeable-border-hairline"><td className="px-5 py-3 font-semibold themeable-text-ink">{month}</td><td className="px-5 py-3 themeable-text-ink">{row.signups}</td><td className="px-5 py-3 themeable-text-ink">{row.paid}</td><td className="px-5 py-3 themeable-text-ink">{row.signups ? `${((row.paid / row.signups) * 100).toFixed(1)}%` : "-"}</td></tr>)}</tbody></table></div></AdminPanel>
      <AdminPanel title={`Pagos sem assinatura (${orphans.length})`} description="Pagou e não está ativo: ative com um clique no plano do checkout."><div className="max-h-96 space-y-2 overflow-y-auto p-5">{orphans.map((checkout) => { const plan = checkout.plan; return <div key={checkout.id} className="flex items-center justify-between gap-2 text-[12px]"><Link href={`/admin/users/${checkout.user_id}`} className="truncate font-semibold themeable-text-ink hover:underline">{orphanEmail.get(checkout.user_id) ?? checkout.user_id.slice(0, 8)} · {plan?.name ?? "?"} · {money(checkout.amount_cents)}</Link>{plan?.slug ? <OrphanActivateButton userId={checkout.user_id} email={orphanEmail.get(checkout.user_id) ?? checkout.user_id} planSlug={plan.slug} planName={plan.name ?? plan.slug} /> : <StatusPill value={checkout.status} />}</div>; })}{orphans.length === 0 && <p className="text-[12px] themeable-text-ink-muted-48">Nenhuma divergência: todo pago tem assinatura vigente.</p>}</div></AdminPanel>
    </div>
    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      <AdminPanel title="Conciliação" description="Pagos precisam ter evento processado; atenção lista falhas abertas."><div className="space-y-3 p-5"><div className="rounded-[14px] border p-4 themeable-border-hairline"><p className="text-[13px] font-semibold themeable-text-ink">Pagos (30d): {money(paidCents)}</p><p className="mt-1 text-[11px] themeable-text-ink-muted-48">Confira contra o painel da Stripe antes de fechar o mês.</p></div><div className="rounded-[14px] border p-4 themeable-border-hairline"><p className="text-[13px] font-semibold themeable-text-ink">Webhooks com falha: {attention}</p><p className="mt-1 text-[11px] themeable-text-ink-muted-48">Detalhes em Saúde do sistema.</p></div><StatusPill value={attention ? "attention" : "paid"} /></div></AdminPanel>
    </div>
  </div>;
}
