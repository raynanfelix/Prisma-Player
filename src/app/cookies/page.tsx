import type { Metadata } from "next";
import Nav from "@/features/marketing/components/Nav";
import Footer from "@/features/marketing/components/Footer";
import { cookieSections, legalContactEmail, legalUpdatedAt } from "@/content/legal/prisma-legal";

export const metadata: Metadata = {
  title: "Política de Cookies | Prisma Player",
  description: "Quais cookies e tecnologias similares a Prisma Player usa, por que usa e como você pode gerenciá-los (analytics, marketing e essenciais).",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return (
    <main className="themeable-bg-canvas-parchment min-h-dvh">
      <Nav />
      <section className="mx-auto max-w-[920px] px-6 pb-20 pt-28">
        <p className="mb-3 text-caption-strong uppercase tracking-[0.18em] text-prisma-blue">Privacidade</p>
        <h1 className="text-display-xl themeable-text-ink">Política de Cookies</h1>
        <p className="mt-4 max-w-[760px] text-body-lg themeable-text-ink-muted-64">
          Transparência total sobre os cookies do site e dos players: o que usamos, por que usamos e como você controla.
        </p>
        <p className="mt-4 text-caption themeable-text-ink-muted-48">Última atualização: {legalUpdatedAt}</p>

        <div className="mt-10 space-y-5">
          {cookieSections.map((section) => (
            <article key={section.title} className="rounded-[28px] border themeable-border-hairline themeable-bg-canvas p-6 shadow-[0_18px_50px_rgba(0,0,0,0.04)]">
              <h2 className="text-title-md themeable-text-ink">{section.title}</h2>
              <p className="mt-3 text-body themeable-text-ink-muted-64">{section.body}</p>
              {section.items ? (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-body themeable-text-ink-muted-64">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-[28px] border border-prisma-blue/20 bg-prisma-blue/5 p-6">
          <h2 className="text-title-md themeable-text-ink">Dúvidas sobre cookies</h2>
          <p className="mt-3 text-body themeable-text-ink-muted-64">
            Fale com a Prisma Player pelo e-mail{" "}
            <a className="text-prisma-blue hover:underline" href={`mailto:${legalContactEmail}`}>{legalContactEmail}</a>.
          </p>
        </div>
      </section>
      <Footer />
    </main>
  );
}
