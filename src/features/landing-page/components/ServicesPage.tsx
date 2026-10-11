"use client";

import Nav from "./Nav";
import Footer from "./Footer";
import Link from "next/link";
import {
  Sparkles,
  Zap,
  Shield,
  Volume2,
  LineChart,
  Split,
  Image as ImageIcon,
  MessageSquare,
  FastForward,
  Clock,
  Target,
  RotateCcw,
  Palette,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  Layers,
} from "lucide-react";

interface ServicesPageProps {
  account?: { firstName: string } | null;
}

export default function ServicesPage({ account }: ServicesPageProps) {
  // All 12 Extra Features + Core Features
  const allServices = [
    {
      id: "01",
      title: "Headlines AI",
      badgeTitle: "Play Rate Optimization",
      description:
        "O Headlines AI testa automaticamente diferentes headlines acima do seu vídeo usando seu tráfego real. A variação vencedora passa a ser exibida para novos visitantes.",
      highlights: [
        "Teste A/B automático com público real",
        "Crie variações persuasivas em segundos",
        "Otimização contínua de play rate",
      ],
      icon: Sparkles,
      bg: "bg-white",
      badgeBg: "bg-[#B9FF66]",
      textColor: "text-[#191A23]",
    },
    {
      id: "02",
      title: "Smart Autoplay",
      badgeTitle: "Engajamento Inicial",
      description:
        "Inicia seu vídeo automaticamente em formato animado com mensagem estratégica, criando curiosidade imediata e encorajando o lead a ativar o som.",
      highlights: [
        "Aumento imediato da taxa de visualização",
        "Layouts 100% personalizáveis",
        "Bypass completo de bloqueios mobile",
      ],
      icon: Volume2,
      bg: "bg-[#B9FF66]",
      badgeBg: "bg-[#191A23]",
      textColor: "text-[#191A23]",
      badgeText: "text-[#B9FF66]",
    },
    {
      id: "03",
      title: "Turbo Playback",
      badgeTitle: "Machine Learning",
      description:
        "Ajuste automático ou manual da velocidade de reprodução. O algoritmo descobre a velocidade ideal para a sua audiência manter o engajamento.",
      highlights: [
        "Velocidade padrão customizável",
        "Engajamento acelerado em vídeos longos",
        "Testes contínuos de velocidade por grupo",
      ],
      icon: Zap,
      bg: "bg-[#191A23]",
      badgeBg: "bg-[#B9FF66]",
      textColor: "text-white",
      badgeText: "text-[#191A23]",
    },
    {
      id: "04",
      title: "Teste A/B de Vídeo & Thumb",
      badgeTitle: "Dados Reais",
      description:
        "Teste múltiplas versões da sua VSL ou diferentes thumbnails com um único código embed. Saiba exatamente qual variação converte mais.",
      highlights: [
        "Divisão inteligente de tráfego (50/50)",
        "Métricas comparativas no painel",
        "Sem necessidade de criar páginas duplicadas",
      ],
      icon: Split,
      bg: "bg-[#F3F3F3]",
      badgeBg: "bg-[#B9FF66]",
      textColor: "text-[#191A23]",
    },
    {
      id: "05",
      title: "Analytics Avançado de Retenção",
      badgeTitle: "Métricas de ABandono",
      description:
        "O único analytics do mercado que exibe o gráfico de retenção segundo a segundo filtrado por dispositivo (Desktop vs Mobile), país e navegador.",
      highlights: [
        "Gráfico minuto a minuto da retenção do público",
        "Identificação de pontos críticos de desistência",
        "Play rate, engajamento e receita em tempo real",
      ],
      icon: LineChart,
      bg: "bg-white",
      badgeBg: "bg-[#B9FF66]",
      textColor: "text-[#191A23]",
    },
    {
      id: "06",
      title: "Thumbnail de Recuperação na Pausa",
      badgeTitle: "Recuperação de Vendas",
      description:
        "Quando o lead pausa o vídeo após o pitch de vendas, exibe um pop-up de recuperação com uma oferta especial ou bônus irresistível.",
      highlights: [
        "Resgate de até 15% das vendas perdidas na pausa",
        "Ofertas de bônus ou descontos no timing certo",
        "Design e cores customizáveis",
      ],
      icon: ImageIcon,
      bg: "bg-[#B9FF66]",
      badgeBg: "bg-[#191A23]",
      textColor: "text-[#191A23]",
      badgeText: "text-[#B9FF66]",
    },
    {
      id: "07",
      title: "Mini-Gancho de Abandono",
      badgeTitle: "Gatilhos Visuais",
      description:
        "Exibe avisos estratégicos de curiosidade ou urgência nos momentos exatos em que os dados mostram maior probabilidade de saída do lead.",
      highlights: [
        "Avisos dinâmicos nos pontos críticos de saída",
        "GIFs, relógios regressivos e alertas visuais",
        "Controle preciso de timing e duração",
      ],
      icon: MessageSquare,
      bg: "bg-[#191A23]",
      badgeBg: "bg-[#B9FF66]",
      textColor: "text-white",
      badgeText: "text-[#191A23]",
    },
    {
      id: "08",
      title: "Progresso Inteligente por IA",
      badgeTitle: "Percepção de Tempo",
      description:
        "Ajusta sutilmente a aceleração da barra de progresso para passar a sensação de que a VSL é mais rápida, incentivando o público a assistir até o fim.",
      highlights: [
        "Percepção de vídeo mais curto e dinâmico",
        "Aumento da taxa de conclusão do vídeo",
        "Ativação simples com um clique",
      ],
      icon: FastForward,
      bg: "bg-[#F3F3F3]",
      badgeBg: "bg-[#B9FF66]",
      textColor: "text-[#191A23]",
    },
    {
      id: "09",
      title: "Botões de Ação no Pitch",
      badgeTitle: "Timing de Oferta",
      description:
        "Sincronização milimétrica da exibição dos botões de checkout e seções de preço no momento exato da chamada de oferta do seu vídeo.",
      highlights: [
        "Nenhum botão de compra visível antes do pitch",
        "Sincroniza mesmo se o lead pausar ou avançar",
        "CTA, cores e sombras personalizáveis",
      ],
      icon: Clock,
      bg: "bg-white",
      badgeBg: "bg-[#B9FF66]",
      textColor: "text-[#191A23]",
    },
    {
      id: "10",
      title: "Pixel & Remarketing de Precisão",
      badgeTitle: "Audiência Qualificada",
      description:
        "Dispara eventos de pixel para Facebook, Google e TikTok com base no tempo real assistido por cada visitante (ex: assistiu 50%, 75% ou 100%).",
      highlights: [
        "Crie públicos Lookalike altamente qualificados",
        "Remarketing focado em quem ouviu a oferta",
        "Integração nativa com múltiplos pixels",
      ],
      icon: Target,
      bg: "bg-[#B9FF66]",
      badgeBg: "bg-[#191A23]",
      textColor: "text-[#191A23]",
      badgeText: "text-[#B9FF66]",
    },
    {
      id: "11",
      title: "Continuar Assistindo de Onde Parou",
      badgeTitle: "Retenção de Retorno",
      description:
        "Se o lead fechar a página e voltar mais tarde, o player detecta e dá a opção de continuar exatamente de onde parou sem ter que rever o início.",
      highlights: [
        "Sem retrabalho para o visitante interessado",
        "Aumenta a conversão de tráfego de remarketing",
        "Mensagem e estilo customizáveis",
      ],
      icon: RotateCcw,
      bg: "bg-[#191A23]",
      badgeBg: "bg-[#B9FF66]",
      textColor: "text-white",
      badgeText: "text-[#191A23]",
    },
    {
      id: "12",
      title: "Estilo & Personalização de Marca",
      badgeTitle: "Branding",
      description:
        "Cada detalhe do player é personalizável para combinar com a paleta de cores da sua landing page. Barra de tempo, ícones, sombras e controles.",
      highlights: [
        "Ajuste de cores primárias e secundárias",
        "Remoção ou adição de controles",
        "Player exclusivo com a identidade da sua marca",
      ],
      icon: Palette,
      bg: "bg-[#F3F3F3]",
      badgeBg: "bg-[#B9FF66]",
      textColor: "text-[#191A23]",
    },
    {
      id: "13",
      title: "Escudo DRM Anti-Pirataria",
      badgeTitle: "Segurança Absoluta",
      description:
        "Criptografia militar de arquivos de vídeo que bloqueia 100% das extensões e robôs de download de MP4 do mercado.",
      highlights: [
        "Bloqueio de extração direta de mídia",
        "Watermark dinâmica de segurança",
        "Proteção completa da sua propriedade intelectual",
      ],
      icon: Shield,
      bg: "bg-white",
      badgeBg: "bg-[#B9FF66]",
      textColor: "text-[#191A23]",
    },
    {
      id: "14",
      title: "Turbo CDN Instantânea",
      badgeTitle: "Infraestrutura BR",
      description:
        "Servidores de borda em São Paulo e Rio de Janeiro para garantir streaming em menos de 250ms com zero travamentos no Brasil.",
      highlights: [
        "Taxa de buffering inferior a 0.08%",
        "Resolução adaptativa conforme o 3G/4G/5G",
        "Suporte a picos de tráfego massivo",
      ],
      icon: Cpu,
      bg: "bg-[#B9FF66]",
      badgeBg: "bg-[#191A23]",
      textColor: "text-[#191A23]",
      badgeText: "text-[#B9FF66]",
    },
  ];

  const processSteps = [
    {
      num: "01",
      title: "Auditoria & Análise do Vídeo",
      desc: "Analisamos a estrutura da sua VSL e identificamos os pontos ideais de retenção e pitch delay.",
    },
    {
      num: "02",
      title: "Pesquisa de Gancho & Abandono",
      desc: "Mapeamos onde os leads costumam sair e configuramos miniativas e mini-ganchos visuais.",
    },
    {
      num: "03",
      title: "Otimização de Pitch Delay",
      desc: "Sincronizamos a revelação dos botões de oferta exatamente ao segundo da chamada de vendas.",
    },
    {
      num: "04",
      title: "Configuração do Smart Autoplay",
      desc: "Ativamos a reprodução com mensagem estratégica para capturar a atenção nos primeiros 5 segundos.",
    },
    {
      num: "05",
      title: "Recuperação de Pausa & DRM",
      desc: "Protegemos o vídeo contra pirataria e ativamos a thumbnail de recuperação para resgatar desistentes.",
    },
    {
      num: "06",
      title: "Monitoramento & Testes A/B",
      desc: "Acompanhamos o gráfico de retenção em tempo real e testamos novas variações para evoluir o faturamento.",
    },
  ];

  const caseStudies = [
    {
      title: "E-Commerce & Suplementos",
      metric: "+38% de Conversão no Pitch",
      desc: "Com o pitch delay sincronizado e carregamento instantâneo, a taxa de finalização do vídeo subiu de 22% para 36.4%.",
    },
    {
      title: "Infoprodutos & Lançamentos",
      metric: "45.000 Leads Simultâneos",
      desc: "Infraestrutura Turbo CDN que manteve o vídeo tocando com zero travamentos durante o pico de tráfego de um grande lançamento.",
    },
    {
      title: "Operação de Afiliados & X1",
      metric: "68% de Clique no Checkout",
      desc: "O uso da thumbnail de recuperação na pausa e mini-ganchos aumentou a taxa de cliques no botão de compra.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F3F3F3] text-[#191A23] font-sans antialiased selection:bg-[#B9FF66] selection:text-[#191A23]">
      <Nav account={account} />

      <main className="py-12 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-20">
          
          {/* Section 1: Hero Header Banner (Positivus Figma Style) */}
          <div className="rounded-[45px] border-2 border-[#191A23] bg-white p-8 sm:p-14 shadow-[8px_8px_0px_#191A23]">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8 space-y-6">
                <div className="inline-flex items-center gap-2 rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-1.5 text-xs font-black uppercase text-[#191A23] shadow-[2px_2px_0px_#191A23]">
                  <Sparkles className="h-4 w-4" />
                  Serviços & Funcionalidades
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#191A23] tracking-tight leading-tight">
                  Engenharia Completa de Serviços de VSL para Alta Conversão
                </h1>
                <p className="text-lg text-[#191A23]/80 font-medium leading-relaxed">
                  Conheça a suíte completa de 14 tecnologias exclusivas da Prisma Player desenvolvidas sob medida para maximizar a retenção e multiplicar o faturamento das suas ofertas digitais.
                </p>
              </div>

              <div className="lg:col-span-4 flex justify-center">
                <div className="w-full max-w-xs rounded-[35px] border-2 border-[#191A23] bg-[#191A23] p-6 text-white shadow-[6px_6px_0px_#B9FF66] text-center space-y-4">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#B9FF66] bg-[#B9FF66] text-[#191A23]">
                    <Layers className="h-7 w-7" />
                  </div>
                  <h3 className="text-xl font-black text-[#B9FF66]">14 Tecnologias Inclusas</h3>
                  <p className="text-xs font-medium text-white/80">
                    Tudo o que sua VSL precisa em um único player sem pagar ferramentas externas.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: CTA Notice Bar */}
          <div className="rounded-[35px] border-2 border-[#191A23] bg-[#191A23] p-8 text-white shadow-[6px_6px_0px_#191A23] flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-[#B9FF66] bg-[#B9FF66] text-[#191A23]">
                <Zap className="h-6 w-6" />
              </div>
              <div>
                <span className="inline-block rounded bg-[#B9FF66] px-2.5 py-0.5 text-xs font-black text-[#191A23] mb-1">
                  Ativação Instantânea
                </span>
                <p className="text-base font-bold">
                  Pronto para transformar a taxa de retenção da sua VSL hoje mesmo?
                </p>
              </div>
            </div>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-2xl border-2 border-[#191A23] bg-[#B9FF66] px-8 py-3.5 text-base font-black text-[#191A23] shadow-[3px_3px_0px_white] hover:bg-[#B9FF66]/90 transition-all whitespace-nowrap"
            >
              Testar 14 Dias Grátis
            </Link>
          </div>

          {/* Section 3: How We Work / Process Steps (Matching Figma Image Star Badges) */}
          <div className="space-y-10">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]">
                Nosso Processo de Otimização
              </div>
              <p className="text-lg text-[#191A23]/80 font-medium max-w-xl">
                Metodologia comprovada de 6 etapas para transformar vídeos comuns em máquinas de vendas.
              </p>
            </div>

            <div className="space-y-4">
              {processSteps.map((step) => (
                <div
                  key={step.num}
                  className="rounded-[30px] border-2 border-[#191A23] bg-white p-6 sm:p-8 shadow-[4px_4px_0px_#191A23] flex items-center gap-6 hover:translate-x-1 transition-all"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-[#191A23] bg-[#191A23] text-[#B9FF66] font-mono font-black text-2xl shadow-[2px_2px_0px_#B9FF66]">
                    {step.num}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-[#191A23]">{step.title}</h3>
                    <p className="text-sm font-medium text-[#191A23]/80 mt-1">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Use Cases (Figma 3-Column Dark Box) */}
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]">
                Casos de Sucesso por Nicho
              </div>
            </div>

            <div className="rounded-[45px] border-2 border-[#191A23] bg-[#191A23] p-8 sm:p-12 text-white shadow-[8px_8px_0px_#191A23]">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 divide-y-2 lg:divide-y-0 lg:divide-x-2 divide-white/20">
                {caseStudies.map((cs, idx) => (
                  <div key={idx} className={`space-y-4 ${idx > 0 ? "pt-8 lg:pt-0 lg:pl-8" : ""}`}>
                    <span className="inline-block rounded-lg bg-[#B9FF66] px-3 py-1 text-xs font-black text-[#191A23]">
                      {cs.metric}
                    </span>
                    <h3 className="text-xl font-black text-white">{cs.title}</h3>
                    <p className="text-sm text-white/80 font-medium leading-relaxed">{cs.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 5: Our Other Services (The Complete 14 Features Grid) */}
          <div className="space-y-10">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]">
                Todos os Nossos Serviços & Recursos (14)
              </div>
              <p className="text-lg text-[#191A23]/80 font-medium max-w-xl">
                Explore a grade completa de ferramentas disponíveis em todos os planos Prisma Player.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {allServices.map((service) => {
                const IconComp = service.icon;
                const isDark = service.textColor === "text-white";
                return (
                  <div
                    key={service.id}
                    className={`rounded-[45px] border-2 border-[#191A23] ${service.bg} p-8 sm:p-10 shadow-[6px_6px_0px_#191A23] flex flex-col justify-between hover:-translate-y-1 transition-transform`}
                  >
                    <div>
                      {/* Header */}
                      <div className="flex items-center justify-between gap-4 mb-6">
                        <span
                          className={`inline-block rounded-xl border-2 border-[#191A23] ${service.badgeBg} ${
                            service.badgeText || "text-[#191A23]"
                          } px-4 py-1.5 text-xs font-black shadow-[2px_2px_0px_#191A23]`}
                        >
                          {service.badgeTitle}
                        </span>
                        <span className={`text-2xl font-black ${service.textColor} opacity-40 font-mono`}>
                          {service.id}
                        </span>
                      </div>

                      {/* Title & Description */}
                      <h3 className={`text-2xl sm:text-3xl font-black ${service.textColor} tracking-tight leading-tight mb-4`}>
                        {service.title}
                      </h3>

                      <p className={`text-sm sm:text-base font-medium ${service.textColor} opacity-90 leading-relaxed mb-6`}>
                        {service.description}
                      </p>

                      {/* Bullet Highlights */}
                      <div className="space-y-2 border-t border-[#191A23]/15 pt-4">
                        {service.highlights.map((item, i) => (
                          <div key={i} className="flex items-center gap-2.5">
                            <CheckCircle2 className={`h-4 w-4 shrink-0 ${isDark ? "text-[#B9FF66]" : "text-[#191A23]"}`} />
                            <span className={`text-xs font-semibold ${service.textColor} opacity-90`}>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer Action */}
                    <div className="mt-8 pt-6 border-t border-[#191A23]/15 flex items-center justify-between">
                      <Link
                        href="/signup"
                        className="flex items-center gap-3 font-bold text-sm hover:opacity-80 transition-opacity"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#191A23] bg-[#191A23] text-[#B9FF66] shadow-[2px_2px_0px_#191A23]">
                          <ArrowUpRight className="h-5 w-5" />
                        </div>
                        <span className={`${service.textColor} underline underline-offset-4 decoration-2`}>
                          Ativar no seu funil
                        </span>
                      </Link>

                      <div className={`p-3 rounded-2xl border-2 border-[#191A23] ${service.badgeBg} shadow-[2px_2px_0px_#191A23]`}>
                        <IconComp className="h-6 w-6 text-[#191A23]" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 6: Bottom CTA Banner (Figma Bottom Box) */}
          <div className="rounded-[45px] border-2 border-[#191A23] bg-[#B9FF66] p-8 sm:p-14 shadow-[8px_8px_0px_#191A23] flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-3 text-center md:text-left">
              <h2 className="text-3xl sm:text-4xl font-black text-[#191A23]">
                Pronto para Escalar suas Vendas de VSL?
              </h2>
              <p className="text-base font-bold text-[#191A23]/80 max-w-xl">
                Junte-se aos maiores infoprodutores do Brasil. Teste todos os 14 recursos por 14 dias sem cartão de crédito.
              </p>
            </div>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-2xl border-2 border-[#191A23] bg-[#191A23] px-8 py-4 text-base font-black text-white shadow-[4px_4px_0px_white] hover:bg-[#191A23]/90 transition-all whitespace-nowrap"
            >
              Criar Conta Grátis
            </Link>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
