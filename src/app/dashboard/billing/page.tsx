import { Check, CreditCard, Info, QrCode } from "lucide-react";
import Image from "next/image";
import { asc, eq } from "drizzle-orm";
import PageHeader from "@/components/dashboard/PageHeader";
import CancelSubscriptionButton from "@/features/billing/components/CancelSubscriptionButton";
import CheckoutActions from "@/features/billing/components/CheckoutActions";
import AiCreditCheckoutButton from "@/features/billing/components/AiCreditCheckoutButton";
import { requireUser } from "@/lib/auth/server";
import { toBillingPlan } from "@/lib/billing/service";
import { formatBRL, formatPlayOverage, formatStorageOverage, getPlanBenefits, type BillingPlan } from "@/lib/billing/catalog";
import { getAccountAccess, isSubscriptionEffective } from "@/lib/access/service";
import { reconcilePendingAiCreditCheckouts } from "@/lib/billing/ai-credit-reconcile";
import { db, schema } from "@/lib/db";

const { aiCreditProducts, aiCreditWallets, billingPlans, subscriptions } = schema;

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const userId = await requireUser("/dashboard/billing");
  await reconcilePendingAiCreditCheckouts(userId).catch((error) => console.error("Credit reconciliation failed", error instanceof Error ? error.message : "unknown_error"));
  const [subscriptionRows, planRows, creditRows, walletRows, access] = await Promise.all([
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
    db.select().from(billingPlans).where(eq(billingPlans.isActive, true)).orderBy(asc(billingPlans.displayOrder)),
    db.select({
      id: aiCreditProducts.id,
      slug: aiCreditProducts.slug,
      name: aiCreditProducts.name,
      credits: aiCreditProducts.credits,
      bonusCredits: aiCreditProducts.bonusCredits,
      amountCents: aiCreditProducts.amountCents,
    })
      .from(aiCreditProducts)
      .where(eq(aiCreditProducts.isActive, true))
      .orderBy(asc(aiCreditProducts.displayOrder)),
    db.select({ balance: aiCreditWallets.balance }).from(aiCreditWallets).where(eq(aiCreditWallets.userId, userId)).limit(1),
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
  const planOrder = ["prisma-prime", "prisma-growth", "prisma-scale"];
  const currentPlanIndex = plan && subActive ? planOrder.indexOf(plan.slug) : -1;
  const plans: BillingPlan[] = planRows.map(toBillingPlan);

  return (
    <main className="dashboard-content pb-16 space-y-6">
      <PageHeader
        icon={<CreditCard size={20} />}
        title="Plano, Faturamento & Créditos"
      />

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
              {subscription?.billing_method === "card" && <CancelSubscriptionButton />}
            </div>
          </div>
        ) : subscription?.status === "active" ? (
          <div>
            <span className="rounded-full bg-amber-500/10 px-3 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
              Plano terminado
            </span>
            <h2 className="mt-2 text-2xl font-bold text-[#191A23] dark:text-white">{plan?.name ?? "Plano Prisma Pro"} terminou em {subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString("pt-BR") : "—"}</h2>
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5">
              Escolha um plano abaixo para reativar. Sem taxa de reativação.
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
            <h2 className="text-xl font-bold text-[#191A23] dark:text-white">Escolha o plano ideal para sua operação</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-zinc-400">
              Cartão renova automaticamente. Pix libera 30 dias sem renovação forçada.
            </p>
          </div>
        )}
      </section>

      <div>
        <h2 className="text-xl font-bold text-[#191A23] dark:text-white">Planos Prisma Player</h2>
        <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-zinc-400">
          Todos os planos recebem o player completo com turbo CDN e pitch delay.
        </p>

        <div className="mt-4 grid items-stretch gap-5 xl:grid-cols-3">
          {plans.map((item) => {
            const isCurrentPlan = subscription?.status === "active" && plan?.slug === item.slug;
            return (
              <article
                key={item.id}
                className={`relative flex min-h-full flex-col rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 shadow-xs ${
                  item.is_featured ? "ring-2 ring-[#B9FF66]" : ""
                }`}
              >
                {item.is_featured && (
                  <span className="absolute right-5 top-5 rounded-full bg-[#B9FF66] px-3 py-0.5 text-[10px] font-bold text-[#191A23]">
                    Mais Escolhido
                  </span>
                )}
                <p className="pr-20 text-lg font-bold text-[#191A23] dark:text-white">{item.name}</p>
                <p className="mt-1 min-h-10 text-xs font-medium text-slate-500 dark:text-zinc-400 leading-relaxed">{item.description}</p>
                <p className="mt-3 text-3xl font-bold text-[#191A23] dark:text-white tracking-tight">
                  {formatBRL(item.amount_cents)}
                  <span className="ml-1 text-xs font-normal text-slate-400 dark:text-zinc-500">/mês</span>
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-card p-2.5">
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase text-slate-400 dark:text-zinc-500">
                      Plays <OverageInfo text={`Após o limite: ${formatPlayOverage(item.play_overage_millicents)} por play.`} />
                    </p>
                    <strong className="mt-0.5 block text-xs font-bold text-[#191A23] dark:text-zinc-100">{item.included_plays.toLocaleString("pt-BR")}/mês</strong>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-card p-2.5">
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase text-slate-400 dark:text-zinc-500">
                      Storage <OverageInfo text={`Após o limite: ${formatStorageOverage(item.storage_overage_cents_per_gb)} por GB/mês.`} />
                    </p>
                    <strong className="mt-0.5 block text-xs font-bold text-[#191A23] dark:text-zinc-100">{item.storage_gb.toLocaleString("pt-BR")} GB</strong>
                  </div>
                </div>

                <div className="mt-5 flex-1 space-y-2.5">
                  {getPlanBenefits(item)
                    .filter((feature) => !feature.includes("plays incluídos") && !feature.includes("GB na biblioteca") && !feature.includes("play excedente") && !feature.includes("GB excedente"))
                    .map((feature) => (
                      <p key={feature} className="flex items-start gap-2 text-xs font-medium text-slate-700 dark:text-zinc-300">
                        <Check size={15} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        {feature}
                      </p>
                    ))}
                </div>

                {isCurrentPlan && subActive ? (
                  <div className="mt-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 p-2.5 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    Seu plano atual
                  </div>
                ) : (
                  <div className="mt-5">
                    <CheckoutActions plan={item.slug} change={currentPlanIndex < 0 ? "subscribe" : planOrder.indexOf(item.slug) > currentPlanIndex ? "upgrade" : "downgrade"} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>

      <div className="pt-4">
        <div>
          <h2 className="flex items-center gap-2.5 text-xl font-bold text-[#191A23] dark:text-white">
            <Image src="/prisma-credits.png" width={36} height={36} alt="Créditos Prisma" className="h-8 w-8 object-contain" />
            Créditos Prisma IA
          </h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-zinc-400">
            Saldo atual: <strong className="font-bold text-[#191A23] dark:text-white">{walletRows[0]?.balance ?? 0} créditos</strong>. Os créditos não expiram.
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {creditRows.map((item) => (
            <article
              key={item.id}
              className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 shadow-xs space-y-2.5"
            >
              <Image src="/prisma-credits.png" width={56} height={56} alt="" aria-hidden="true" className="absolute right-4 top-4 h-10 w-10 object-contain opacity-80" />
              <p className="pr-14 text-sm font-bold text-[#191A23] dark:text-white">{item.name}</p>
              <p className="text-2xl font-bold text-[#191A23] dark:text-white">
                {item.credits + item.bonusCredits} <span className="text-xs font-normal text-slate-400 dark:text-zinc-500">créditos</span>
              </p>
              {item.bonusCredits > 0 && (
                <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-full px-2.5 py-0.5 w-fit">
                  +{item.bonusCredits} de bônus incluídos
                </p>
              )}
              <p className="text-xl font-bold text-[#191A23] dark:text-white">{formatBRL(item.amountCents)}</p>
              <AiCreditCheckoutButton product={item.slug} />
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}

function OverageInfo({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={text} className="grid size-4 place-items-center rounded-full text-slate-400 dark:text-zinc-500 outline-none">
        <Info size={12} />
      </button>
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-52 -translate-x-1/2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-900 dark:bg-card p-2.5 text-[11px] font-medium leading-relaxed text-white shadow-lg group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  );
}
