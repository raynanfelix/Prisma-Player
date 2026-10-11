const features = [
  {
    id: "headlines",
    title: "Headlines AI",
    tagline: "A headline perfeita para cada visitante",
    description:
      "O Headlines AI testa automaticamente diferentes headlines acima do seu vídeo para descobrir qual gera mais play rate. Com a headline certa, mais pessoas clicam no play, mais gente chega até sua oferta e mais vendas você faz.",
    items: [
      "Teste A/B automático de headlines usando seu tráfego real",
      "Crie quantas variações quiser em segundos",
      "Otimização contínua — a headline vencedora é exibida para novos visitantes",
    ],
    light: true,
  },
  {
    id: "autoplay",
    title: "Smart Autoplay",
    tagline: "Seu vídeo começa. Sua audiência engaja.",
    description:
      "O Smart Autoplay inicia seu vídeo automaticamente com uma mensagem estratégica, criando curiosidade e urgência. Quando o lead clica, o vídeo começa do início — sem perder nada.",
    items: [
      "Template validado que aumenta sua play rate instantaneamente",
      "Layouts personalizados para destacar sua marca",
      "Escolha o trecho mais impactante para exibir no autoplay",
    ],
    light: false,
  },
  {
    id: "turbo",
    title: "Turbo Playback",
    tagline: "A velocidade ideal para cada audiência",
    description:
      "Cada audiência prefere assistir em uma velocidade específica. O Turbo usa machine learning para encontrar a velocidade ideal para o seu público, aumentando engajamento e conversão.",
    items: [
      "Velocidade padrão ajustável para todo o público",
      "Teste automático de velocidade para maximizar engajamento",
      "Otimização contínua baseada em dados reais",
    ],
    light: true,
  },
  {
    id: "ab-testing",
    title: "Teste A/B",
    tagline: "Vídeos que evoluem com seus dados",
    description:
      "Com o Teste A/B do Prisma, você pode renovar seus vídeos constantemente. Teste diferentes versões, elementos e abordagens para descobrir o que realmente funciona.",
    items: [
      "Teste múltiplos vídeos com um único embed",
      "Varie elementos específicos para comparar performance",
      "Métricas claras de conversão por variação",
    ],
    light: false,
  },
  {
    id: "analytics",
    title: "Analytics",
    tagline: "Métricas que mostram onde você perde vendas",
    description:
      "O analytics mais completo do mercado. O único que mostra o gráfico de retenção filtrado por dispositivo, país e navegador. Saiba exatamente onde seus leads estão abandonando e otimize.",
    items: [
      "Play rate, engajamento, conversões e receita em tempo real",
      "Gráfico de retenção com filtros por país, dispositivo e navegador",
      "Identifique pontos de abandono e otimize seu conteúdo",
    ],
    light: true,
  },
  {
    id: "recovery",
    title: "Thumbnail de Recuperação",
    tagline: "A última chance de converter",
    description:
      "Quando um lead pausa o vídeo após seu pitch de vendas, a Thumbnail de Recuperação aparece com uma oferta irresistível. É sua última chance de salvar uma venda que seria perdida.",
    items: [
      "Ofereça descontos ou bônus no momento da pausa",
      "Designs 100% personalizáveis",
      "Aumento de 10-15% na conversão comprovado",
    ],
    light: false,
  },
  {
    id: "mini-gancho",
    title: "Mini-Gancho",
    tagline: "Mensagens que salvam vendas",
    description:
      "Com base nos dados do Analytics, o Mini-Gancho adiciona mensagens estratégicas nos pontos de maior abandono do seu vídeo, mantendo sua audiência engajada até o final.",
    items: [
      "Mensagens de curiosidade nos pontos críticos de abandono",
      "GIFs, contagens regressivas e elementos visuais dinâmicos",
      "Controle total sobre timing e duração das mensagens",
    ],
    light: true,
  },
  {
    id: "smart-progress",
    title: "Progresso Inteligente",
    tagline: "Seu vídeo parece mais curto. Vende mais.",
    description:
      "O Progresso Inteligente ajusta a barra de progresso para dar a impressão de que seu vídeo é mais curto do que realmente é. Mais pessoas assistem até o final, e você vende mais.",
    items: [
      "Velocidadde de progresso otimizada por IA",
      "Aumento de conversão instantâneo com um clique",
      "Testes contínuos para resultados cada vez melhores",
    ],
    light: false,
  },
  {
    id: "cta-buttons",
    title: "Botões de Ação",
    tagline: "O botão certo, no momento certo",
    description:
      "Mostre seu botão de compra ou seções da página no momento exato do seu pitch de vendas. Nada de botão antes da hora — sua audiência vê a oferta quando está pronta para comprar.",
    items: [
      "Sincronização perfeita com o timing do seu vídeo",
      "CTA, cor, tamanho e posição totalmente customizáveis",
      "Apareça no momento exato do seu pitch de vendas",
    ],
    light: true,
  },
  {
    id: "pixel",
    title: "Pixel & Remarketing",
    tagline: "Públicos que compram de volta",
    description:
      "Crie públicos personalizados no Facebook, Google e outras plataformas com base em quanto do vídeo cada lead assistiu. Escale seu tráfego com remarketing inteligente.",
    items: [
      "Integração com Facebook, Google, Taboola e mais",
      "Públicos semelhantes para escalar campanhas",
      "Remarketing segmentado por engajamento no vídeo",
    ],
    light: false,
  },
  {
    id: "resume",
    title: "Continuar Assistindo",
    tagline: "Nunca perca um lead pelo caminho",
    description:
      "Permita que seus leads continuem o vídeo de onde pararam. Ideal para quem é interrompido mas ainda quer saber da sua oferta. Mais leads chegam até o final, mais vendas.",
    items: [
      "Opção de reiniciar ou continuar de onde parou",
      "Texto e cores 100% personalizáveis",
      "Integração com campanhas de remarketing",
    ],
    light: true,
  },
  {
    id: "style",
    title: "Estilo",
    tagline: "Seu player, sua marca",
    description:
      "Cada detalhe do player é personalizável para refletir a identidade da sua marca. Da barra de progresso aos controles, tudo se adapta ao seu estilo.",
    items: [
      "Barra de progresso e tempo total customizáveis",
      "Controles de volume, tela cheia e velocidade",
      "Player com a cara da sua marca em segundos",
    ],
    light: false,
  },
];

