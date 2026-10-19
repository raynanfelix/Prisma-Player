"use client";

import { ShieldCheck, Headphones, Code, LineChart } from "lucide-react";

export default function TeamSupport() {
  const team = [
    {
      name: "Engenharia de CDN",
      role: "Infraestrutura & Velocidade",
      experience:
        "Servidores distribuídos globalmente com cache em borda para garantir streaming sem travamentos no Brasil.",
      icon: Code,
    },
    {
      name: "Especialistas em VSL",
      role: "Otimização de Retenção & Copy",
      experience:
        "Equipe focada em ajudar você a ajustar o pitch delay, autoplay e gatilhos visuais para melhorar conversões.",
      icon: LineChart,
    },
    {
      name: "Proteção & Controle de Domínio",
      role: "Segurança de Conteúdo",
      experience:
        "Domínios permitidos, watermark dinâmico e recursos anti-download para o seu conteúdo.",
      icon: ShieldCheck,
    },
    {
      name: "Suporte VIP 24/7",
      role: "Atendimento Dedicado via WhatsApp",
      experience:
        "Acompanhamento direto para sanar dúvidas de integração, domínios e configurações de funil a qualquer hora.",
      icon: Headphones,
    },
  ];

  return (
    <section className="bg-[#FAFAFB] py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#191A23]/50 ring-1 ring-[#191A23]/[0.06]">
            Tecnologia &amp; Suporte Especializado
          </span>
          <h2 className="mt-5 text-balance text-[22px] font-medium leading-snug tracking-tight text-[#191A23] sm:text-[26px]">
            Time técnico especializado em manter a sua operação de VSL rodando 100% do tempo sem
            interrupções.
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {team.map((member, idx) => {
            const IconComp = member.icon;
            return (
              <article
                key={idx}
                className="flex flex-col rounded-[24px] border border-[#191A23]/[0.07] bg-white p-6 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_30px_60px_-42px_rgba(25,26,35,0.35)]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#B9FF66]/35 text-[#191A23]">
                  <IconComp className="h-4 w-4" />
                </span>

                <h3 className="mt-5 text-[16px] font-semibold leading-snug tracking-tight text-[#191A23]">
                  {member.name}
                </h3>
                <p className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-[#191A23]/35">
                  {member.role}
                </p>

                <p className="mt-4 border-t border-[#191A23]/[0.06] pt-4 text-[12.5px] leading-relaxed text-[#191A23]/55">
                  {member.experience}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
