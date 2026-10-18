import type { Metadata } from "next";
import { Scale } from "lucide-react";
import LegalPageLayout from "@/features/landing-page/components/LegalPageLayout";
import { legalContactEmail, legalUpdatedAt, termsSections } from "@/content/legal/prisma-legal";

export const metadata: Metadata = {
  title: "Termos de Uso | Prisma Player",
  description: "Termos de uso da Prisma Player para contas, planos, vídeos, métricas, IA, limites operacionais e responsabilidades.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPageLayout
      tag="Legal"
      title="Termos de Uso"
      intro="Estes termos explicam as regras para usar a Prisma Player de forma segura, profissional e transparente — inclusive quando o produto é vendido globalmente."
      icon={Scale}
      sections={termsSections}
      updatedAt={legalUpdatedAt}
      contactEmail={legalContactEmail}
      contactTitle="Fale com a Prisma Player"
      contactIntro="Para dúvidas sobre estes Termos, notificações de direitos autorais ou questões contratuais, fale com a gente."
    />
  );
}
