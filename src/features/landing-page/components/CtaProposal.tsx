"use client";

import Link from "next/link";
import { Sparkles, Play, CheckCircle2 } from "lucide-react";

export default function CtaProposal() {
  return (
    <section className="bg-white px-4 pb-20 sm:px-6 md:pb-28">
      <div className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-[32px] border border-[#191A23]/[0.07] bg-[linear-gradient(135deg,#F6FFEF_0%,#FFFFFF_55%,#F4FAFF_100%)] p-8 sm:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#B9FF66]/25 blur-3xl"
          />

          <div className="relative grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            <div className="space-y-5 lg:col-span-7">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#191A23]/[0.07] bg-white/70 px-3 py-1 text-[11px] font-medium text-[#191A23]/60 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Sem necessidade de cartão de crédito
              </span>

              <h2 className="text-balance text-3xl font-semibold leading-[1.12] tracking-[-0.02em] text-[#191A23] sm:text-[40px]">
                Pronto para mais retenção e mais vendas nas suas VSLs?
              </h2>

              <p className="max-w-xl text-[15px] leading-relaxed text-[#191A23]/55">
                Configure seu primeiro vídeo em menos de 2 minutos. Importação simples por link ou
                upload direto, rápido pela CDN inclusa.
              </p>

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-full bg-[#191A23] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#191A23]/90 active:scale-[0.99]"
                >
                  Criar Conta Grátis por 14 Dias
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-full border border-[#191A23]/10 bg-white/70 px-6 py-3 text-sm font-medium text-[#191A23] transition-colors hover:bg-white"
                >
                  Já tenho conta
                </Link>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-[12px] font-medium text-[#191A23]/50">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#191A23]/70" />
                  Setup instantâneo em 2 min
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#191A23]/70" />
                  Suporte prioritário via WhatsApp
                </span>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-[26px] border border-[#191A23]/[0.07] bg-white/80 p-7 text-center shadow-[0_30px_60px_-45px_rgba(25,26,35,0.4)] backdrop-blur">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#191A23]">
                  <Play className="ml-0.5 h-5 w-5 fill-[#B9FF66] text-[#B9FF66]" />
                </span>
                <h3 className="mt-4 text-[17px] font-semibold tracking-tight text-[#191A23]">
                  Feito para quem faz lançamento
                </h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-[#191A23]/50">
                  A mesma tecnologia que você usa no dia a dia, na operação que roda VSL todos os
                  dias.
                </p>
                <span className="mt-5 inline-flex items-center rounded-full bg-[#B9FF66]/35 px-3.5 py-1.5 text-[11px] font-medium text-[#191A23]/80">
                  100% Compatível com WordPress &amp; Elementor
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
