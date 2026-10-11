"use client";

import { ArrowUpRight } from "lucide-react";

export default function CaseStudies() {
  const cases = [
    {
      title: "Produtor de Suplementos (VDSL de R$ 397)",
      metric: "+38% de conversão no Pitch",
      text: "Após migrar do player concorrente para o Prisma Player, a taxa de permanência até o minuto 14:20 subiu de 22% para 36.4%, dobrando o ROI do tráfego no Facebook Ads.",
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
    <section id="casos-de-uso" className="bg-[#F3F3F3] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center gap-6 mb-16">
          <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]">
            Casos de Uso & Resultados
          </div>
          <p className="max-w-xl text-lg text-[#191A23]/80 font-medium">
            Veja como grandes operações de infoprodutos e afiliados usam o Prisma Player para escalar suas ofertas.
          </p>
        </div>

        {/* Case Studies Dark Container */}
        <div className="rounded-[45px] border-2 border-[#191A23] bg-[#191A23] p-8 sm:p-12 shadow-[8px_8px_0px_#191A23]">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 divide-y-2 lg:divide-y-0 lg:divide-x-2 divide-white/20">
            {cases.map((item, idx) => (
              <div
                key={idx}
                className={`flex flex-col justify-between space-y-6 ${
                  idx > 0 ? "pt-8 lg:pt-0 lg:pl-8" : ""
                }`}
              >
                <div className="space-y-4">
                  <span className="inline-block rounded-lg bg-[#B9FF66] px-3 py-1 text-xs font-black text-[#191A23]">
                    {item.metric}
                  </span>
                  <h3 className="text-xl font-black text-white leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-sm font-normal text-white/80 leading-relaxed">
                    {item.text}
                  </p>
                </div>

                <div>
                  <a
                    href="/signup"
                    className="inline-flex items-center gap-2 text-sm font-bold text-[#B9FF66] hover:underline underline-offset-4"
                  >
                    <span>Ver como aplicar no seu funil</span>
                    <ArrowUpRight className="h-4 w-4 text-[#B9FF66]" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
