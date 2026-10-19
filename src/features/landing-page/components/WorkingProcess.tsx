"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";

export default function WorkingProcess() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const steps = [
    {
      id: "01",
      title: "Criar Conta & Upload do Vídeo",
      description:
        "Crie sua conta em 30 segundos. Faça upload direto do arquivo MP4 da sua VSL ou importe de links externos. O vídeo é otimizado para o player automaticamente.",
    },
    {
      id: "02",
      title: "Configurar o Pitch Delay Inteligente",
      description:
        "Defina o tempo exato (minutos e segundos) em que sua oferta e botões de checkout devem ser liberados na página. A sincronia acompanha o vídeo, mesmo se o lead pausar ou alternar abas.",
    },
    {
      id: "03",
      title: "Customizar o Design do Player",
      description:
        "Adapte as cores do player, controles, barra de progresso, botão de ativar som e miniatura animada para combinar perfeitamente com a identidade visual da sua página de vendas.",
    },
    {
      id: "04",
      title: "Inserir o Código Embed no seu Funil",
      description:
        "Copie um código simples de 1 linha e cole no Elementor, WordPress, Webflow ou qualquer construtor. O player carrega de forma rápida e responsiva em celulares e computadores.",
    },
    {
      id: "05",
      title: "Acompanhar a Retenção no Analytics",
      description:
        "Acesse o painel em tempo real e veja o gráfico de retenção minuto a minuto. Saiba onde os leads estão parando e faça ajustes imediatos para aumentar a conversão.",
    },
    {
      id: "06",
      title: "Realizar Testes A/B & Otimização Contínua",
      description:
        "Crie variações de VSL ou thumbnails para testar qual gera mais vendas. A distribuição de tráfego é inteligente e você descobre a melhor combinação para escalar seu faturamento.",
    },
  ];

  const toggleStep = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="processo" className="scroll-mt-28 bg-white py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full bg-[#B9FF66]/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#191A23]/70">
            Como Funciona
          </span>
          <h2 className="mt-5 text-balance text-[22px] font-medium leading-snug tracking-tight text-[#191A23] sm:text-[26px]">
            Passo a passo simples para colocar sua VSL de alta retenção no ar e começar a vender em
            minutos.
          </h2>
        </div>

        <div className="mt-14 space-y-2.5">
          {steps.map((step, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={step.id}
                className={`rounded-[22px] border transition duration-300 ${
                  isOpen
                    ? "border-[#191A23]/[0.09] bg-white shadow-[0_24px_50px_-40px_rgba(25,26,35,0.4)]"
                    : "border-[#191A23]/[0.06] bg-[#FAFAFB] hover:bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleStep(idx)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left sm:p-6"
                >
                  <div className="flex items-center gap-4 sm:gap-6">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums transition-colors ${
                        isOpen
                          ? "bg-[#B9FF66] text-[#191A23]"
                          : "bg-white text-[#191A23]/50 ring-1 ring-[#191A23]/[0.07]"
                      }`}
                    >
                      {step.id}
                    </span>
                    <h3 className="text-[16px] font-semibold leading-snug tracking-tight text-[#191A23] sm:text-[18px]">
                      {step.title}
                    </h3>
                  </div>

                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#191A23]/[0.07] bg-white text-[#191A23]/60">
                    {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </span>
                </button>

                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-6 pl-[4.5rem] text-[14px] leading-relaxed text-[#191A23]/55 sm:px-6 sm:pl-[5.5rem]">
                      {step.description}
                    </p>
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
