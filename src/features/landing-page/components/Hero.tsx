"use client";

import Link from "next/link";
import { Play, Sparkles, Zap, ShieldCheck, Volume2 } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#F3F3F3] pt-12 pb-20 md:pt-20 md:pb-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8 lg:items-center">
          
          {/* Left Column: Headlines & CTA */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#191A23] bg-[#B9FF66] px-4 py-1.5 text-xs font-black uppercase tracking-wider text-[#191A23] shadow-[2px_2px_0px_#191A23]">
              <Sparkles className="h-4 w-4" />
              Player nº 1 em Conversão de VSL no Brasil
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#191A23] tracking-tight leading-[1.1]">
              Domine suas vendas com o player de VSL mais rápido do mercado.
            </h1>

            <p className="text-lg sm:text-xl font-normal text-[#191A23]/80 leading-relaxed">
              Carregamento instantâneo, pitch delay inteligente ao segundo exato, reprodução com som no clique e retenção máxima para escalar suas ofertas sem travamentos.
            </p>

            {/* CTAs */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-2xl border-2 border-[#191A23] bg-[#191A23] px-8 py-4 text-lg font-bold text-white shadow-[5px_5px_0px_#B9FF66] hover:bg-[#191A23]/90 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0px_#B9FF66] transition-all text-center"
              >
                Testar 14 Dias Grátis
              </Link>
              <a
                href="#recursos"
                className="inline-flex items-center justify-center rounded-2xl border-2 border-[#191A23] bg-white px-6 py-4 text-base font-bold text-[#191A23] shadow-[5px_5px_0px_#191A23] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0px_#191A23] transition-all text-center"
              >
                Ver Recursos do Player
              </a>
            </div>

            {/* Trust Badges */}
            <div className="pt-6 flex flex-wrap items-center gap-6 text-xs font-bold text-[#191A23]/70">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-[#191A23] fill-[#B9FF66]" />
                <span>Carregamento em &lt; 250ms</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#191A23] fill-[#B9FF66]" />
                <span>Proteção Anti-Pirataria DRM</span>
              </div>
            </div>
          </div>

          {/* Right Column: Positivus Styled Illustration Card */}
          <div className="lg:col-span-6 relative flex justify-center">
            <div className="relative w-full max-w-lg rounded-[45px] border-2 border-[#191A23] bg-white p-6 sm:p-8 shadow-[8px_8px_0px_#191A23] transition-transform hover:scale-[1.01]">
              
              {/* Top Bar Illustration */}
              <div className="flex items-center justify-between border-b-2 border-[#191A23] pb-4 mb-6">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full bg-[#191A23]" />
                  <div className="h-4 w-4 rounded-full bg-[#B9FF66] border border-[#191A23]" />
                  <div className="h-4 w-4 rounded-full border border-[#191A23]" />
                </div>
                <div className="rounded-full border border-[#191A23] bg-[#F3F3F3] px-3 py-1 text-xs font-bold text-[#191A23]">
                  vsl_alta_conversao.mp4
                </div>
              </div>

              {/* Player Preview Box */}
              <div className="relative aspect-video rounded-3xl border-2 border-[#191A23] bg-[#191A23] overflow-hidden flex items-center justify-center p-6 text-white group cursor-pointer">
                {/* Background SVG Grid pattern */}
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#B9FF66_1px,transparent_1px)] [background-size:16px_16px]" />

                {/* Pitch Delay Badge Overlay */}
                <div className="absolute top-3 left-3 rounded-full border border-[#B9FF66] bg-[#191A23]/90 px-3 py-1 text-[11px] font-bold text-[#B9FF66] backdrop-blur-sm flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#B9FF66] animate-pulse" />
                  Pitch Delay: 12m 45s
                </div>

                {/* Main Play Icon in Positivus style */}
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#191A23] bg-[#B9FF66] shadow-[4px_4px_0px_#191A23] group-hover:scale-110 transition-transform">
                  <Play className="h-10 w-10 text-[#191A23] fill-[#191A23] ml-1.5" />
                </div>

                {/* Sound Prompt Floating Badge */}
                <div className="absolute bottom-3 right-3 rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-3 py-1.5 text-xs font-extrabold text-[#191A23] shadow-[2px_2px_0px_#191A23] flex items-center gap-1.5">
                  <Volume2 className="h-4 w-4 text-[#191A23]" />
                  <span>Clique para ouvir o áudio</span>
                </div>
              </div>

              {/* Stats Bar below Video */}
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border-2 border-[#191A23] bg-[#F3F3F3] p-3 text-center shadow-[2px_2px_0px_#191A23]">
                  <p className="text-[11px] font-bold uppercase text-[#191A23]/60">Retenção</p>
                  <p className="text-lg font-black text-[#191A23]">84.2%</p>
                </div>
                <div className="rounded-2xl border-2 border-[#191A23] bg-[#B9FF66] p-3 text-center shadow-[2px_2px_0px_#191A23]">
                  <p className="text-[11px] font-bold uppercase text-[#191A23]">Pitch Views</p>
                  <p className="text-lg font-black text-[#191A23]">+14.8k</p>
                </div>
                <div className="rounded-2xl border-2 border-[#191A23] bg-[#191A23] p-3 text-center text-white shadow-[2px_2px_0px_#191A23]">
                  <p className="text-[11px] font-bold uppercase text-[#B9FF66]">Carregamento</p>
                  <p className="text-lg font-black text-white">0.18s</p>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
