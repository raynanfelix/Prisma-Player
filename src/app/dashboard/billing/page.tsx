import Image from "next/image";
import { CreditCard, QrCode } from "lucide-react";
import { eq } from "drizzle-orm";
import PageHeader from "@/components/dashboard/PageHeader";
import Reveal from "@/components/motion/reveal";
import { requireUser } from "@/lib/auth/server";
import { getAccountAccess, isSubscriptionEffective } from "@/lib/access/service";
import { CATALOG_CREDIT_PACKAGES, CATALOG_PLANS, formatBRL } from "@/lib/billing/catalog";
import { CreditsCheckoutButton, ManageSubscriptionButton } from "@/features/account/components/BillingCheckoutButtons";
import { BillingPlansShowcase } from "@/features/account/components/BillingPlansShowcase";
import { db, schema } from "@/lib/db";

const { aiCreditWallets, billingPlans, subscriptions } = schema;

export const dynamic = "force-dynamic";

type BillingSearchParams = { checkout?: string };

export default async function BillingPage({ searchParams }: { searchParams: Promise<BillingSearchParams> }) {
  const userId = await requireUser("/dashboard/billing");
  const [params, subscriptionRows, access] = await Promise.all([
    searchParams,
    db.select({
      status: subscriptions.status,
      billingMethod: subscriptions.billingMethod,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      provider: subscriptions.provider,
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
    provider: subscriptionRow.provider,
    plan: subscriptionRow.planSlug ? { slug: subscriptionRow.planSlug, name: subscriptionRow.planName ?? "" } : null,
  } : null;
  const plan = subscription?.plan ?? null;
  // Verdade efetiva, não status cru: linha `active` com período vencido é
  // plano terminado (o cron marca `expired`, mas a tela não pode mentir).
  const subActive = isSubscriptionEffective(subscription ? { status: subscription.status, current_period_end: subscription.current_period_end } : null);
  // Portal só para assinatura DO Stripe (profiles.stripe_customer_id existe):
  // assinatura legada (AbacatePay) continua com os CTAs de plano para migrar.
  const showPortal = subActive && subscription?.provider === "stripe";

  return (
    <main className="dashboard-content pb-16 space-y-6">
      <PageHeader
        icon={<CreditCard size={20} />}
        title="Plano, Faturamento & Créditos"
      />

      {params.checkout === "success" && (
        <Reveal>
          <div role="status" className="rounded-2xl border border-[#B9FF66]/40 bg-[#B9FF66]/10 px-5 py-4 text-xs font-medium text-[#191A23] dark:text-[#B9FF66]">
            <strong className="font-bold">Pagamento confirmado — processando.</strong> A liberação do plano/créditos
            acontece automaticamente em instantes (confirmação via webhook); se não aparecer, recarregue em alguns segundos.
          </div>
        </Reveal>
      )}
      {params.checkout === "cancelled" && (
        <Reveal>
          <div role="status" className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-card px-5 py-4 text-xs font-medium text-slate-600 dark:text-zinc-300">
            Checkout cancelado — nenhuma cobrança foi feita.
          </div>
        </Reveal>
      )}

      <Reveal delay={0.04}>
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
              {showPortal && <ManageSubscriptionButton />}
            </div>
          </div>
        ) : subscription?.status === "active" ? (
          <div>
            <span className="rounded-full bg-amber-500/10 px-3 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
              Plano terminado
            </span>
            <h2 className="mt-2 text-2xl font-bold text-[#191A23] dark:text-white">{plan?.name ?? "Plano Prisma Pro"} terminou em {subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString("pt-BR") : "—"}</h2>
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5">
              Reative por aqui em segundos — o checkout já está no ar.
            </p>
          </div>
        ) : access.trialStatus === "active" ? (
          <div>
            <span className="rounded-full bg-[#B9FF66] px-3 py-0.5 text-xs font-bold text-[#191A23]">
              TESTE 14 DIAS ATIVO
            </span>
            <h2 className="mt-2 text-2xl font-bold text-[#191A23] dark:text-white">Acesso completo liberado — nível Escala durante o teste</h2>
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5">
              Seu teste termina em {access.trialEndsAt ? new Date(access.trialEndsAt).toLocaleDateString("pt-BR") : "14 dias"}. Nenhuma cobrança automática.
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-xl font-bold text-[#191A23] dark:text-white">Nenhum plano ativo</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-zinc-400">
              Assine o plano ideal para a sua operação por aqui — o checkout leva alguns segundos.
            </p>
          </div>
        )}
        </section>
      </Reveal>

      <Reveal delay={0.08}>
        <BillingPlansShowcase
          plans={CATALOG_PLANS}
          currentPlanSlug={subActive ? (plan?.slug ?? null) : null}
          showPortal={showPortal}
          hasPlan={Boolean(subscription?.plan)}
          trialActive={access.trialActive}
        />
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
                <CreditsCheckoutButton packageSlug={item.slug} />
              </article>
            ))}
          </div>
        </section>
      </Reveal>
    </main>
  );
}
