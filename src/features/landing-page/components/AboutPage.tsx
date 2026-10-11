"use client";

import Nav from "./Nav";
import Footer from "./Footer";
import Link from "next/link";
import { Sparkles, Target, Zap, ShieldCheck, Heart, ArrowUpRight, Award, Users } from "lucide-react";

interface AboutPageProps {
  account?: { firstName: string } | null;
}

export default function AboutPage({ account }: AboutPageProps) {
  const values = [
    {
      title: "Obsessão por Velocidade",
      description: "Sabemos que cada milissegundo de travamento em uma VSL é dinheiro perdido. Otimizamos a infraestrutura para entregar performance instantânea.",
      bg: "bg-[#B9FF66]",
      textColor: "text-[#191A23]",
      icon: Zap,
    },
    {
      title: "Transparência de Dados",
      description: "Métricas reais e segundo a segundo da retenção do seu vídeo. Sem dados inflados ou estimativas vazias.",
      bg: "bg-[#191A23]",
      textColor: "text-white",
      icon: Target,
    },
    {
      title: "Proteção Inabalável",
      description: "Seu conteúdo é seu maior ativo. Desenvolvemos o mais alto nível de segurança contra clonagem e downloads indevidos.",
      bg: "bg-white",
      textColor: "text-[#191A23]",
      icon: ShieldCheck,
    },
    {
      title: "Foco no Sucesso do Cliente",
      description: "Acompanhamento próximo e suporte humanizado via WhatsApp para ajudar sua operação a escalar sem sobressaltos.",
      bg: "bg-[#F3F3F3]",
      textColor: "text-[#191A23]",
      icon: Heart,
    },
  ];

  const timeline = [
    {
      year: "2024",
      title: "Nascimento da Ideia",
      text: "Criamos a primeira versão da CDN dedicada a VSLs após vivenciarmos a perda massiva de vendas por instabilidade nos players tradicionais.",
    },
    {
      year: "2025",
      title: "Lançamento do Escudo DRM",
      text: "Implementamos a criptografia proprietária que bloqueou 100% dos softwares de download e extração de vídeo do mercado.",
    },
    {
      year: "2026",
      title: "Inteligência de Retenção & A/B",
      text: "Alcançamos a marca de mais de 10 milhões de views por mês, integrando testes A/B de thumb e pitch delay sincronizado ao segundo exato.",
    },
  ];

  const leaders = [
    {
      name: "Guilherme Siqueira",
      role: "CEO & Co-fundador",
      bio: "Ex-gestor de tráfego de ofertas de 8 dígitos, especialista em infraestrutura e conversão de vídeo.",
    },
    {
      name: "Renata Miranda",
      role: "CTO & Liderança de Engenharia",
      bio: "Especialista em distribuição de mídia de baixa latência e otimização de redes CDN de altíssima vazão.",
    },
    {
      name: "Lucas Alencar",
      role: "Head de Produto & CX",
      bio: "Focado em construir a melhor experiência de usabilidade para produtores, afiliados e agências de lançamento.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F3F3F3] text-[#191A23] font-sans antialiased selection:bg-[#B9FF66] selection:text-[#191A23]">
      <Nav account={account} />

      <main className="py-12 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-20">
          
          {/* Hero Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-1.5 text-xs font-black uppercase text-[#191A23] shadow-[3px_3px_0px_#191A23]">
                <Sparkles className="h-4 w-4" />
                Sobre a Prisma Player
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#191A23] tracking-tight leading-tight">
                Revolucionando a retenção de VSLs no mercado digital.
              </h1>

              <p className="text-lg text-[#191A23]/80 font-medium leading-relaxed">
                Nascemos do desejo de oferecer aos infoprodutores e afiliados uma tecnologia de reprodução de vídeo ágil, segura e verdadeiramente desenhada para vender.
              </p>
            </div>

            {/* Graphic Badge */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="w-full max-w-md rounded-[45px] border-2 border-[#191A23] bg-[#191A23] p-8 text-white shadow-[8px_8px_0px_#B9FF66] space-y-6">
                <div className="flex items-center justify-between border-b border-white/20 pb-4">
                  <span className="text-xs font-mono text-[#B9FF66]">prisma_tech_manifesto</span>
                  <Award className="h-6 w-6 text-[#B9FF66]" />
                </div>
                <h3 className="text-2xl font-black text-[#B9FF66]">
                  +10 Milhões
                </h3>
                <p className="text-sm font-medium text-white/80">
                  De visualizações de VSL processadas mensalmente com zero perda de carregamento.
                </p>
                <div className="rounded-2xl border-2 border-[#B9FF66] bg-[#B9FF66] p-4 text-[#191A23] text-center font-bold text-sm">
                  100% Focado em Alta Conversão
                </div>
              </div>
            </div>
          </div>

          {/* Manifesto Section */}
          <div className="rounded-[45px] border-2 border-[#191A23] bg-white p-8 sm:p-14 shadow-[8px_8px_0px_#191A23] space-y-6">
            <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-1.5 text-xl font-black text-[#191A23] shadow-[2px_2px_0px_#191A23]">
              Nosso Manifesto
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-[#191A23] tracking-tight">
              Acreditamos que todo vídeo de vendas merece ser assistido sem travamentos.
            </h2>
            <p className="text-base sm:text-lg text-[#191A23]/80 leading-relaxed">
              No tráfego pago, cada clique em uma página de vendas representa um investimento financeiro real. Quando um player demora para carregar ou congela no momento do pitch, esse investimento é desperdiçado. Desenvolvemos o Prisma Player para eliminar os gargalos de infraestrutura e devolver aos produtores o controle total sobre o comportamento do seu público.
            </p>
          </div>

          {/* Values Grid */}
          <div className="space-y-10">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]">
                Nossos Valores
              </div>
              <p className="text-lg text-[#191A23]/80 font-medium">
                Os pilares que guiam nosso desenvolvimento diário de software.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {values.map((v, idx) => {
                const IconComp = v.icon;
                return (
                  <div
                    key={idx}
                    className={`rounded-[40px] border-2 border-[#191A23] ${v.bg} p-8 sm:p-10 shadow-[6px_6px_0px_#191A23] flex flex-col justify-between space-y-6`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-[#191A23] bg-white shadow-[2px_2px_0px_#191A23]">
                        <IconComp className="h-6 w-6 text-[#191A23]" />
                      </div>
                      <span className={`text-xl font-black ${v.textColor} font-mono opacity-50`}>
                        0{idx + 1}
                      </span>
                    </div>

                    <div>
                      <h3 className={`text-2xl font-black ${v.textColor} mb-2`}>
                        {v.title}
                      </h3>
                      <p className={`text-sm sm:text-base font-medium ${v.textColor} opacity-90 leading-relaxed`}>
                        {v.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timeline Section */}
          <div className="rounded-[45px] border-2 border-[#191A23] bg-[#191A23] p-8 sm:p-14 text-white shadow-[8px_8px_0px_#191A23] space-y-10">
            <div className="inline-flex items-center rounded-xl border-2 border-white bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[3px_3px_0px_white]">
              Nossa Trajetória
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 divide-y-2 lg:divide-y-0 lg:divide-x-2 divide-white/20">
              {timeline.map((item, idx) => (
                <div
                  key={idx}
                  className={`space-y-4 ${idx > 0 ? "pt-8 lg:pt-0 lg:pl-8" : ""}`}
                >
                  <span className="inline-block rounded-lg bg-[#B9FF66] px-3 py-1 text-sm font-black text-[#191A23] font-mono">
                    {item.year}
                  </span>
                  <h3 className="text-xl font-black text-white">
                    {item.title}
                  </h3>
                  <p className="text-sm font-normal text-white/80 leading-relaxed">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Leadership Section */}
          <div className="space-y-10">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]">
                Liderança & Time
              </div>
              <p className="text-lg text-[#191A23]/80 font-medium">
                Pessoas com vasta bagagem no mercado de infoprodutos guiando a empresa.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {leaders.map((leader, idx) => (
                <div
                  key={idx}
                  className="rounded-[35px] border-2 border-[#191A23] bg-white p-8 shadow-[5px_5px_0px_#191A23] space-y-4"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#191A23] bg-[#B9FF66] shadow-[2px_2px_0px_#191A23]">
                    <Users className="h-7 w-7 text-[#191A23]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-[#191A23]">{leader.name}</h3>
                    <p className="text-xs font-bold text-[#191A23]/70 uppercase tracking-wider mt-1">{leader.role}</p>
                  </div>
                  <p className="text-xs font-medium text-[#191A23]/80 leading-relaxed pt-2 border-t border-[#191A23]/15">
                    {leader.bio}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA Banner */}
          <div className="rounded-[45px] border-2 border-[#191A23] bg-[#B9FF66] p-8 sm:p-12 shadow-[8px_8px_0px_#191A23] flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-2 text-center md:text-left">
              <h2 className="text-3xl font-black text-[#191A23]">
                Quer fazer parte dessa história de alta conversão?
              </h2>
              <p className="text-base font-bold text-[#191A23]/80">
                Comece a usar o Prisma Player hoje mesmo no seu funil de vendas.
              </p>
            </div>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-2xl border-2 border-[#191A23] bg-[#191A23] px-8 py-4 text-base font-extrabold text-white shadow-[4px_4px_0px_white] hover:bg-[#191A23]/90 transition-all"
            >
              <span>Testar 14 Dias Grátis</span>
              <ArrowUpRight className="h-5 w-5 ml-2 text-[#B9FF66]" />
            </Link>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
