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
    <section id="depoimentos" className="bg-[#F3F3F3] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center gap-6 mb-16">
          <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]">
            Depoimentos
          </div>
          <p className="max-w-xl text-lg text-[#191A23]/80 font-medium">
            O que dizem os grandes produtores e afiliados que utilizam o Prisma Player diariamente.
          </p>
        </div>

        {/* Testimonials Dark Container */}
        <div className="rounded-[45px] border-2 border-[#191A23] bg-[#191A23] p-8 sm:p-14 shadow-[8px_8px_0px_#191A23] text-white">
          
          <div className="mx-auto max-w-3xl">
            {/* Speech Bubble Box */}
            <div className="relative rounded-[30px] border-2 border-[#B9FF66] bg-[#191A23] p-8 sm:p-10 shadow-[4px_4px_0px_#B9FF66]">
              {/* Star Ratings */}
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-[#B9FF66] text-[#B9FF66]" />
                ))}
              </div>

              <p className="text-lg sm:text-xl font-normal text-white leading-relaxed italic">
                &quot;{testimonials[currentIndex].quote}&quot;
              </p>

              {/* Bubble Arrow Tail */}
              <div className="absolute -bottom-4 left-12 h-6 w-6 rotate-45 border-r-2 border-b-2 border-[#B9FF66] bg-[#191A23]" />
            </div>

            {/* Author Info */}
            <div className="mt-8 pl-6 space-y-1">
              <h4 className="text-xl font-black text-[#B9FF66]">
                {testimonials[currentIndex].name}
              </h4>
              <p className="text-sm font-semibold text-white/70">
                {testimonials[currentIndex].role}
              </p>
            </div>

            {/* Controls & Pagination Dots */}
            <div className="mt-10 flex items-center justify-between pt-6 border-t border-white/10">
              <button
                onClick={prevSlide}
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white bg-[#191A23] text-white hover:border-[#B9FF66] hover:text-[#B9FF66] transition-colors"
                aria-label="Anterior"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-2">
                {testimonials.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-3 rounded-full transition-all ${
                      idx === currentIndex
                        ? "w-8 bg-[#B9FF66]"
                        : "w-3 bg-white/40 hover:bg-white"
                    }`}
                    aria-label={`Ir para depoimento ${idx + 1}`}
                  />
                ))}
              </div>

              <button
                onClick={nextSlide}
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white bg-[#191A23] text-white hover:border-[#B9FF66] hover:text-[#B9FF66] transition-colors"
                aria-label="Próximo"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
