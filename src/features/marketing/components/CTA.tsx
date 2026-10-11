export default function CTA() {
  return (
    <section className="py-section themeable-bg-canvas-parchment">
      <div className="container-section max-w-[700px] mx-auto px-6 text-center">
        <h2 className="text-display-lg themeable-text-ink mb-4">
          Experimente o Prisma Player de graça
        </h2>
        <p className="text-lead themeable-text-ink-muted-48 mb-8">
          Teste sem riscos por 14 dias e descubra como aumentar
          instantaneamente as conversões do seu vídeo de vendas.
        </p>
        <a
          href="/pricing"
          className="bg-prisma-blue text-white text-[18px] font-light leading-none rounded-pill px-7 py-3.5 inline-flex items-center justify-center transition-all active:scale-95 hover:opacity-90"
        >
          Comece seu teste grátis
        </a>
      </div>
    </section>
  );
}