export default function Features() {
  return (
    <section id="features">
      {features.map((feature, index) => (
        <div
          key={feature.id}
          className={`py-section ${
            feature.light ? "themeable-bg-canvas" : "bg-surface-tile-1"
          }`}
        >
          <div className="container-section max-w-[980px] mx-auto px-6">
            <span
              className={`text-caption font-semibold tracking-wider uppercase mb-2 block ${
                feature.light ? "themeable-text-ink-muted-48" : "themeable-text-body-muted"
              }`}
            >
              Feature {String(index + 1).padStart(2, "0")}
            </span>
            <h2
              className={`text-display-lg mb-2 ${
                feature.light ? "themeable-text-ink" : "text-on-dark"
              }`}
            >
              {feature.title}
            </h2>
            <p
              className={`text-tagline mb-6 ${
                feature.light ? "themeable-text-ink-muted-80" : "themeable-text-body-muted"
              }`}
            >
              {feature.tagline}
            </p>
            <p
              className={`text-body mb-8 max-w-[680px] leading-relaxed ${
                feature.light ? "themeable-text-ink-muted-80" : "themeable-text-body-muted"
              }`}
            >
              {feature.description}
            </p>

            <ul className="space-y-4 mb-10">
              {feature.items.map((item, i) => (
                <li
                  key={i}
                  className={`flex items-start gap-3 ${
                    feature.light ? "themeable-text-ink-muted-80" : "themeable-text-body-muted"
                  }`}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    className="mt-0.5 shrink-0"
                  >
                    <path
                      d="M16.7 5.3L7.9 14.2L3.3 9.6"
                      stroke={
                        feature.light ? "#0066cc" : "#2997ff"
                      }
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-[17px] leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-4">
              <a
                href="/signup"
                className="bg-prisma-blue text-white text-sm font-normal leading-none rounded-pill px-[22px] py-[11px] inline-flex items-center justify-center transition-all active:scale-95 hover:opacity-90"
              >
                Comece seu teste grátis
              </a>
              {feature.light ? (
                <a
                  href="#"
                  className="text-prisma-blue text-sm hover:underline"
                >
                  Saiba mais sobre {feature.title}
                </a>
              ) : (
                <a
                  href="#"
                  className="text-prisma-blue-on-dark text-sm hover:underline"
                >
                  Saiba mais sobre {feature.title}
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
