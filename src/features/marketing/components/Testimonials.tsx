const testimonials = [
  {
    name: "Max Peters",
    role: "CEO da Adapta e expert em VSLs",
    quote:
      "O Prisma Player transformou a forma como entregamos VSLs. Nossa taxa de conversão subiu 30% desde que migramos. É impressionante como cada detalhe foi pensado para vender mais.",
  },
  {
    name: "Hytallo Soares",
    role: "Fatura mais de 1 milhão por mês com VSLs",
    quote:
      "Testei vários players antes do Prisma. Nenhum entrega o nível de inteligência que esse tem. O Smart Autoplay sozinho já valeu a migração.",
  },
  {
    name: "Leandro Ladeira",
    role: "Um dos top produtores da Hotmart",
    quote:
      "O que mais me impressiona é o analytics. Finalmente consigo ver exatamente onde estou perdendo vendas e ajustar meu vídeo em tempo real. Indispensável.",
  },
];

export default function Testimonials() {
  return (
    <section className="py-section themeable-bg-canvas">
      <div className="container-section max-w-[980px] mx-auto px-6">
        <h2 className="text-display-lg text-center mb-3 themeable-text-ink">
          Veja o que nossos clientes estão falando
        </h2>
        <p className="text-lead themeable-text-ink-muted-48 text-center mb-16 max-w-[650px] mx-auto">
          Ouça de quem já confia no Prisma Player para aumentar sua conversão
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="themeable-bg-canvas-parchment rounded-lg p-6 flex flex-col"
            >
              <div className="flex items-center gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg
                    key={i}
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="#0066cc"
                  >
                    <path d="M8 12.5L3.3 15.2L4.5 10L0.5 6.3L5.6 5.8L8 1L10.4 5.8L15.5 6.3L11.5 10L12.7 15.2L8 12.5Z" />
                  </svg>
                ))}
              </div>
              <p className="text-body themeable-text-ink-muted-80 flex-1 mb-6 leading-relaxed">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div>
                <p className="text-body-strong themeable-text-ink">{t.name}</p>
                <p className="text-caption themeable-text-ink-muted-48">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
