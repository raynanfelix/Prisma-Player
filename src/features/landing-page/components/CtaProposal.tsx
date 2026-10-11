"use client";

import Link from "next/link";
import { Sparkles, Play, CheckCircle2 } from "lucide-react";

export default function CtaProposal() {
  return (
    <section className="bg-[#F3F3F3] py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[45px] border-2 border-[#191A23] bg-[#F3F3F3] p-8 sm:p-14 shadow-[8px_8px_0px_#191A23]">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-1.5 text-xs font-black uppercase text-[#191A23] shadow-[2px_2px_0px_#191A23]">
                <Sparkles className="h-4 w-4" />
                Sem necessidade de cartão de crédito
              </div>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#191A23] tracking-tight leading-tight">
                Pronto para dobrar a retenção e as vendas das suas VSLs?
              </h2>

              <p className="text-base sm:text-lg text-[#191A23]/80 font-medium leading-relaxed">
                Configure seu primeiro vídeo em menos de 2 minutos. Importação simples por link ou upload direto com CDN ultra-rápida inclusa.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-2xl border-2 border-[#191A23] bg-[#191A23] px-8 py-4 text-lg font-extrabold text-white shadow-[4px_4px_0px_#B9FF66] hover:bg-[#191A23]/90 hover:translate-x-[1px] hover:translate-y-[1px] transition-all text-center"
                >
                  Criar Conta Grátis por 14 Dias
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-2xl border-2 border-[#191A23] bg-white px-6 py-4 text-base font-bold text-[#191A23] shadow-[4px_4px_0px_#191A23] hover:translate-x-[1px] hover:translate-y-[1px] transition-all text-center"
                >
                  Já tenho conta
                </Link>
              </div>

              <div className="pt-2 flex flex-wrap gap-4 text-xs font-bold text-[#191A23]">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-[#191A23] fill-[#B9FF66]" />
                  <span>Setup instantâneo em 2 min</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-[#191A23] fill-[#B9FF66]" />
                  <span>Suporte prioritário via WhatsApp</span>
                </div>
              </div>
            </div>

            {/* Right Graphic Positivus style */}
            <div className="lg:col-span-5 relative flex justify-center">
              <div className="w-full max-w-sm rounded-[35px] border-2 border-[#191A23] bg-[#B9FF66] p-8 shadow-[6px_6px_0px_#191A23] text-center space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#191A23] bg-[#191A23] shadow-[3px_3px_0px_#191A23]">
                  <Play className="h-8 w-8 text-[#B9FF66] fill-[#B9FF66] ml-1" />
                </div>
                <h3 className="text-xl font-black text-[#191A23]">
                  +42% de Conversão Média
                </h3>
                <p className="text-xs font-bold text-[#191A23]/80 leading-relaxed">
                  Infraestrutura testada por operações de 7 e 8 dígitos no mercado de infoprodutos e afiliados.
                </p>
                <div className="pt-2">
                  <span className="inline-block rounded-xl border border-[#191A23] bg-white px-4 py-2 text-xs font-black text-[#191A23] shadow-[2px_2px_0px_#191A23]">
                    100% Compatível com WordPress & Elementor
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
