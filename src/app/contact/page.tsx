import type { Metadata } from "next";
import LegalPageLayout from "@/features/landing-page/components/LegalPageLayout";
import { contactEmail, contactSections, contactUpdatedAt } from "@/content/contact";

export const metadata: Metadata = {
  title: "Contato | Prisma Player",
  description:
    "Fale com a equipe da Prisma Player: dúvidas comerciais, migração de player, integração, bugs e parcerias. Tempo de resposta e o que incluir na mensagem.",
  alternates: { canonical: "/contact" },
};

/**
 * Página /contact (item 5 do relatório "Is Agentic" / Ora): âncora de
 * confiança que faltava no site público - um agente (ou cliente) precisa
 * achar um canal humano real com expectativa clara de resposta. Renderizada
 * pelo mesmo layout das páginas jurídicas (/privacy, /terms, /cookies).
 */
export default function ContactPage() {
  return (
    <LegalPageLayout
      tag="Contato & Suporte"
      title="Fale com a Prisma Player"
      intro="Canal oficial para produtores, coprodutores, afiliados e agências: dúvidas comerciais, migração de outro player, integração do embed, bugs e parcerias. Respondemos em até 1 dia útil."
      icon="shield"
      sections={contactSections}
      updatedAt={contactUpdatedAt}
      contactEmail={contactEmail}
      contactTitle="Canal de contato"
      contactIntro="Escreva para o e-mail abaixo com o assunto da sua demanda. Para suporte de contas ativas, o caminho mais rápido é o painel (/dashboard/support), com WhatsApp nos planos Pro e Escala."
    />
  );
}
