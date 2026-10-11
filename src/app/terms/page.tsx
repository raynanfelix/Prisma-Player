import type { Metadata } from "next";
import Nav from "@/features/marketing/components/Nav";
import Footer from "@/features/marketing/components/Footer";
import { legalContactEmail, legalUpdatedAt, termsSections } from "@/content/legal/prisma-legal";

export const metadata: Metadata = {
  title: "Termos de Uso | Prisma Player",
  description: "Termos de uso da Prisma Player para contas, planos, vídeos, métricas, IA, limites operacionais e responsabilidades.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="themeable-bg-canvas-parchment min-h-dvh">
      <Nav />
      <section className="mx-auto max-w-[920px] px-6 pb-20 pt-28">
        <p className="mb-3 text-caption-strong uppercase tracking-[0.18em] text-prisma-blue">Legal</p>
        <h1 className="text-display-xl themeable-text-ink">Termos de Uso</h1>
        <p className="mt-4 max-w-[720px] text-body-lg themeable-text-ink-muted-64">
          Estes termos explicam as regras para usar a Prisma Player de forma segura, profissional e transparente.
        </p>
        <p className="mt-4 text-caption themeable-text-ink-muted-48">Última atualização: {legalUpdatedAt}</p>

        <div className="mt-10 space-y-5">
          {termsSections.map((section) => (
            <article key={section.title} className="rounded-[28px] border themeable-border-hairline themeable-bg-canvas p-6 shadow-[0_18px_50px_rgba(0,0,0,0.04)]">
              <h2 className="text-title-md themeable-text-ink">{section.title}</h2>
              <p className="mt-3 text-body themeable-text-ink-muted-64">{section.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-[28px] border border-prisma-blue/20 bg-prisma-blue/5 p-6">
          <h2 className="text-title-md themeable-text-ink">Contato</h2>
          <p className="mt-3 text-body themeable-text-ink-muted-64">
            Para dúvidas sobre estes Termos, fale com a Prisma Player pelo e-mail{" "}
            <a className="text-prisma-blue hover:underline" href={`mailto:${legalContactEmail}`}>{legalContactEmail}</a>.
          </p>
        </div>
      </section>
      <Footer />
    </main>
  );
}
