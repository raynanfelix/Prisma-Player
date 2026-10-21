"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BillingPlan } from "@/lib/billing/catalog";
import { formatBRL, formatPlayOverage, getPlanBenefits, TRIAL_PLAN_SLUG } from "@/lib/billing/catalog";
import { PlanCheckoutButton, PlanSwitchButton } from "@/features/account/components/BillingCheckoutButtons";

type BillingCycle = "monthly" | "annual";

/**
 * Vitrine de planos do app com o toggle mensal/anual (spec Impecável, item 3).
 * O ciclo é estado local do client: muda o preço exibido e o `billing` que o
 * botão envia ao /api/billing/checkout (a rota aceita monthly|annual). Padrão
 * ANUAL - a mesma oferta que a landing apresenta primeiro (34% de desconto),
 * com o valor à vista sempre visível no card antes do clique.
 *
 * Pill do ciclo segue o toggle da casa (bg-selected: tinta no claro, lima no
 * escuro) com o selo "Economize 34%" em verde-lima nos dois temas - mesmo
 * padrão do PricingSection da landing.
 *
 * Marcação de plano atual (spec Billing Completo, itens 1 e 2):
 * - Assinatura vigente → card do plano com badge "Seu plano atual" e sem
 *   botão; demais cards abrem o Customer Portal ("Mudar para este plano").
 * - Trial vigente (sem assinatura) → card do Escala (nível do teste) com
 *   badge "Seu plano atual (teste)" e botão desabilitado; demais cards
 *   seguem com checkout normal - upgrade continua disponível sempre.
 */
export function BillingPlansShowcase({
  plans,
  currentPlanSlug,
  showPortal,
  hasPlan,
  trialActive = false,
}: {
  plans: BillingPlan[];
  currentPlanSlug: string | null;
  showPortal: boolean;
  hasPlan: boolean;
  trialActive?: boolean;
}) {
  const [cycle, setCycle] = useState<BillingCycle>("annual");

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#191A23] dark:text-white">Planos Prisma Player</h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-zinc-400">
            Escolha o plano ideal para a sua operação - assinatura recorrente com checkout Stripe.
          </p>
        </div>
        <div
          role="group"
          aria-label="Ciclo de cobrança"
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-card p-1"
        >
          <button
            type="button"
            onClick={() => setCycle("monthly")}
            aria-pressed={cycle === "monthly"}
            className={`rounded-full px-4 py-1.5 text-xs transition ${
              cycle === "monthly"
                ? "bg-selected font-bold text-selected-foreground"
                : "font-semibold text-slate-500 dark:text-zinc-400 hover:text-[#191A23] dark:hover:text-white"
            }`}
          >
            Mensal
          </button>
          <button
            type="button"
            onClick={() => setCycle("annual")}
            aria-pressed={cycle === "annual"}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs transition ${
              cycle === "annual"
                ? "bg-selected font-bold text-selected-foreground"
                : "font-semibold text-slate-500 dark:text-zinc-400 hover:text-[#191A23] dark:hover:text-white"
            }`}
          >
            Anual
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                cycle === "annual" ? "bg-[#B9FF66] text-[#191A23]" : "bg-black/[0.06] text-slate-500 dark:bg-white/10 dark:text-zinc-400"
              }`}
            >
              Economize 34%
            </span>
          </button>
        </div>
      </div>
      <div className="grid items-stretch gap-5 xl:grid-cols-3">
        {plans.map((item) => {
          const isCurrentPlan = currentPlanSlug === item.slug;
          // Trial = ALL_CAPABILITIES = nível Escala; a assinatura real (se
          // houver) sempre vence a marcação do teste.
          const isTrialPlan = trialActive && !isCurrentPlan && !showPortal && item.slug === TRIAL_PLAN_SLUG;
          const priceCents = cycle === "annual" ? item.annual_monthly_equivalent : item.amount_cents;
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
              {isTrialPlan && (
                <span className="mt-3 w-fit rounded-full bg-[#B9FF66] px-3 py-0.5 text-[10px] font-bold text-[#191A23]">
                  Seu plano atual (teste)
                </span>
              )}
              <p className="mt-3 text-3xl font-bold tracking-tight text-[#191A23] dark:text-white">
                {formatBRL(priceCents)}
                <span className="ml-1 text-xs font-medium text-slate-400 dark:text-zinc-500">/mês</span>
              </p>
              {cycle === "annual" && (
                <p className="mt-1.5 w-fit rounded-full bg-[#B9FF66]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#191A23] dark:bg-[#B9FF66]/10 dark:text-[#B9FF66]">
                  Cobrado {formatBRL(item.annual_amount_cents)} à vista/ano - economize 34%
                </p>
              )}
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
              {isCurrentPlan ? (
                <span className="mt-5 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-xs font-bold bg-[#B9FF66] text-[#191A23]">
                  Seu plano atual
                </span>
              ) : isTrialPlan ? (
                <Button type="button" className="mt-5 w-full text-xs" disabled>
                  Incluído no seu teste
                </Button>
              ) : showPortal ? (
                <PlanSwitchButton />
              ) : (
                <PlanCheckoutButton
                  planSlug={item.slug}
                  label={hasPlan ? "Mudar para este plano" : "Assinar este plano"}
                  billing={cycle}
                />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
