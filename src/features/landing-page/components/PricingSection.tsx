"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Plus, Minus, ArrowUpRight, Zap, Package } from "lucide-react";

export default function PricingSection() {
  const [openFaq, setOpenFaq] = useState<number | null>(0); // First FAQ open by default like in Figma image

  const plans = [
    {
      name: "Plano Iniciante",
      badge: "Iniciante",
      price: "R$ 97",
      period: "/mês",
      description: "Ideal para produtores e afiliados testando e validando suas primeiras VSLs.",
      plays: "10.000 plays inclusos /mês",
      storage: "25 GB de armazenamento CDN",
      features: [
        "Pitch Delay de Ultra Precisão",
        "Smart Autoplay com Som Simulado",
        "Analytics Básico de Retenção",
        "Proteção DRM Anti-Pirataria",
        "Suporte por E-mail & Ticket",
        "1 Domínio incluso",
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
      price: "R$ 197",
      period: "/mês",
      description: "Perfeito para ofertas validadas com tráfego pago constante e busca por máxima retenção.",
      plays: "50.000 plays inclusos /mês",
      storage: "100 GB de armazenamento CDN",
      features: [
        "Tudo do plano Iniciante",
        "Analytics Segundo a Segundo Avançado",
        "Teste A/B Integrado de Player e Thumb",
        "Customização Total de Cores & Botões",
        "Suporte Prioritário via WhatsApp 24/7",
        "Multi-domínios Ilimitados",
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
      name: "Plano Elite",
      badge: "Escala",
      price: "R$ 397",
      period: "/mês",
      description: "Infraestrutura dedicada com suporte VIP para agências e lançamentos de alto impacto.",
      plays: "200.000 plays inclusos /mês",
      storage: "500 GB de armazenamento CDN",
      features: [
        "Tudo do plano Pro",
        "CDN Dedicada com Baixíssima Latência",
        "Gerente de Conta Dedicado",
        "SLA de 99.99% de Uptime Garantido",
        "Exportação de Audiência para Facebook Ads",
        "Migração de VSLs 100% Assistida",
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
      q: "Existem taxas adicionais ou cobranças surpresa por tráfego?",
      a: "Não! Todos os nossos planos incluem cota mensal transparente de plays e armazenamento CDN. Se a sua operação ultrapassar o limite, a cobrança adicional é informada antecipadamente sem interromper o funcionamento do seu player.",
    },
    {
      q: "Posso alterar ou cancelar meu plano a qualquer momento?",
      a: "Sim, absolutamente. Você pode fazer upgrade, downgrade ou cancelamento da sua assinatura direto pelo painel de controle, sem multas ou fidelidade contratual.",
    },
    {
      q: "Vocês oferecem teste grátis sem cartão de crédito?",
      a: "Oferecemos 14 dias de teste completo e grátis em todos os planos. Você pode cadastrar sua conta em 30 segundos, subir sua VSL e testar a velocidade sem informar cartão de crédito.",
    },
    {
      q: "Como funciona a contagem do tempo no Pitch Delay?",
      a: "O tempo do Pitch Delay é sincronizado estritamente ao segundo de reprodução da VSL. Os botões de checkout só aparecem no momento exato em que o vídeo atinge o tempo configurado, mesmo se o lead pausar ou avançar.",
    },
    {
      q: "O player é compatível com WordPress e Elementor?",
      a: "Sim! O Prisma Player é 100% compatível com Elementor, WordPress, Webflow, GreatPages, Klickpages e qualquer construtor. Basta colar o código de 1 linha.",
    },
    {
      q: "Vocês oferecem suporte para migrar de outros players?",
      a: "Oferecemos migração 100% assistida e gratuita. Nosso time técnico importa todas as suas VSLs e configurações para você não perder nenhum dia de vendas.",
    },
  ];

  return (
    <section id="precos" className="bg-[#F3F3F3] py-20 border-t-2 border-[#191A23]/10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-20">
        
        {/* Section Header */}
        <div>
          <div className="flex flex-col md:flex-row md:items-center gap-6 mb-6">
            <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]">
              Preços & Planos
            </div>
          </div>
          <p className="max-w-2xl text-lg text-[#191A23]/80 font-medium">
            Preços transparentes e competitivos para impulsionar a retenção e as vendas da sua VSL.
          </p>
        </div>

        {/* 3 Pricing Cards Grid (Exact Figma Layout) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {plans.map((plan, idx) => {
            const isDark = plan.bg === "bg-[#191A23]";
            return (
              <div
                key={idx}
                className={`relative rounded-[45px] border-2 border-[#191A23] ${plan.bg} p-8 sm:p-10 shadow-[8px_8px_0px_#191A23] flex flex-col justify-between hover:-translate-y-1 transition-all ${
                  plan.isFeatured ? "ring-4 ring-[#191A23]" : ""
                }`}
              >
                {/* Popular Badge for Pro Plan */}
                {plan.isFeatured && (
                  <span className="absolute top-6 right-6 rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-1 text-xs font-black text-[#191A23] uppercase tracking-wider shadow-[2px_2px_0px_#191A23]">
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

                  <p className={`mt-3 text-xs font-medium ${plan.textColor} opacity-80 min-h-10 leading-relaxed`}>
                    {plan.description}
                  </p>

                  {/* CTAs Inside Card */}
                  <div className="mt-6 space-y-3">
                    <Link
                      href="/signup"
                      className={`w-full inline-flex items-center justify-center rounded-2xl border-2 border-[#191A23] ${plan.btnPrimaryBg} ${plan.btnPrimaryText} px-6 py-3.5 text-sm font-extrabold shadow-[3px_3px_0px_#191A23] hover:opacity-90 transition-all text-center`}
                    >
                      Testar Grátis
                    </Link>

                    <a
                      href="#contato"
                      className={`w-full inline-flex items-center justify-center rounded-2xl border-2 border-[#191A23] ${plan.btnSecondaryBg} ${plan.btnSecondaryText} px-6 py-3.5 text-sm font-bold shadow-[2px_2px_0px_#191A23] hover:bg-[#B9FF66]/20 transition-all text-center`}
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
                      <span>{plan.storage}</span>
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

        {/* FAQ Section (Frequently Asked Questions - Matching Figma Image) */}
        <div className="pt-12 space-y-10">
          <div className="flex items-center gap-4">
            <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]">
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
                      ? "bg-[#B9FF66] shadow-[6px_6px_0px_#191A23]"
                      : "bg-[#F3F3F3] shadow-[4px_4px_0px_#191A23] hover:bg-white"
                  } p-6 sm:p-8 cursor-pointer`}
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-lg sm:text-xl font-black text-[#191A23]">
                      {faq.q}
                    </h3>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#191A23] bg-white shadow-[2px_2px_0px_#191A23]">
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
