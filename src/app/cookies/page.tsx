import type { Metadata } from "next";
import LegalPageLayout from "@/features/landing-page/components/LegalPageLayout";
import { cookieSections, legalContactEmail, legalUpdatedAt } from "@/content/legal/prisma-legal";

export const metadata: Metadata = {
  title: "Política de Cookies | Prisma Player",
  description: "Quais cookies e tecnologias similares a Prisma Player usa, por que usa e como você pode gerenciá-los (analytics, marketing e essenciais).",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return (
    <LegalPageLayout
      tag="Privacidade"
      title="Política de Cookies"
      intro="Transparência total sobre os cookies do site e dos players: o que usamos, por que usamos e como você controla tudo."
      icon="cookie"
      sections={cookieSections}
      updatedAt={legalUpdatedAt}
      contactEmail={legalContactEmail}
      contactTitle="Dúvidas sobre cookies"
      contactIntro="Qualquer questão sobre cookies, consentimento ou rastreamento, fale com a gente."
    />
  );
}
