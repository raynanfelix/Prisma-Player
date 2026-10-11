"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";

export default function WorkingProcess() {
  const [openIndex, setOpenIndex] = useState<number | null>(0); // First item open by default

  const steps = [
    {
      id: "01",
      title: "Criar Conta & Upload do Vídeo",
      description: "Crie sua conta em 30 segundos. Faça upload direto do arquivo MP4 da sua VSL ou importe instantaneamente de links externos. A codificação Turbo e otimização para CDN acontecem de forma 100% automática.",
    },
    {
      id: "02",
      title: "Configurar o Pitch Delay Inteligente",
      description: "Defina o tempo exato (minutos e segundos) em que sua oferta e botões de checkout devem ser liberados na página. Nosso algoritmo garante a sincronia perfeita, mesmo se o lead pausar ou alternar abas.",
    },
    {
      id: "03",
      title: "Customizar o Design do Player",
      description: "Adapte as cores do player, controles, barra de progresso, botão de ativar som e miniatura animada para combinar perfeitamente com a identidade visual da sua página de vendas.",
    },
    {
      id: "04",
      title: "Inserir o Código Embed no seu Funil",
      description: "Copie um código simples de 1 linha e cole no Elementor, WordPress, Webflow ou qualquer construtor. O player carrega de forma ultra-rápida e responsiva em celulares e computadores.",
    },
    {
      id: "05",
      title: "Acompanhar a Retenção no Analytics",
      description: "Acesse o painel em tempo real e veja o gráfico de retenção minuto a minuto. Saiba onde os leads estão parando e faça ajustes imediatos para aumentar a conversão.",
    },
    {
      id: "06",
      title: "Realizar Testes A/B & Otimização Contínua",
      description: "Crie variações de VSL ou thumbnails para testar qual gera mais vendas. A distribuição de tráfego é inteligente e você descobre a melhor combinação para escalar seu faturamento.",
    },
  ];

  const toggleStep = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="processo" className="bg-[#F3F3F3] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center gap-6 mb-16">
          <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]">
            Como Funciona
          </div>
          <p className="max-w-xl text-lg text-[#191A23]/80 font-medium">
            Passo a passo simples para colocar sua VSL de alta retenção no ar e começar a vender em minutos.
          </p>
        </div>

        {/* Accordion Steps List */}
        <div className="space-y-6">
          {steps.map((step, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={step.id}
                className={`rounded-[45px] border-2 border-[#191A23] transition-all duration-300 ${
                  isOpen
                    ? "bg-[#B9FF66] shadow-[6px_6px_0px_#191A23]"
                    : "bg-[#F3F3F3] shadow-[4px_4px_0px_#191A23] hover:bg-white"
                } p-6 sm:p-10 cursor-pointer`}
                onClick={() => toggleStep(idx)}
              >
                {/* Accordion Title Row */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-6 sm:gap-8">
                    <span className="text-3xl sm:text-5xl font-black text-[#191A23] font-mono">
                      {step.id}
                    </span>
                    <h3 className="text-xl sm:text-3xl font-black text-[#191A23] tracking-tight">
                      {step.title}
                    </h3>
                  </div>

                  {/* Toggle Button */}
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#191A23] bg-white shadow-[2px_2px_0px_#191A23]">
                    {isOpen ? (
                      <Minus className="h-6 w-6 text-[#191A23]" />
                    ) : (
                      <Plus className="h-6 w-6 text-[#191A23]" />
                    )}
                  </div>
                </div>

                {/* Accordion Expanded Content */}
                {isOpen && (
                  <div className="mt-8 pt-6 border-t-2 border-[#191A23] animate-fadeIn">
                    <p className="text-base sm:text-lg font-medium text-[#191A23] leading-relaxed max-w-4xl">
                      {step.description}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
