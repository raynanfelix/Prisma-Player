// TODO(dono): trocar pelo e-mail oficial de contato antes da publicação final.
export const contactEmail = "raynanbarbosa803@gmail.com";

export const contactUpdatedAt = "20 de outubro de 2026";

export type ContactSection = { title: string; body: string; items?: string[] };

/**
 * Conteúdo da página /contact (trust anchor exigido pelo relatório Ora -
 * "Is Agentic"): um agente (ou cliente) precisa achar um canal humano real
 * com expectativa clara de resposta. Renderizado pelo LegalPageLayout, o
 * mesmo layout das páginas jurídicas (/privacy, /terms, /cookies).
 */
export const contactSections: ContactSection[] = [
  {
    title: "1. Canal oficial de contato",
    body: `A Prisma Player atende produtores, coprodutores, afiliados e agências de lançamento exclusivamente por e-mail: ${contactEmail}. Escreva em português ou inglês; respondemos dentro de 1 dia útil (normalmente em poucas horas em dias úteis). Para suporte técnico de contas ativas, o canal prioritário é o painel (/dashboard/support), com WhatsApp nos planos Pro e Escala.`,
  },
  {
    title: "2. O que incluir na sua mensagem",
    body: "Para responder rápido de primeira, inclua:",
    items: [
      "Seu nome, e-mail e, se já for cliente, o e-mail da conta cadastrada.",
      "O assunto: dúvida comercial, migração de outro player, integração/embed, bug ou parceria.",
      "Se for um problema técnico: a URL da página onde o player está publicado, o navegador e o horário aproximado do ocorrido.",
      "Volume aproximado de tráfego e VSLs (nos ajuda a recomendar o plano certo).",
    ],
  },
  {
    title: "3. O que NÃO enviar por este canal",
    body: "Não envie senhas, tokens, chaves de API ou dados completos de cartão - a Prisma Player nunca solicita essas informações. Notificações de direitos autorais (DMCA / Marco Civil) e pedidos de titulares de dados (LGPD/GDPR) seguem pelos canais específicos descritos nas políticas abaixo e no e-mail privacidade@prismaplayer.online.",
  },
  {
    title: "4. Documentos e páginas relacionadas",
    body: "Antes de escrever, pode ser que sua dúvida já esteja respondida em:",
    items: [
      "Termos de Uso - /terms (contrato, planos, pagamentos e responsabilidades)",
      "Política de Privacidade - /privacy (dados pessoais, bases legais e direitos)",
      "Política de Cookies - /cookies (cookies, pixels e consentimento)",
      "Recursos para desenvolvedores e agentes - /developers (embed, API e openapi.json)",
    ],
  },
];
