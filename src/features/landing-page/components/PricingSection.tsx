"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Plus, Minus, ArrowUpRight, Zap, Package } from "lucide-react";

export default function PricingSection() {
  const [openFaq, setOpenFaq] = useState<number | null>(0); // Primeira FAQ aberta por padrão

  // A home apresenta o plano anual como oferta principal (padrão do /pricing).
  const plans = [
    {
      name: "Plano Iniciante",
      badge: "Iniciante",
      price: "R$ 44,90",
      period: "/mês no plano anual",
      altPrice: "ou R$ 67,90/mês na cobrança mensal",
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
      price: "R$ 97,90",
      period: "/mês no plano anual",
      altPrice: "ou R$ 147,90/mês na cobrança mensal",
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
      price: "R$ 229,90",
      period: "/mês no plano anual",
      altPrice: "ou R$ 347,90/mês na cobrança mensal",
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
      a: "Não. Todos os planos incluem cota mensal transparente de plays. Se a sua operação ultrapassar o limite, cada play adicional custa R$ 0,02 — informado antecipadamente, sem interromper o funcionamento do seu player.",
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
    <section id="precos" className="bg-[#F3F3F3] py-20 border-t-2 border-[#191A23]/10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-20">

        {/* Section Header */}
        <div>
          <div className="flex flex-col md:flex-row md:items-center gap-6 mb-6">
            <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[2px_2px_0px_#191A23]">
              Preços & Planos
            </div>
          </div>
          <p className="max-w-2xl text-lg text-[#191A23]/80 font-medium">
            Preços transparentes para impulsionar a retenção e as vendas da sua VSL. A cobrança anual economiza 34% — é a opção que mais clientes escolhem.
          </p>
        </div>

        {/* 3 Pricing Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {plans.map((plan, idx) => {
            const isDark = plan.bg === "bg-[#191A23]";
            return (
              <div
                key={idx}
                className={`relative rounded-[35px] border-2 border-[#191A23] ${plan.bg} p-8 sm:p-10 shadow-[4px_4px_0px_#191A23] flex flex-col justify-between hover:-translate-y-1 transition-all ${
                  plan.isFeatured ? "ring-4 ring-[#191A23]" : ""
                }`}
              >
                {/* Featured Badge */}
                {plan.isFeatured && (
                  <span className="absolute top-6 right-6 rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-1 text-xs font-black text-[#191A23] uppercase tracking-wider shadow-[1px_1px_0px_#191A23]">
                    {plan.badge}
                  </span>
                )}

                <div>
                  {/* Plan Name & Price */}
                  <h3 className={`text-2xl font-black ${plan.textColor}`}>{plan.name}</h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className={`text-4xl sm:text-5xl font-black ${plan.textColor} tracking-tight font-mono`}>
                      {plan.price}
                    </span>
                    <span className={`text-sm font-bold ${plan.textColor} opacity-70`}>
                      {plan.period}
                    </span>
                  </div>
                  <p className={`mt-1 text-xs font-medium ${plan.textColor} opacity-70`}>
                    {plan.altPrice}
                  </p>

                  <p className={`mt-4 text-xs font-medium ${plan.textColor} opacity-80 min-h-10 leading-relaxed`}>
                    {plan.description}
                  </p>

                  {/* CTAs Inside Card */}
                  <div className="mt-6 space-y-3">
                    <Link
                      href="/signup"
                      className={`w-full inline-flex items-center justify-center rounded-2xl border-2 border-[#191A23] ${plan.btnPrimaryBg} ${plan.btnPrimaryText} px-6 py-3.5 text-sm font-extrabold shadow-[2px_2px_0px_#191A23] hover:opacity-90 transition-all text-center`}
                    >
                      Testar 14 Dias Grátis
                    </Link>

                    <a
                      href="#contato"
                      className={`w-full inline-flex items-center justify-center rounded-2xl border-2 border-[#191A23] ${plan.btnSecondaryBg} ${plan.btnSecondaryText} px-6 py-3.5 text-sm font-bold hover:bg-[#B9FF66]/20 transition-all text-center`}
                    >
                      Falar com Vendas
                    </a>
                  </div>

                  {/* Capacity Badges */}
                  <div className="mt-6 pt-6 border-t border-[#191A23]/20 space-y-2">
                    <div className={`rounded-xl border border-[#191A23]/20 ${isDark ? "bg-white/10" : "bg-[#F3F3F3]"} p-2.5 text-xs font-bold ${plan.textColor} flex items-center gap-2`}>
                      <Zap className="h-4 w-4 shrink-0 text-[#B9FF66]" />
                      <span>{plan.plays}</span>
                    </div>
                    <div className={`rounded-xl border border-[#191A23]/20 ${isDark ? "bg-white/10" : "bg-[#F3F3F3]"} p-2.5 text-xs font-bold ${plan.textColor} flex items-center gap-2`}>
                      <Package className="h-4 w-4 shrink-0 text-[#B9FF66]" />
                      <span>R$ 0,02 por play adicional</span>
                    </div>
                  </div>

                  {/* Feature Checkmarks List */}
                  <div className="mt-6 space-y-3">
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#B9FF66] border border-[#191A23]">
                          <Check className="h-3.5 w-3.5 text-[#191A23]" />
                        </div>
                        <span className={`text-xs font-semibold ${plan.textColor} opacity-90`}>
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Link */}
                <div className="mt-8 pt-4 border-t border-[#191A23]/15">
                  <Link
                    href="/signup"
                    className={`inline-flex items-center gap-1.5 text-xs font-bold ${plan.textColor} underline underline-offset-4`}
                  >
                    <span>Ver todos os limites técnicos</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="pt-12 space-y-10">
          <div className="flex items-center gap-4">
            <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[2px_2px_0px_#191A23]">
              Perguntas Frequentes (FAQ)
            </div>
          </div>

          <div className="space-y-5">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className={`rounded-[30px] border-2 border-[#191A23] transition-all duration-300 ${
                    isOpen
                      ? "bg-white shadow-[3px_3px_0px_#B9FF66]"
                      : "bg-[#F3F3F3] shadow-[2px_2px_0px_#191A23] hover:bg-white"
                  } p-6 sm:p-8 cursor-pointer`}
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-lg sm:text-xl font-black text-[#191A23]">
                      {faq.q}
                    </h3>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#191A23] bg-white shadow-[1px_1px_0px_#191A23]">
                      {isOpen ? (
                        <Minus className="h-5 w-5 text-[#191A23]" />
                      ) : (
                        <Plus className="h-5 w-5 text-[#191A23]" />
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-4 pt-4 border-t-2 border-[#191A23]">
                      <p className="text-base font-medium text-[#191A23] leading-relaxed">
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
