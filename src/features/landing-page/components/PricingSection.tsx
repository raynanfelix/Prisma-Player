"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Plus, Minus, ArrowUpRight, Zap, Package } from "lucide-react";

export default function PricingSection() {
  const [openFaq, setOpenFaq] = useState<number | null>(0); // Primeira FAQ aberta por padrão
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
      bg: "bg-white",
      textColor: "text-[#191A23]",
      btnPrimaryBg: "bg-[#191A23]",
      btnPrimaryText: "text-white",
      btnSecondaryBg: "bg-white",
      btnSecondaryText: "text-[#191A23]",
      isFeatured: false,
    },
    {
      name: "Plano Pro",
      badge: "Popular",
      priceMonthly: "147,90",
      priceAnnual: "97,90",
      annualTotal: "R$ 1.174,80",
      description: "Para ofertas validadas com tráfego pago constante e trabalho recorrente de retenção.",
      plays: "50.000 plays inclusos /mês",
      features: [
        "Tudo do plano Iniciante",
        "Analytics segundo a segundo",
        "Teste A/B de player e thumbnail",
        "Customização de cores e controles",
        "Suporte prioritário via WhatsApp 24/7",
        "Multi-domínios ilimitados",
      ],
      bg: "bg-[#191A23]",
      textColor: "text-white",
      btnPrimaryBg: "bg-[#B9FF66]",
      btnPrimaryText: "text-[#191A23]",
      btnSecondaryBg: "bg-[#191A23]",
      btnSecondaryText: "text-white border-white/40",
      isFeatured: true,
    },
    {
      name: "Plano Escala",
      badge: "Escala",
      priceMonthly: "347,90",
      priceAnnual: "229,90",
      annualTotal: "R$ 2.758,80",
      description: "Para agências, coprodutores e lançamentos de alto volume que precisam de suporte próximo.",
      plays: "200.000 plays inclusos /mês",
      features: [
        "Tudo do plano Pro",
        "Gerente de conta dedicado",
        "SLA documentado por contrato",
        "Exportação de audiência para Facebook Ads",
        "Migração de VSLs assistida",
        "Onboarding acompanhado",
      ],
      bg: "bg-white",
      textColor: "text-[#191A23]",
      btnPrimaryBg: "bg-[#191A23]",
      btnPrimaryText: "text-white",
      btnSecondaryBg: "bg-white",
      btnSecondaryText: "text-[#191A23]",
      isFeatured: false,
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
    <section id="precos" className="bg-white py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-16">

        {/* Section Header — estilo AbacatePay: título grande direto */}
        <div>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-[#191A23]">
            Preços & Planos
          </h2>
          <p className="mt-4 max-w-2xl text-base sm:text-lg font-medium text-[#191A23]/60">
            Preços transparentes para impulsionar a retenção e as vendas da sua VSL. A cobrança anual economiza 34%, e é a opção que mais clientes escolhem.
          </p>
        </div>

        {/* Monthly / Annual Toggle, Anual ativo por padrão */}
        <div className="flex justify-center">
          <div
            role="group"
            aria-label="Ciclo de cobrança"
            className="inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-[#191A23]/10 bg-white p-1.5 shadow-sm"
          >
            <button
              type="button"
              onClick={() => setIsAnnual(false)}
              aria-pressed={!isAnnual}
              className={`rounded-full px-5 py-2.5 text-sm font-bold text-[#191A23] transition-all ${
                !isAnnual
                  ? "bg-[#B9FF66] font-extrabold shadow-sm"
                  : "text-[#191A23]/60 hover:text-[#191A23]"
              }`}
            >
              Cobrança Mensal
            </button>
            <button
              type="button"
              onClick={() => setIsAnnual(true)}
              aria-pressed={isAnnual}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-[#191A23] transition-all ${
                isAnnual
                  ? "bg-[#B9FF66] font-extrabold shadow-sm"
                  : "text-[#191A23]/60 hover:text-[#191A23]"
              }`}
            >
              Cobrança Anual
              <span className="rounded-full bg-[#191A23] px-2 py-0.5 text-[10px] font-black text-[#B9FF66]">
                Economize 34%
              </span>
            </button>
          </div>
        </div>

        {/* 3 Pricing Cards — estilo AbacatePay: card limpo, badge no topo, preço grande */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-stretch pt-4">
          {plans.map((plan, idx) => (
            <div
              key={idx}
              className={`relative flex flex-col rounded-3xl bg-white p-8 sm:p-9 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10 ${
                plan.isFeatured
                  ? "border-2 border-[#B9FF66] shadow-lg shadow-[#B9FF66]/20"
                  : "border border-[#191A23]/10 shadow-sm"
              }`}
            >
              {/* Featured Badge — pill no topo centralizado */}
              {plan.isFeatured && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#B9FF66] px-4 py-1 text-[10px] font-black text-[#191A23] uppercase tracking-widest shadow-sm">
                  {plan.badge}
                </span>
              )}

              <div className="flex flex-1 flex-col">
                {/* Plan Name & Price */}
                <h3 className="text-sm font-bold uppercase tracking-wide text-[#191A23]/50">{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-5xl sm:text-6xl font-extrabold tracking-tight text-[#191A23]">
                    R$ {isAnnual ? plan.priceAnnual : plan.priceMonthly}
                  </span>
                  <span className="text-sm font-semibold text-[#191A23]/50">/mês</span>
                </div>
                <p className="mt-1 text-xs font-medium text-[#191A23]/50">
                  {isAnnual
                    ? `no plano anual, cobrado ${plan.annualTotal} à vista`
                    : "na cobrança mensal, sem fidelidade"}
                </p>

                <p className="mt-4 text-sm font-medium text-[#191A23]/70 leading-relaxed">
                  {plan.description}
                </p>

                {/* CTAs Inside Card — featured sólido verde, demais outline */}
                <div className="mt-6 space-y-2.5">
                  <Link
                    href="/signup"
                    className={`w-full inline-flex items-center justify-center rounded-full px-6 py-3.5 text-sm font-bold transition-all text-center ${
                      plan.isFeatured
                        ? "bg-[#B9FF66] text-[#191A23] font-extrabold hover:bg-[#a8f052] shadow-sm"
                        : "bg-[#191A23] text-white hover:bg-[#191A23]/90"
                    }`}
                  >
                    Testar 14 Dias Grátis
                  </Link>

                  <a
                    href="#contato"
                    className="w-full inline-flex items-center justify-center rounded-full border border-[#191A23]/15 px-6 py-3.5 text-sm font-bold text-[#191A23]/70 transition-all text-center hover:border-[#191A23]/30 hover:text-[#191A23]"
                  >
                    Falar com Vendas
                  </a>
                </div>

                {/* Capacity Badges — pill simples */}
                <div className="mt-6 space-y-2">
                  <div className="flex items-center gap-2 rounded-full bg-[#B9FF66]/10 px-3.5 py-2 text-xs font-bold text-[#191A23]">
                    <Zap className="h-4 w-4 shrink-0 text-[#191A23]" />
                    <span>{plan.plays}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-[#191A23]/5 px-3.5 py-2 text-xs font-bold text-[#191A23]/70">
                    <Package className="h-4 w-4 shrink-0" />
                    <span>R$ 0,02 por play adicional</span>
                  </div>
                </div>

                {/* Feature Checkmarks List — check verde simples */}
                <div className="mt-6 space-y-2.5 border-t border-[#191A23]/8 pt-6">
                  {plan.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 shrink-0 text-[#191A23]" strokeWidth={3} />
                      <span className="text-xs font-semibold text-[#191A23]/80">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer Link */}
              <div className="mt-8">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#191A23]/50 transition-colors hover:text-[#191A23]"
                >
                  <span>Ver todos os limites técnicos</span>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ Section — estilo AbacatePay: card limpo com divisória suave */}
        <div className="pt-14 space-y-8">
          <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#191A23]">
            Perguntas Frequentes (FAQ)
          </h3>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className={`rounded-2xl border transition-all duration-300 cursor-pointer ${
                    isOpen
                      ? "border-[#191A23]/15 bg-white shadow-sm"
                      : "border-[#191A23]/8 bg-[#191A23]/[0.03] hover:bg-white"
                  } p-6 sm:p-7`}
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <h4 className="text-base sm:text-lg font-bold text-[#191A23]">
                      {faq.q}
                    </h4>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#B9FF66]/15">
                      {isOpen ? (
                        <Minus className="h-4 w-4 text-[#191A23]" />
                      ) : (
                        <Plus className="h-4 w-4 text-[#191A23]" />
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-4 pt-4 border-t border-[#191A23]/8">
                      <p className="text-sm font-medium text-[#191A23]/70 leading-relaxed">
                        {faq.a}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
}
