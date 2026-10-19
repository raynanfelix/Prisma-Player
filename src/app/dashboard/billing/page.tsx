import Image from "next/image";
import { CheckCircle2, Construction, CreditCard, QrCode } from "lucide-react";
import { eq } from "drizzle-orm";
import PageHeader from "@/components/dashboard/PageHeader";
import Reveal from "@/components/motion/reveal";
import { requireUser } from "@/lib/auth/server";
import { getAccountAccess, isSubscriptionEffective } from "@/lib/access/service";
import { CATALOG_CREDIT_PACKAGES, CATALOG_PLANS, formatBRL, formatPlayOverage, getPlanBenefits } from "@/lib/billing/catalog";
import { db, schema } from "@/lib/db";

const { aiCreditWallets, billingPlans, subscriptions } = schema;

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
  const walletRows = await db
    .select({ balance: aiCreditWallets.balance })
    .from(aiCreditWallets)
    .where(eq(aiCreditWallets.userId, userId))
    .limit(1);
  const walletBalance = walletRows[0]?.balance ?? 0;
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
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#191A23] dark:text-white">Planos Prisma Player</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-zinc-400">
                Escolha o plano ideal para a sua operação — a assinatura volta com o novo provedor de pagamento.
              </p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-[#B9FF66]/15 border border-[#B9FF66]/40 px-3 py-1 text-[11px] font-bold text-[#191A23] dark:text-[#B9FF66]">
              <Construction size={13} aria-hidden /> Pagamentos em atualização
            </span>
          </div>
          <div className="grid items-stretch gap-5 xl:grid-cols-3">
            {CATALOG_PLANS.map((item) => {
              const isCurrentPlan = subActive && plan?.slug === item.slug;
              return (
                <article
                  key={item.id}
                  className={`relative flex min-h-full flex-col rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 shadow-xs ${item.is_featured ? "ring-2 ring-[#B9FF66]" : ""}`}
                >
                  {item.is_featured && (
                    <span className="absolute right-5 top-5 rounded-full bg-[#B9FF66] px-3 py-0.5 text-[10px] font-bold text-[#191A23]">POPULAR</span>
                  )}
                  <p className="pr-14 text-sm font-bold text-[#191A23] dark:text-white">{item.name}</p>
                  <p className="mt-1 text-[11px] font-medium leading-4 text-slate-500 dark:text-zinc-400">{item.description}</p>
                  <p className="mt-3 text-3xl font-bold tracking-tight text-[#191A23] dark:text-white">
                    {formatBRL(item.amount_cents)}
                    <span className="ml-1 text-xs font-medium text-slate-400 dark:text-zinc-500">/mês</span>
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-[#0066cc] dark:text-[#B9FF66]">
                    {item.included_plays.toLocaleString("pt-BR")} plays inclusos · excedente {formatPlayOverage(item.play_overage_millicents)}
                  </p>
                  <ul className="mt-4 flex-1 space-y-1.5">
                    {getPlanBenefits(item).slice(4, 10).map((benefit) => (
                      <li key={benefit} className="flex items-start gap-2 text-[11px] font-medium text-slate-600 dark:text-zinc-300">
                        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[#B9FF66]" aria-hidden /> {benefit}
                      </li>
                    ))}
                  </ul>
                  <span
                    className={`mt-5 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-xs font-bold ${isCurrentPlan ? "bg-[#B9FF66] text-[#191A23]" : "border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-transparent text-slate-500 dark:text-zinc-400"}`}
                  >
                    {isCurrentPlan ? "Seu plano atual" : "Em breve com o novo provedor"}
                  </span>
                </article>
              );
            })}
          </div>
        </section>
      </Reveal>

      <Reveal delay={0.16}>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#191A23] dark:text-white">Créditos Prisma IA</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-zinc-400">
                Cada análise da Prisma IA consome créditos — eles não expiram.
              </p>
            </div>
            <span className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-card px-3.5 py-1.5 text-xs font-bold text-[#191A23] dark:text-white">
              Saldo atual: {walletBalance.toLocaleString("pt-BR")} crédito{walletBalance === 1 ? "" : "s"}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {CATALOG_CREDIT_PACKAGES.map((item) => (
              <article
                key={item.id}
                className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 shadow-xs space-y-2.5"
              >
                <Image src="/prisma-credits.png" width={40} height={40} alt="" aria-hidden className="absolute right-4 top-4 size-10 object-contain opacity-90" />
                <p className="pr-12 text-sm font-bold text-[#191A23] dark:text-white">{item.name}</p>
                <p className="text-2xl font-bold text-[#191A23] dark:text-white">
                  {(item.credits + item.bonus_credits).toLocaleString("pt-BR")} <span className="text-xs font-normal text-slate-400 dark:text-zinc-500">créditos</span>
                </p>
                {item.bonus_credits > 0 && (
                  <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-full px-2.5 py-0.5 w-fit">
                    +{item.bonus_credits.toLocaleString("pt-BR")} de bônus incluídos
                  </p>
                )}
                <p className="text-xl font-bold text-[#191A23] dark:text-white">{formatBRL(item.amount_cents)}</p>
                <span className="mt-1 inline-flex w-full items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-transparent px-4 py-2 text-xs font-bold text-slate-500 dark:text-zinc-400">
                  Em breve com o novo provedor
                </span>
              </article>
            ))}
          </div>
        </section>
      </Reveal>
    </main>
  );
}
