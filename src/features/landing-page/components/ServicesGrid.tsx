"use client";

import { ArrowUpRight, Clock, Zap, Shield, Volume2, LineChart, Split } from "lucide-react";

export default function ServicesGrid() {
  const services = [
    {
      id: "01",
      badgeTitle: "Pitch Delay",
      fullTitle: "Revele a oferta no segundo exato do seu pitch",
      description:
        "Exiba o botão de compra, preço e checkout sincronizados ao tempo da sua VSL, inclusive se o lead pausar ou avançar o vídeo.",
      icon: Clock,
    },
    {
      id: "02",
      badgeTitle: "CDN Instantânea",
      fullTitle: "Carregamento rápido, sem buffer",
      description:
        "Infraestrutura global otimizada para o mercado brasileiro, para suas VSLs começarem a tocar rápido também em conexões 3G e 4G.",
      icon: Zap,
    },
    {
      id: "03",
      badgeTitle: "Proteção Anti-Download",
      fullTitle: "Sua VSL protegida contra downloads",
      description:
        "Domínios permitidos, watermark dinâmico e recursos anti-download para ajudar a impedir a clonagem e o roubo da sua oferta.",
      icon: Shield,
    },
    {
      id: "04",
      badgeTitle: "Autoplay com Som",
      fullTitle: "Mais atenção nos primeiros segundos",
      description:
        "Reprodução automática inteligente com convite para ativar o som, para que o lead escute a mensagem desde o início.",
      icon: Volume2,
    },
    {
      id: "05",
      badgeTitle: "Analytics de Retenção",
      fullTitle: "Gráfico segundo a segundo do comportamento",
      description:
        "Saiba onde seus leads abandonam a VSL, quais partes geram mais re-assistidas e otimize sua copy com dados reais.",
      icon: LineChart,
    },
    {
      id: "06",
      badgeTitle: "Teste A/B Integrado",
      fullTitle: "Compare 2 VSLs ou thumbs no mesmo link",
      description:
        "Descubra qual variação de copy ou início de vídeo converte mais, sem precisar alterar a página ou configurar ferramentas externas.",
      icon: Split,
    },
  ];

  return (
    <section id="recursos" className="scroll-mt-28 bg-white py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#B9FF66]/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#191A23]/70">
            Recursos da VSL
          </span>
          <h2 className="mt-5 text-balance text-[22px] font-medium leading-snug tracking-tight text-[#191A23] sm:text-[26px]">
            Tecnologia feita para retenção e conversão do seu funil de vendas.
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2">
          {services.map((item) => {
            const IconComponent = item.icon;
            return (
              <article
                key={item.id}
                className="group relative flex flex-col rounded-[26px] border border-[#191A23]/[0.07] bg-white p-7 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_30px_60px_-40px_rgba(25,26,35,0.45)]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#B9FF66]/35 text-[#191A23]">
                      <IconComponent className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#191A23]/40">
                      {item.badgeTitle}
                    </span>
                  </div>
                  <span className="text-[11px] font-medium tabular-nums text-[#191A23]/20">
                    {item.id}
                  </span>
                </div>

                <h3 className="mt-6 text-[19px] font-semibold leading-snug tracking-tight text-[#191A23]">
                  {item.fullTitle}
                </h3>

                <p className="mt-2.5 text-[14px] leading-relaxed text-[#191A23]/55">
                  {item.description}
                </p>

                <div className="mt-6 flex items-center justify-between border-t border-[#191A23]/[0.06] pt-4">
                  <a
                    href="/signup"
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#191A23] transition-opacity hover:opacity-70"
                  >
                    Ativar no seu funil
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
