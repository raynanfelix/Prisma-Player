"use client";

import { Share2, ShieldCheck, Headphones, Code, LineChart } from "lucide-react";

export default function TeamSupport() {
  const team = [
    {
      name: "Engenharia de CDN",
      role: "Infraestrutura & Ultra-Velocidade",
      experience: "Servidores distribuídos globalmente com cache em borda para garantir streaming sem travamentos no Brasil.",
      icon: Code,
    },
    {
      name: "Especialistas em VSL",
      role: "Otimização de Retenção & Copy",
      experience: "Equipe focada em ajudar você a ajustar o pitch delay, autoplay e gatilhos visuais para maximizar conversões.",
      icon: LineChart,
    },
    {
      name: "Proteção DRM & Anti-Pirataria",
      role: "Segurança de Conteúdo",
      experience: "Criptografia militar de arquivos de vídeo contra softwares de download e extração indevida de dados.",
      icon: ShieldCheck,
    },
    {
      name: "Suporte VIP 24/7",
      role: "Atendimento Dedicado via WhatsApp",
      experience: "Acompanhamento direto para sanar dúvidas de integração, domínios e configurações de funil a qualquer hora.",
      icon: Headphones,
    },
  ];

  return (
    <section className="bg-[#F3F3F3] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center gap-6 mb-16">
          <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]">
            Tecnologia & Suporte Especializado
          </div>
          <p className="max-w-xl text-lg text-[#191A23]/80 font-medium">
            Time técnico especializado em manter a sua operação de VSL rodando 100% do tempo sem interrupções.
          </p>
        </div>

        {/* 4 Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {team.map((member, idx) => {
            const IconComp = member.icon;
            return (
              <div
                key={idx}
                className="relative rounded-[35px] border-2 border-[#191A23] bg-white p-6 shadow-[5px_5px_0px_#191A23] flex flex-col justify-between hover:-translate-y-1 transition-transform"
              >
                <div>
                  <div className="flex items-center justify-between pb-4 border-b-2 border-[#191A23]">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-[#191A23] bg-[#B9FF66] shadow-[2px_2px_0px_#191A23]">
                      <IconComp className="h-6 w-6 text-[#191A23]" />
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191A23] bg-[#191A23] text-[#B9FF66]">
                      <Share2 className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-xl font-black text-[#191A23] leading-snug">
                      {member.name}
                    </h3>
                    <p className="text-xs font-bold text-[#191A23]/70 uppercase tracking-wider mt-1">
                      {member.role}
                    </p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-[#191A23]/15">
                  <p className="text-xs font-medium text-[#191A23]/80 leading-relaxed">
                    {member.experience}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
