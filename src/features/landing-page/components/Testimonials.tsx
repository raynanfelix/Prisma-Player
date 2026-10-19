"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Star } from "lucide-react";

export default function Testimonials() {
  const testimonials = [
    {
      name: "Rodrigo Mendonça",
      role: "Infoprodutor de Saúde & Emagrecimento",
      quote:
        "O carregamento instantâneo do Prisma Player mudou o jogo das nossas VSLs. Tivemos um salto de +27% na retenção de leads até o pitch de vendas logo na primeira semana de teste.",
    },
    {
      name: "Camila Vasconcelos",
      role: "Coprodutora & Gestora de Tráfego Pago",
      quote:
        "O Pitch Delay sincronizado ao segundo exato evitou que os leads vissem o botão de compra antes da hora. Nosso ROI no Facebook Ads aumentou de 1.8 para 3.4 com essa funcionalidade.",
    },
    {
      name: "Gabriel Sampaio",
      role: "Fundador de Agência de Lançamentos",
      quote:
        "A proteção anti-download do Prisma é imbatível. Tivemos várias tentativas de clonagem de VSL bloqueadas e o suporte via WhatsApp nos responde em minutos. Recomendo de olhos fechados.",
    },
    {
      name: "Lucas Andrade",
      role: "Top Afiliado & Estrategista Digital",
      quote:
        "Migramos mais de 50 VSLs para o Prisma Player. Além do custo ser infinitamente mais vantajoso, a qualidade de renderização e o autoplay no celular dobraram nossos resultados.",
    },
  ];

  const [currentIndex, setCurrentIndex] = useState(0);

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev === 0 ? testimonials.length - 1 : prev - 1));
  };

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev === testimonials.length - 1 ? 0 : prev + 1));
  };

  return (
    <section id="depoimentos" className="scroll-mt-28 bg-white py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full bg-[#B9FF66]/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#191A23]/70">
            Depoimentos
          </span>
          <h2 className="mt-5 text-balance text-[22px] font-medium leading-snug tracking-tight text-[#191A23] sm:text-[26px]">
            O que dizem os grandes produtores e afiliados que utilizam o Prisma Player diariamente.
          </h2>
        </div>

        <div className="mx-auto mt-14 max-w-3xl">
          <div className="rounded-[28px] border border-[#191A23]/[0.07] bg-[#FAFAFB] p-8 sm:p-10">
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-[#B9FF66] text-[#B9FF66]" />
              ))}
            </div>

            <blockquote className="mt-5 text-[19px] font-normal leading-relaxed tracking-[-0.01em] text-[#191A23] sm:text-[22px]">
              &ldquo;{testimonials[currentIndex].quote}&rdquo;
            </blockquote>

            <div className="mt-6 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#191A23] text-[12px] font-semibold text-[#B9FF66]">
                {testimonials[currentIndex].name.charAt(0)}
              </span>
              <div>
                <p className="text-[13px] font-semibold text-[#191A23]">
                  {testimonials[currentIndex].name}
                </p>
                <p className="text-[11.5px] text-[#191A23]/45">{testimonials[currentIndex].role}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={prevSlide}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191A23]/[0.08] bg-white text-[#191A23]/60 transition-colors hover:text-[#191A23]"
              aria-label="Anterior"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1.5">
              {testimonials.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-1.5 rounded-full transition-[width,background-color] ${
                    idx === currentIndex ? "w-6 bg-[#191A23]" : "w-1.5 bg-[#191A23]/20 hover:bg-[#191A23]/40"
                  }`}
                  aria-label={`Ir para depoimento ${idx + 1}`}
                />
              ))}
            </div>

            <button
              onClick={nextSlide}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191A23]/[0.08] bg-white text-[#191A23]/60 transition-colors hover:text-[#191A23]"
              aria-label="Próximo"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
