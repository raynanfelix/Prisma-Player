"use client";

import Link from "next/link";
import { CheckCircle2, Mail, type LucideIcon } from "lucide-react";
import type { LegalSection } from "@/content/legal/prisma-legal";
import Nav from "./Nav";
import Footer from "./Footer";

/**
 * Layout das páginas jurídicas (/terms, /privacy, /cookies) no mesmo design
 * system Positivus das páginas de vendas (ServicesPage): cards
 * rounded-[45px] com borda #191A23, sombra dura, ciclo de fundos
 * branco → lima → tinta → #F3F3F3, chips numerados e listas com CheckCircle2.
 */

const CARD_SKINS = [
  { card: "bg-white", badge: "bg-[#B9FF66] text-[#191A23]", text: "text-[#191A23]", check: "text-[#191A23]", dark: false },
  { card: "bg-[#B9FF66]", badge: "bg-[#191A23] text-[#B9FF66]", text: "text-[#191A23]", check: "text-[#191A23]", dark: false },
  { card: "bg-[#191A23]", badge: "bg-[#B9FF66] text-[#191A23]", text: "text-white", check: "text-[#B9FF66]", dark: true },
  { card: "bg-[#F3F3F3]", badge: "bg-[#B9FF66] text-[#191A23]", text: "text-[#191A23]", check: "text-[#191A23]", dark: false },
] as const;

interface LegalPageLayoutProps {
  tag: string;
  title: string;
  intro: string;
  icon: LucideIcon;
  sections: LegalSection[];
  updatedAt: string;
  contactEmail: string;
  contactTitle: string;
  contactIntro: string;
}

export default function LegalPageLayout({
  tag,
  title,
  intro,
  icon: Icon,
  sections,
  updatedAt,
  contactEmail,
  contactTitle,
  contactIntro,
}: LegalPageLayoutProps) {
  return (
    <div className="min-h-dvh bg-[#EFEFEF]">
      <Nav />

      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        {/* Cabeçalho — mesmo padrão de seção das páginas de vendas */}
        <header className="space-y-6">
          <div className="inline-flex items-center gap-3 rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-4 py-2 text-2xl font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]">
            <Icon className="h-6 w-6" />
            {tag}
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-[#191A23]">
            {title}
          </h1>
          <p className="text-base sm:text-lg font-medium text-[#191A23]/80 max-w-2xl leading-relaxed">
            {intro}
          </p>
          <span className="inline-flex items-center rounded-xl border-2 border-[#191A23] bg-white px-4 py-2 text-xs font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]">
            Última atualização: {updatedAt}
          </span>
        </header>

        {/* Seções — cards no mesmo estilo da grade de serviços */}
        <div className="mt-14 space-y-6 sm:space-y-8">
          {sections.map((section, index) => {
            const skin = CARD_SKINS[index % CARD_SKINS.length];
            const match = section.title.match(/^(\d+)\.\s*(.*)$/);
            const number = match ? match[1].padStart(2, "0") : "§";
            const heading = match ? match[2] : section.title;
            return (
              <article
                key={section.title}
                className={`rounded-[45px] border-2 border-[#191A23] ${skin.card} p-6 sm:p-10 shadow-[6px_6px_0px_#191A23] hover:-translate-y-1 transition-transform`}
              >
                <div className="flex items-center justify-between gap-4 mb-6">
                  <span
                    className={`inline-flex items-center rounded-xl border-2 border-[#191A23] ${skin.badge} px-4 py-1.5 text-xs font-black shadow-[2px_2px_0px_#191A23] font-mono`}
                  >
                    {number}
                  </span>
                  <span className={`text-2xl font-black ${skin.text} opacity-40 font-mono`}>
                    {number}
                  </span>
                </div>

                <h2 className={`text-xl sm:text-2xl font-black tracking-tight leading-tight mb-4 ${skin.text}`}>
                  {heading}
                </h2>

                <p className={`text-sm sm:text-base font-medium leading-relaxed opacity-90 ${skin.text}`}>
                  {section.body}
                </p>

                {section.items ? (
                  <div className="mt-6 space-y-2.5 border-t border-[#191A23]/15 pt-4">
                    {section.items.map((item) => (
                      <div key={item} className="flex items-start gap-2.5">
                        <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${skin.check}`} />
                        <span className={`text-sm font-semibold leading-relaxed ${skin.text} opacity-90`}>
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        {/* Contato — cópia da caixa escura das páginas de vendas */}
        <div className="mt-10 rounded-[45px] border-2 border-[#191A23] bg-[#191A23] p-8 sm:p-12 text-white shadow-[8px_8px_0px_#191A23]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-3">
              <span className="inline-block rounded-lg bg-[#B9FF66] px-3 py-1 text-xs font-black text-[#191A23]">
                Contato
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                {contactTitle}
              </h2>
              <p className="text-sm sm:text-base font-medium text-white/80 max-w-xl leading-relaxed">
                {contactIntro}
              </p>
            </div>
            <a
              href={`mailto:${contactEmail}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-6 py-3 text-sm font-black text-[#191A23] shadow-[2px_2px_0px_#191A23] hover:bg-[#B9FF66]/90 transition-colors whitespace-nowrap"
            >
              <Mail className="h-4 w-4" />
              {contactEmail}
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
