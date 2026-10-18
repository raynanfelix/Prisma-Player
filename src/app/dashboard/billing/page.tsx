import { Construction, CreditCard, QrCode } from "lucide-react";
import { eq } from "drizzle-orm";
import PageHeader from "@/components/dashboard/PageHeader";
import Reveal from "@/components/motion/reveal";
import { requireUser } from "@/lib/auth/server";
import { getAccountAccess, isSubscriptionEffective } from "@/lib/access/service";
import { db, schema } from "@/lib/db";

const { billingPlans, subscriptions } = schema;

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const userId = await requireUser("/dashboard/billing");
  const [subscriptionRows, access] = await Promise.all([
    db.select({
      status: subscriptions.status,
      billingMethod: subscriptions.billingMethod,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      planSlug: billingPlans.slug,
      planName: billingPlans.name,
    })
      .from(subscriptions)
      .leftJoin(billingPlans, eq(billingPlans.id, subscriptions.planId))
      .where(eq(subscriptions.userId, userId))
      .limit(1),
    getAccountAccess(userId),
  ]);
  const subscriptionRow = subscriptionRows[0];
  // Shapes snake_case preservados para não tocar no JSX.
  const subscription = subscriptionRow ? {
    status: subscriptionRow.status,
    billing_method: subscriptionRow.billingMethod,
    current_period_end: subscriptionRow.currentPeriodEnd ? subscriptionRow.currentPeriodEnd.toISOString() : null,
    plan: subscriptionRow.planSlug ? { slug: subscriptionRow.planSlug, name: subscriptionRow.planName ?? "" } : null,
  } : null;
  const plan = subscription?.plan ?? null;
  // Verdade efetiva, não status cru: linha `active` com período vencido é
  // plano terminado (o cron marca `expired`, mas a tela não pode mentir).
  const subActive = isSubscriptionEffective(subscription ? { status: subscription.status, current_period_end: subscription.current_period_end } : null);

  return (
    <main className="dashboard-content pb-16 space-y-6">
      <PageHeader
        icon={<CreditCard size={20} />}
        title="Plano, Faturamento & Créditos"
      />

      <Reveal>
        <section className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 sm:p-7 shadow-xs">
          {subActive ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="rounded-full bg-[#B9FF66] px-3 py-0.5 text-xs font-bold text-[#191A23]">
                Plano ativo
              </span>
              <h2 className="mt-2 text-2xl font-bold text-[#191A23] dark:text-white">{plan?.name ?? "Plano Prisma Pro"}</h2>
              <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5">
                Válido até {subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString("pt-BR") : "a próxima renovação"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-card px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300">
                {subscription?.billing_method === "card" ? <CreditCard size={15} /> : <QrCode size={15} />}
                {subscription?.billing_method === "card" ? "Cartão recorrente" : "Pix 30 dias"}
              </span>
            </div>
          </div>
        ) : subscription?.status === "active" ? (
          <div>
            <span className="rounded-full bg-amber-500/10 px-3 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
              Plano terminado
            </span>
            <h2 className="mt-2 text-2xl font-bold text-[#191A23] dark:text-white">{plan?.name ?? "Plano Prisma Pro"} terminou em {subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString("pt-BR") : "—"}</h2>
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5">
              Estamos integrando um novo provedor de pagamento — em breve você reativa seu plano por aqui.
            </p>
          </div>
        ) : access.trialStatus === "active" ? (
          <div>
            <span className="rounded-full bg-[#B9FF66] px-3 py-0.5 text-xs font-bold text-[#191A23]">
              TESTE 14 DIAS ATIVO
            </span>
            <h2 className="mt-2 text-2xl font-bold text-[#191A23] dark:text-white">Acesso completo liberado</h2>
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5">
              Seu teste termina em {access.trialEndsAt ? new Date(access.trialEndsAt).toLocaleDateString("pt-BR") : "14 dias"}. Nenhuma cobrança automática.
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-xl font-bold text-[#191A23] dark:text-white">Nenhum plano ativo</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-zinc-400">
              Quando os pagamentos voltarem, você assina o plano ideal para sua operação por aqui.
            </p>
          </div>
        )}
        </section>
      </Reveal>

      <Reveal delay={0.08}>
        <section className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 sm:p-7 shadow-xs">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#B9FF66]/15">
              <Construction size={22} className="text-[#B9FF66]" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-[#191A23] dark:text-white">Pagamentos em atualização</h2>
              <p className="mt-1 text-sm font-medium text-slate-500 dark:text-zinc-400">
                Estamos integrando um novo provedor de pagamento — em breve você assina e compra créditos direto por aqui.
              </p>
            </div>
          </div>
        </section>
      </Reveal>
    </main>
  );
}
