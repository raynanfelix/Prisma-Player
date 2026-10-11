import type { Metadata } from "next";
import Nav from "@/features/marketing/components/Nav";
import Footer from "@/features/marketing/components/Footer";
import { legalContactEmail, legalUpdatedAt, privacySections } from "@/content/legal/prisma-legal";

export const metadata: Metadata = {
  title: "Política de Privacidade | Prisma Player",
  description: "Política de privacidade da Prisma Player alinhada à LGPD, explicando dados coletados, bases legais, direitos e segurança.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="themeable-bg-canvas-parchment min-h-dvh">
      <Nav />
      <section className="mx-auto max-w-[920px] px-6 pb-20 pt-28">
        <p className="mb-3 text-caption-strong uppercase tracking-[0.18em] text-prisma-blue">LGPD</p>
        <h1 className="text-display-xl themeable-text-ink">Política de Privacidade</h1>
        <p className="mt-4 max-w-[760px] text-body-lg themeable-text-ink-muted-64">
          Esta política descreve como a Prisma Player trata dados pessoais de usuários, equipes e visitantes das VSLs publicadas.
        </p>
        <p className="mt-4 text-caption themeable-text-ink-muted-48">Última atualização: {legalUpdatedAt}</p>

        <div className="mt-10 space-y-5">
          {privacySections.map((section) => (
            <article key={section.title} className="rounded-[28px] border themeable-border-hairline themeable-bg-canvas p-6 shadow-[0_18px_50px_rgba(0,0,0,0.04)]">
              <h2 className="text-title-md themeable-text-ink">{section.title}</h2>
              <p className="mt-3 text-body themeable-text-ink-muted-64">{section.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-[28px] border border-prisma-blue/20 bg-prisma-blue/5 p-6">
          <h2 className="text-title-md themeable-text-ink">Canal de privacidade</h2>
          <p className="mt-3 text-body themeable-text-ink-muted-64">
            Para exercer direitos previstos na LGPD, envie sua solicitação para{" "}
            <a className="text-prisma-blue hover:underline" href={`mailto:${legalContactEmail}`}>{legalContactEmail}</a>.
          </p>
        </div>
      </section>
      <Footer />
    </main>
  );
}
