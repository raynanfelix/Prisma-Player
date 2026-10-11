"use client";

import { ArrowUpRight, Clock, Zap, Shield, Volume2, LineChart, Split } from "lucide-react";

export default function ServicesGrid() {
  const services = [
    {
      id: "01",
      badgeTitle: "Pitch Delay de Precisão",
      fullTitle: "Revele a oferta no segundo exato do seu pitch",
      description: "Exiba o botão de compra, preço e checkout sincronizados milimetricamente ao tempo da sua VSL, inclusive se o lead pausar ou avançar o vídeo.",
      bg: "bg-[#F3F3F3]",
      badgeBg: "bg-[#B9FF66]",
      badgeText: "text-[#191A23]",
      textColor: "text-[#191A23]",
      btnBg: "bg-[#191A23]",
      btnIcon: "text-[#B9FF66]",
      icon: Clock,
    },
    {
      id: "02",
      badgeTitle: "Turbo CDN Instantânea",
      fullTitle: "Carregamento sem buffer em menos de 250ms",
      description: "Infraestrutura global otimizada para o mercado brasileiro. Suas VSLs começam a tocar instantaneamente mesmo em conexões 3G e 4G.",
      bg: "bg-[#B9FF66]",
      badgeBg: "bg-white",
      badgeText: "text-[#191A23]",
      textColor: "text-[#191A23]",
      btnBg: "bg-[#191A23]",
      btnIcon: "text-[#B9FF66]",
      icon: Zap,
    },
    {
      id: "03",
      badgeTitle: "Escudo DRM Anti-Pirataria",
      fullTitle: "Bloqueio absoluto contra downloads de VSL",
      description: "Impeça a clonagem e roubo da sua oferta. Criptografia avançada de vídeo que impede extensões e gravadores de baixarem seu conteúdo.",
      bg: "bg-[#191A23]",
      badgeBg: "bg-[#B9FF66]",
      badgeText: "text-[#191A23]",
      textColor: "text-white",
      btnBg: "bg-white",
      btnIcon: "text-[#191A23]",
      icon: Shield,
    },
    {
      id: "04",
      badgeTitle: "Smart Autoplay com Som",
      fullTitle: "Duplique os primeiros segundos de retenção",
      description: "Reprodução automática inteligente com alerta sonoro interativo e miniatura animada que força o lead a clicar para escutar a mensagem.",
      bg: "bg-[#F3F3F3]",
      badgeBg: "bg-[#B9FF66]",
      badgeText: "text-[#191A23]",
      textColor: "text-[#191A23]",
      btnBg: "bg-[#191A23]",
      btnIcon: "text-[#B9FF66]",
      icon: Volume2,
    },
    {
      id: "05",
      badgeTitle: "Analytics de Retenção",
      fullTitle: "Gráfico segundo a segundo do comportamento",
      description: "Descubra exatamente onde seus leads abandonam a VSL, quais partes geram mais re-assitidas e otimize sua copy com dados reais.",
      bg: "bg-[#B9FF66]",
      badgeBg: "bg-[#191A23]",
      badgeText: "text-[#B9FF66]",
      textColor: "text-[#191A23]",
      btnBg: "bg-[#191A23]",
      btnIcon: "text-[#B9FF66]",
      icon: LineChart,
    },
    {
      id: "06",
      badgeTitle: "Teste A/B Integrado",
      fullTitle: "Compare 2 VSLs ou thumbs no mesmo link",
      description: "Descubra qual variação de copy ou início de vídeo converte mais sem precisar alterar a página ou configurar ferramentas externas complexas.",
      bg: "bg-[#191A23]",
      badgeBg: "bg-white",
      badgeText: "text-[#191A23]",
      textColor: "text-white",
      btnBg: "bg-[#B9FF66]",
      btnIcon: "text-[#191A23]",
      icon: Split,
    },
  ];

  return (
    <section id="recursos" className="bg-[#F3F3F3] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-center gap-6 mb-16">
          <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]">
            Recursos da VSL
          </div>
          <p className="max-w-xl text-lg text-[#191A23]/80 font-medium">
            Tecnologia de ponta desenvolvida exclusivamente para maximizar a retenção e a conversão do seu funil de vendas.
          </p>
        </div>

        {/* 2-Column Grid Positivus */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {services.map((item) => {
            const IconComponent = item.icon;
            return (
              <div
                key={item.id}
                className={`relative rounded-[45px] border-2 border-[#191A23] ${item.bg} p-8 sm:p-10 shadow-[6px_6px_0px_#191A23] flex flex-col justify-between hover:-translate-y-1 transition-transform`}
              >
                <div>
                  {/* Badge Header */}
                  <div className="flex items-center justify-between gap-4 mb-6">
                    <span
                      className={`inline-block rounded-xl border-2 border-[#191A23] ${item.badgeBg} ${item.badgeText} px-4 py-1.5 text-base font-black shadow-[2px_2px_0px_#191A23]`}
                    >
                      {item.badgeTitle}
                    </span>
                    <span className={`text-2xl font-black ${item.textColor} opacity-40 font-mono`}>
                      {item.id}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h3 className={`text-2xl sm:text-3xl font-black ${item.textColor} tracking-tight leading-tight mb-4`}>
                    {item.fullTitle}
                  </h3>

                  <p className={`text-base font-medium ${item.textColor} opacity-90 leading-relaxed`}>
                    {item.description}
                  </p>
                </div>

                {/* Footer Action Button & Graphic Icon */}
                <div className="mt-8 pt-6 border-t border-[#191A23]/15 flex items-center justify-between">
                  <a
                    href="/signup"
                    className="flex items-center gap-3 font-bold text-base hover:opacity-80 transition-opacity"
                  >
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#191A23] ${item.btnBg} shadow-[2px_2px_0px_#191A23]`}
                    >
                      <ArrowUpRight className={`h-6 w-6 ${item.btnIcon}`} />
                    </div>
                    <span className={`${item.textColor} underline underline-offset-4 decoration-2`}>
                      Ativar no seu funil
                    </span>
                  </a>

                  <div className={`p-3 rounded-2xl border-2 border-[#191A23] ${item.badgeBg} shadow-[2px_2px_0px_#191A23]`}>
                    <IconComponent className="h-7 w-7 text-[#191A23]" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
