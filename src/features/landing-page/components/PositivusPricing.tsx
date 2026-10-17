"use client";

import Nav from "./Nav";
import Footer from "./Footer";
import Link from "next/link";
import { useState } from "react";
import { Check, Sparkles, Zap, Shield, ArrowUpRight, Star, Package } from "lucide-react";

interface PositivusPricingProps {
  account?: { firstName: string } | null;
}

export default function PositivusPricing({ account }: PositivusPricingProps) {
  // Anual vem ativado por padrão: é a oferta que queremos apresentar primeiro.
  const [isAnnual, setIsAnnual] = useState(true);

  const plans = [
    {
      name: "Iniciante",
      badge: "Para Validar a Oferta",
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
      btnBg: "bg-[#191A23]",
      btnText: "text-white",
      isFeatured: false,
    },
    {
      name: "Pro",
      badge: "Mais Escolhido",
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
      btnBg: "bg-[#B9FF66]",
      btnText: "text-[#191A23]",
      isFeatured: true,
    },
    {
      name: "Escala",
      badge: "Lançamentos & Agências",
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
      btnBg: "bg-[#191A23]",
      btnText: "text-white",
      isFeatured: false,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F3F3F3] text-[#191A23] font-sans antialiased selection:bg-[#B9FF66] selection:text-[#191A23]">
      <Nav account={account} />

      <main className="py-12 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-16">

          {/* Header */}
          <div className="text-center space-y-6 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-1.5 text-xs font-black uppercase text-[#191A23] shadow-[2px_2px_0px_#191A23]">
              <Sparkles className="h-4 w-4" />
              14 Dias Grátis • Sem Cartão de Crédito
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#191A23] tracking-tight leading-tight">
              Toda a tecnologia. O plano certo para seu volume.
            </h1>

            <p className="text-lg text-[#191A23]/80 font-medium">
              Escolha a capacidade de plays ideal para sua operação de VSL e comece a testar agora.
            </p>

            {/* Monthly / Annual Toggle — Anual ativo por padrão */}
            <div className="pt-4 flex justify-center">
              <div
                role="group"
                aria-label="Ciclo de cobrança"
                className="inline-flex flex-wrap items-center justify-center gap-1 rounded-2xl border-2 border-[#191A23] bg-white p-1.5 shadow-[2px_2px_0px_#191A23]"
              >
                <button
                  type="button"
                  onClick={() => setIsAnnual(false)}
                  aria-pressed={!isAnnual}
                  className={`rounded-xl border-2 border-transparent px-5 py-2.5 text-sm font-black text-[#191A23] transition-all sm:rounded-full ${
                    !isAnnual
                      ? "border-[#191A23] bg-[#191A23] text-white shadow-[1px_1px_0px_#191A23]"
                      : "hover:bg-[#F3F3F3]"
                  }`}
                >
                  Cobrança Mensal
                </button>
                <button
                  type="button"
                  onClick={() => setIsAnnual(true)}
                  aria-pressed={isAnnual}
                  className={`inline-flex items-center gap-2 rounded-xl border-2 border-transparent px-5 py-2.5 text-sm font-black text-[#191A23] transition-all sm:rounded-full ${
                    isAnnual
                      ? "border-[#191A23] bg-[#B9FF66] shadow-[1px_1px_0px_#191A23]"
                      : "hover:bg-[#F3F3F3]"
                  }`}
                >
                  Cobrança Anual
                  <span className="rounded-full bg-[#191A23] px-2 py-0.5 text-[10px] font-black text-[#B9FF66]">
                    Economize 34%
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* 3 Pricing Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
            {plans.map((p, idx) => {
              const currentPrice = isAnnual ? p.priceAnnual : p.priceMonthly;
              const isDark = p.textColor === "text-white";
              return (
                <div
                  key={idx}
                  className={`relative rounded-[35px] border-2 border-[#191A23] ${p.bg} p-8 sm:p-10 shadow-[4px_4px_0px_#191A23] flex flex-col justify-between transition-transform hover:-translate-y-1 ${
                    p.isFeatured ? "ring-4 ring-[#191A23]" : ""
                  }`}
                >
                  {p.isFeatured && (
                    <span className="absolute -top-4 right-8 rounded-xl border-2 border-[#191A23] bg-[#191A23] px-4 py-1.5 text-xs font-black text-[#B9FF66] uppercase tracking-wider shadow-[2px_2px_0px_#B9FF66] flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5 fill-[#B9FF66] text-[#B9FF66]" />
                      <span>{p.badge}</span>
                    </span>
                  )}

                  <div>
                    {/* Header */}
                    <div className="space-y-2">
                      <span className={`inline-block rounded-lg border border-[#191A23] ${isDark ? "bg-white text-[#191A23]" : "bg-[#F3F3F3] text-[#191A23]"} px-3 py-1 text-xs font-black`}>
                        {p.badge}
                      </span>
                      <h3 className={`text-3xl font-black ${p.textColor}`}>{p.name}</h3>
                      <p className={`text-xs font-medium ${p.textColor} opacity-80 min-h-10 leading-relaxed`}>
                        {p.description}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="my-6 py-4 border-y border-[#191A23]/20">
                      <div className="flex items-baseline gap-2">
                        <span className={`text-5xl font-black ${p.textColor} tracking-tight font-mono`}>
                          R$ {currentPrice}
                        </span>
                        <span className={`text-sm font-bold ${p.textColor} opacity-70`}>
                          /mês
                        </span>
                      </div>
                      <p className={`mt-1 text-xs font-medium ${p.textColor} opacity-70`}>
                        {isAnnual
                          ? `no plano anual — cobrado ${p.annualTotal} à vista`
                          : "na cobrança mensal, sem fidelidade"}
                      </p>
                    </div>

                    {/* Capacity */}
                    <div className="space-y-2 mb-6">
                      <div className={`rounded-xl border border-[#191A23]/30 ${isDark ? "bg-white/10" : "bg-[#F3F3F3]"} p-3 text-xs font-black ${p.textColor} flex items-center gap-2`}>
                        <Zap className="h-4 w-4 shrink-0 text-[#B9FF66]" />
                        <span>{p.plays}</span>
                      </div>
                      <div className={`rounded-xl border border-[#191A23]/30 ${isDark ? "bg-white/10" : "bg-[#F3F3F3]"} p-3 text-xs font-black ${p.textColor} flex items-center gap-2`}>
                        <Package className="h-4 w-4 shrink-0 text-[#B9FF66]" />
                        <span>R$ 0,02 por play adicional</span>
                      </div>
                    </div>

                    {/* Feature list */}
                    <div className="space-y-3">
                      <p className={`text-xs font-black uppercase tracking-wider ${p.textColor} opacity-60`}>
                        Recursos inclusos:
                      </p>
                      {p.features.map((f, i) => (
                        <div key={i} className="flex items-center gap-2.5">
                          <Check className={`h-4 w-4 shrink-0 ${isDark ? "text-[#B9FF66]" : "text-[#191A23]"}`} />
                          <span className={`text-xs font-bold ${p.textColor} opacity-90`}>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* CTA Button */}
                  <div className="mt-8 pt-6 border-t border-[#191A23]/15">
                    <Link
                      href={account ? "/dashboard/billing" : "/signup"}
                      className={`w-full inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-[#191A23] ${p.btnBg} ${p.btnText} px-6 py-4 text-base font-black shadow-[2px_2px_0px_#191A23] hover:translate-x-[1px] hover:translate-y-[1px] transition-all`}
                    >
                      <span>{account ? "Escolher no Painel" : "Testar 14 Dias Grátis"}</span>
                      <ArrowUpRight className="h-5 w-5" />
                    </Link>
                  </div>

                </div>
              );
            })}
          </div>

          {/* Guarantee Banner */}
          <div className="rounded-[35px] border-2 border-[#191A23] bg-white p-8 shadow-[3px_3px_0px_#191A23] flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-[#191A23] bg-[#B9FF66] shadow-[1px_1px_0px_#191A23]">
                <Shield className="h-7 w-7 text-[#191A23]" />
              </div>
              <div>
                <h3 className="text-xl font-black text-[#191A23]">Garantia Incondicional de 14 Dias</h3>
                <p className="text-sm font-medium text-[#191A23]/80">
                  Crie sua conta sem informar cartão de crédito. Teste a velocidade e retenção da sua VSL sem qualquer risco.
                </p>
              </div>
            </div>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-2xl border-2 border-[#191A23] bg-[#191A23] px-6 py-3.5 text-sm font-bold text-white shadow-[2px_2px_0px_#191A23] whitespace-nowrap"
            >
              Criar Conta Grátis
            </Link>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
