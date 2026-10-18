import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import LegalPageLayout from "@/features/landing-page/components/LegalPageLayout";
import { legalContactEmail, legalUpdatedAt, privacySections } from "@/content/legal/prisma-legal";

export const metadata: Metadata = {
  title: "Política de Privacidade | Prisma Player",
  description: "Política de privacidade da Prisma Player alinhada à LGPD, explicando dados coletados, bases legais, direitos e segurança.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      tag="LGPD · GDPR · CCPA"
      title="Política de Privacidade"
      intro="Esta política descreve como a Prisma Player trata dados pessoais de usuários, equipes e visitantes das VSLs publicadas — no Brasil, na Europa e no mundo."
      icon={ShieldCheck}
      sections={privacySections}
      updatedAt={legalUpdatedAt}
      contactEmail={legalContactEmail}
      contactTitle="Canal de privacidade"
      contactIntro="Para exercer seus direitos previstos na LGPD, no GDPR ou na CCPA, envie sua solicitação para o nosso encarregado."
    />
  );
}
