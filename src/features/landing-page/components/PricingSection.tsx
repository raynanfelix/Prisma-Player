"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Plus, Minus, ArrowUpRight, Zap, Package } from "lucide-react";

export default function PricingSection() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  // Anual ativo por padrão: é a oferta que queremos apresentar primeiro.
  const [isAnnual, setIsAnnual] = useState(true);

  const plans = [
    {
      name: "Plano Iniciante",
      badge: "Iniciante",
      priceMonthly: "67,90",
      priceAnnual: "44,90",
      annualTotal: "R$ 538,80",
      description: "Para produtores e afiliados testando e validando suas primeiras VSLs.",
      plays: "10.000 plays inclusos /mês",
      features: [
        "Pitch Delay sincronizado ao segundo",
        "Autoplay com clique para ouvir",
        "Analytics de retenção",
        "Proteção anti-download",
        "Suporte por e-mail & ticket",
        "1 domínio incluso",
      ],
      featured: false,
    },
    {
      name: "Plano Pro",
      badge: "Popular",
      priceMonthly: "147,90",
      priceAnnual: "97,90",
      annualTotal: "R$ 1.174,80",
      description:
        "Para ofertas validadas com tráfego pago constante e trabalho recorrente de retenção.",
      plays: "50.000 plays inclusos /mês",
      features: [
        "Tudo do plano Iniciante",
        "Analytics segundo a segundo",
        "Teste A/B de player e thumbnail",
        "Customização de cores e controles",
        "Suporte prioritário via WhatsApp 24/7",
        "Multi-domínios ilimitados",
      ],
      featured: true,
    },
    {
      name: "Plano Escala",
      badge: "Escala",
      priceMonthly: "347,90",
      priceAnnual: "229,90",
      annualTotal: "R$ 2.758,80",
      description:
        "Para agências, coprodutores e lançamentos de alto volume que precisam de suporte próximo.",
      plays: "200.000 plays inclusos /mês",
      features: [
        "Tudo do plano Pro",
        "Gerente de conta dedicado",
        "SLA documentado por contrato",
        "Exportação de audiência para Facebook Ads",
        "Migração de VSLs assistida",
        "Onboarding acompanhado",
      ],
      featured: false,
    },
  ];

  const faqs = [
    {
      q: "Como funciona a cobrança anual?",
      a: "O plano anual é cobrado uma única vez por ano, com 34% de desconto em relação ao mensal. Você pode trocar de plano ou desativar a renovação a qualquer momento pelo painel.",
    },
    {
      q: "Existem taxas adicionais ou cobranças surpresa por tráfego?",
      a: "Não. Todos os planos incluem cota mensal transparente de plays. Se a sua operação ultrapassar o limite, cada play adicional custa R$ 0,02, informado antecipadamente, sem interromper o funcionamento do seu player.",
    },
    {
      q: "Posso alterar ou cancelar meu plano a qualquer momento?",
      a: "Sim. Você pode fazer upgrade, downgrade ou cancelamento da sua assinatura direto pelo painel de controle, sem multas ou fidelidade contratual.",
    },
    {
      q: "Vocês oferecem teste grátis sem cartão de crédito?",
      a: "Sim, 14 dias de teste completo e grátis em todos os planos. Crie a sua conta, suba a VSL e teste o player sem informar cartão de crédito.",
    },
    {
      q: "Como funciona a contagem do tempo no Pitch Delay?",
      a: "O tempo do Pitch Delay é sincronizado às funções de reprodução da VSL. Os botões de checkout só aparecem no momento configurado, mesmo se o lead pausar ou avançar o vídeo.",
    },
    {
      q: "O player é compatível com WordPress e Elementor?",
      a: "Sim. O Prisma Player funciona em Elementor, WordPress, Webflow, GreatPages, Klickpages e outros construtores. Basta colar o código de 1 linha.",
    },
    {
      q: "Vocês oferecem suporte para migrar de outros players?",
      a: "Nos planos Pro e Escala, a migração das suas VSLs e configurações é assistida pelo nosso time. Fale com a gente pelo formulário abaixo e agende.",
    },
  ];

  return (
    <section id="precos" className="scroll-mt-28 bg-[#FAFAFB] py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#191A23]/50 ring-1 ring-[#191A23]/[0.06]">
            Preços &amp; Planos
          </span>
          <h2 className="mt-5 text-balance text-[22px] font-medium leading-snug tracking-tight text-[#191A23] sm:text-[26px]">
            Preços transparentes para impulsionar a retenção e as vendas da sua VSL. A cobrança
            anual economiza 34%, e é a opção que mais clientes escolhem.
          </h2>
        </div>

        <div className="mt-10 flex justify-center">
          <div
            role="group"
            aria-label="Ciclo de cobrança"
            className="inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-[#191A23]/[0.07] bg-white p-1"
          >
            <button
              type="button"
              onClick={() => setIsAnnual(false)}
              aria-pressed={!isAnnual}
              className={`rounded-full px-5 py-2 text-[13px] transition ${
                !isAnnual
                  ? "bg-[#191A23] font-medium text-white"
                  : "font-medium text-[#191A23]/55 hover:text-[#191A23]"
              }`}
            >
              Cobrança Mensal
            </button>
            <button
              type="button"
              onClick={() => setIsAnnual(true)}
              aria-pressed={isAnnual}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-[13px] transition ${
                isAnnual
                  ? "bg-[#191A23] font-medium text-white"
                  : "font-medium text-[#191A23]/55 hover:text-[#191A23]"
              }`}
            >
              Cobrança Anual
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  isAnnual ? "bg-[#B9FF66] text-[#191A23]" : "bg-[#191A23]/[0.06] text-[#191A23]/60"
                }`}
              >
                Economize 34%
              </span>
            </button>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
          {plans.map((plan, idx) => (
            <div
              key={idx}
              className={`relative flex flex-col rounded-[28px] p-7 transition duration-300 ${
                plan.featured
                  ? "bg-[#191A23] text-white shadow-[0_40px_80px_-45px_rgba(25,26,35,0.75)]"
                  : "border border-[#191A23]/[0.07] bg-white hover:-translate-y-0.5 hover:shadow-[0_30px_60px_-45px_rgba(25,26,35,0.4)]"
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-7 rounded-full bg-[#B9FF66] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#191A23]">
                  {plan.badge}
                </span>
              )}

              <div className="flex flex-1 flex-col">
                <h3
                  className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${
                    plan.featured ? "text-white/45" : "text-[#191A23]/40"
                  }`}
                >
                  {plan.name}
                </h3>

                <div className="mt-3 flex items-baseline gap-1">
                  <span
                    className={`text-[40px] font-semibold tracking-[-0.03em] ${
                      plan.featured ? "text-white" : "text-[#191A23]"
                    }`}
                  >
                    R$ {isAnnual ? plan.priceAnnual : plan.priceMonthly}
                  </span>
                  <span
                    className={`text-[12px] font-medium ${
                      plan.featured ? "text-white/45" : "text-[#191A23]/40"
                    }`}
                  >
                    /mês
                  </span>
                </div>
                <p
                  className={`mt-1 text-[11px] ${
                    plan.featured ? "text-white/40" : "text-[#191A23]/40"
                  }`}
                >
                  {isAnnual
                    ? `no plano anual, cobrado ${plan.annualTotal} à vista`
                    : "na cobrança mensal, sem fidelidade"}
                </p>

                <p
                  className={`mt-4 text-[13px] leading-relaxed ${
                    plan.featured ? "text-white/60" : "text-[#191A23]/55"
                  }`}
                >
                  {plan.description}
                </p>

                <div className="mt-6 space-y-2">
                  <Link
                    href="/signup"
                    className={`inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-[13px] font-medium transition ${
                      plan.featured
                        ? "bg-[#B9FF66] text-[#191A23] hover:bg-[#a8f052]"
                        : "bg-[#191A23] text-white hover:bg-[#191A23]/90"
                    }`}
                  >
                    Testar 14 Dias Grátis
                  </Link>

                  <a
                    href="#contato"
                    className={`inline-flex w-full items-center justify-center rounded-full border px-5 py-3 text-[13px] font-medium transition-colors ${
                      plan.featured
                        ? "border-white/15 text-white/70 hover:text-white"
                        : "border-[#191A23]/10 text-[#191A23]/60 hover:text-[#191A23]"
                    }`}
                  >
                    Falar com Vendas
                  </a>
                </div>

                <div className="mt-5 space-y-1.5">
                  <div
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium ${
                      plan.featured ? "bg-white/[0.06] text-white/70" : "bg-[#B9FF66]/20 text-[#191A23]"
                    }`}
                  >
                    <Zap className="h-3.5 w-3.5 shrink-0" />
                    <span>{plan.plays}</span>
                  </div>
                  <div
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium ${
                      plan.featured ? "bg-white/[0.04] text-white/45" : "bg-[#191A23]/[0.03] text-[#191A23]/50"
                    }`}
                  >
                    <Package className="h-3.5 w-3.5 shrink-0" />
                    <span>R$ 0,02 por play adicional</span>
                  </div>
                </div>

                <div
                  className={`mt-5 space-y-2.5 border-t pt-5 ${
                    plan.featured ? "border-white/10" : "border-[#191A23]/[0.06]"
                  }`}
                >
                  {plan.features.map((feature, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <Check
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          plan.featured ? "text-[#B9FF66]" : "text-[#191A23]"
                        }`}
                        strokeWidth={2.5}
                      />
                      <span
                        className={`text-[12px] leading-snug ${
                          plan.featured ? "text-white/70" : "text-[#191A23]/70"
                        }`}
                      >
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <Link
                  href="/signup"
                  className={`inline-flex items-center gap-1 text-[11.5px] font-medium transition-colors ${
                    plan.featured
                      ? "text-white/40 hover:text-white"
                      : "text-[#191A23]/40 hover:text-[#191A23]"
                  }`}
                >
                  <span>Ver todos os limites técnicos</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-20">
          <h3 className="text-center text-[22px] font-semibold tracking-tight text-[#191A23] sm:text-[26px]">
            Perguntas Frequentes (FAQ)
          </h3>

          <div className="mx-auto mt-8 max-w-3xl space-y-2">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className={`rounded-2xl border transition duration-300 ${
                    isOpen
                      ? "border-[#191A23]/[0.09] bg-white"
                      : "border-[#191A23]/[0.06] bg-white/60 hover:bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left"
                  >
                    <h4 className="text-[14px] font-medium text-[#191A23]">{faq.q}</h4>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#191A23]/[0.04] text-[#191A23]/60">
                      {isOpen ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    </span>
                  </button>

                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 pb-5 text-[13px] leading-relaxed text-[#191A23]/55">
                        {faq.a}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
