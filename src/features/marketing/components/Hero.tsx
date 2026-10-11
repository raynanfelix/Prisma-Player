"use client";

import { ArrowRight, Clock, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChromaFlow, FilmGrain, FlutedGlass, Shader, Swirl } from "shaders/react";

function useLondonTime() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () => {
      setTime(
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/London",
          hour12: false,
        }).format(new Date()),
      );
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function PartnerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-5 h-5 sm:w-6 sm:h-6 fill-current text-[#E8704E] shrink-0">
      <path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" />
    </svg>
  );
}

const NAV_LINKS = [
  ["Produto", "#produto"],
  ["Funcionalidades", "#funcionalidades"],
  ["Planos", "#planos"],
  ["Conectar", "#conectar"],
];

export default function Hero() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const londonTime = useLondonTime();

  // Portão de hidratação intencional: o relógio de Londres só aparece no cliente,
  // evitando mismatch de hidratação (horário do servidor difere do cliente).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronização pós-hidratação é intencional aqui
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <section className="relative h-screen w-full bg-[#EFEFEF] overflow-hidden flex flex-col">
      {/* Shader overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <Shader disableTelemetry style={{ width: "100%", height: "100%" }}>
          <Swirl colorA="#ffffff" colorB="#f0f0f0" detail={1.7} />
          <ChromaFlow
            baseColor="#ffffff"
            downColor="#ff5f03"
            leftColor="#ff5f03"
            rightColor="#ff5f03"
            upColor="#ff5f03"
            momentum={13}
            radius={3.5}
          />
          <FlutedGlass
            aberration={0.61}
            angle={31}
            frequency={8}
            highlight={0.12}
            highlightSoftness={0}
            lightAngle={-90}
            refraction={4}
            shape="rounded"
            softness={1}
            speed={0.15}
          />
          <FilmGrain strength={0.05} />
        </Shader>
      </div>

      {/* Navigation */}
      <div className="relative z-20 p-2 sm:p-3">
        <div className="max-w-[1440px] mx-auto">
          <nav className="bg-white rounded-full p-[5px] flex items-center justify-between">
            <div className="flex items-center gap-6 pl-1">
              <Link
                href="/"
                className="w-9 h-9 sm:w-10 sm:h-10 bg-gray-900 rounded-full flex items-center justify-center shrink-0"
                aria-label="Prisma Player"
              >
                <span className="text-white text-[10px] sm:text-[11px] font-bold tracking-tight">
                  PR
                </span>
              </Link>
              <div className="hidden md:flex items-center gap-6">
                {NAV_LINKS.map(([name, href]) => (
                  <a
                    key={name}
                    href={href}
                    className="text-[14px] text-gray-900 hover:text-gray-500 transition-colors duration-300"
                  >
                    {name}
                  </a>
                ))}
              </div>
            </div>

            <div className="hidden md:flex items-center gap-5">
              <span className="text-[13px] text-gray-600 hidden lg:block">
                Prisma Player — player de vendas
              </span>
              {mounted && (
                <span className="flex items-center gap-1.5 text-[13px] text-gray-600">
                  <Clock size={14} />
                  {londonTime} in London
                </span>
              )}
              <Link
                href="/signup"
                className="bg-gray-900 text-white text-[13px] font-medium rounded-full pl-5 pr-2 py-2 flex items-center gap-2 group"
              >
                <span className="overflow-hidden h-[20px] relative block">
                  <span className="flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-translate-y-1/2">
                    <span>Teste grátis</span>
                    <span>Teste grátis</span>
                  </span>
                </span>
                <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-rotate-45">
                  <ArrowRight size={14} className="text-gray-900" />
                </span>
              </Link>
            </div>

            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden w-9 h-9 bg-gray-900 rounded-full flex items-center justify-center text-white"
              aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            >
              {menuOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </nav>
        </div>
      </div>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
          <div className="relative bg-white rounded-2xl mx-3 mb-3 p-6 animate-slide-up">
            {mounted && (
              <div className="flex items-center gap-1.5 text-[13px] text-gray-600 mb-6">
                <Clock size={14} />
                {londonTime} in London
              </div>
            )}
            <div className="space-y-4 mb-8">
              {NAV_LINKS.map(([name, href]) => (
                <a
                  key={name}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="block text-[28px] leading-[32px] font-medium text-gray-900"
                >
                  {name}
                </a>
              ))}
            </div>
            <Link
              href="/signup"
              onClick={() => setMenuOpen(false)}
              className="w-full bg-gray-900 text-white text-[15px] font-medium rounded-full py-4 flex items-center justify-center gap-2"
            >
              Começar agora
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      )}

      {/* Hero content */}
      <div className="relative z-20 flex-1 flex flex-col">
        <div className="flex-1" />
        <div className="max-w-[1440px] mx-auto w-full px-5 sm:px-8 lg:px-12 pb-14 sm:pb-16 lg:pb-20">
          <span className="text-[13px] leading-[14px] text-gray-900 tracking-wide mb-5 sm:mb-8 block">
            Prisma Player
          </span>
          <h1 className="text-[clamp(1.75rem,7vw,4.2rem)] sm:text-[clamp(2.5rem,5vw,4.2rem)] font-medium leading-[1.08] tracking-[-0.03em] text-gray-900 max-w-[900px]">
            Sua VSL já fala.
            <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>
            A Prisma faz ela vender.
          </h1>
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 mt-8 sm:mt-12">
            <Link
              href="/signup"
              className="inline-flex items-center bg-[#F26522] hover:bg-[#e05a1a] text-white text-[13px] sm:text-[14px] rounded-full pl-5 sm:pl-6 pr-2 py-2 transition-colors group"
            >
              <span className="overflow-hidden h-[20px] relative block">
                <span className="flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-translate-y-1/2">
                  <span>Começar teste grátis</span>
                  <span>Começar teste grátis</span>
                </span>
              </span>
              <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white flex items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-rotate-45 ml-2">
                <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#F26522]" />
              </span>
            </Link>
            <Link
              href="#funcionalidades"
              className="inline-flex items-center gap-3 bg-white rounded-[4px] px-4 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-shadow text-[13px] sm:text-[14px] font-medium text-gray-900"
            >
              <PartnerIcon />
              Ver funcionalidades
              <span className="text-[10px] sm:text-[11px] bg-gray-900 text-white px-1.5 sm:px-2 py-0.5 rounded">
                Novo
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}