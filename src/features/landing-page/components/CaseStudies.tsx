"use client";

import { ArrowUpRight } from "lucide-react";

export default function CaseStudies() {
  const cases = [
    {
      title: "Produtor de Suplementos (VSL de R$ 397)",
      metric: "+38% de conversão no Pitch",
      text: "Após migrar do player concorrente para o Prisma Player, a taxa de permanência até o minuto 14:20 subiu de 22% para 36.4%, melhorando o ROI do tráfego no Facebook Ads.",
    },
    {
      title: "Infoproduto de Finanças (Oferta de R$ 997)",
      metric: "Zero travamentos em pico de 45k ao vivo",
      text: "Durante um lançamento com tráfego simultâneo intenso, o carregamento instantâneo do Prisma manteve o consumo estável sem qualquer perda de qualidade ou buffering.",
    },
    {
      title: "Coprodutor de Emagrecimento (Funil X1)",
      metric: "68% de cliques no botão de checkout",
      text: "Com a revelação milimétrica no Pitch Delay inteligente, os leads só viram o preço no momento exato de maior ancoragem de valor, elevando os cliques no checkout.",
    },
  ];

  return (
    <section id="casos-de-uso" className="scroll-mt-28 bg-[#FAFAFB] py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#191A23]/50 ring-1 ring-[#191A23]/[0.06]">
            Casos de Uso &amp; Resultados
          </span>
          <h2 className="mt-5 text-balance text-[22px] font-medium leading-snug tracking-tight text-[#191A23] sm:text-[26px]">
            Veja como grandes operações de infoprodutos e afiliados usam o Prisma Player para
            escalar suas ofertas.
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {cases.map((item, idx) => (
            <article
              key={idx}
              className="flex flex-col justify-between rounded-[26px] border border-[#191A23]/[0.07] bg-white p-7 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_30px_60px_-40px_rgba(25,26,35,0.35)]"
            >
              <div>
                <span className="inline-flex rounded-full bg-[#B9FF66]/35 px-3 py-1 text-[11px] font-semibold text-[#191A23]">
                  {item.metric}
                </span>
                <h3 className="mt-5 text-[17px] font-semibold leading-snug tracking-tight text-[#191A23]">
                  {item.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#191A23]/55">
                  {item.text}
                </p>
              </div>

              <a
                href="/signup"
                className="mt-6 inline-flex items-center gap-1.5 border-t border-[#191A23]/[0.06] pt-4 text-[13px] font-medium text-[#191A23]/80 transition-colors hover:text-[#191A23]"
              >
                Ver como aplicar no seu funil
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
