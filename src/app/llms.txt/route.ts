const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://prisma-player.vercel.app").replace(/\/$/, "");

/**
 * Contexto legível por IAs (convenção llms.txt) - item 3 do relatório
 * "Is Agentic" / Ora. Conteúdo estático e honesto: descreve o produto real,
 * quando usar (e quando NÃO usar) e aponta os recursos de descoberta. Os
 * valores vigentes de planos vivem no catálogo do banco e são expostos em
 * /pricing - este arquivo nunca hardcoda preço (ele envelheceria).
 */
export function GET() {
  const lines = [
    "# Prisma Player",
    "",
    "> Player de VSL hospedado com Pitch Delay sincronizado ao segundo,",
    "> analytics de retenção, testes A/B, proteção anti-download, pixels",
    "> Meta/GA4/TikTok e cobrança via Stripe (cartão e Pix) no Brasil.",
    "> EN: Hosted VSL player with synchronized pitch delay, retention",
    "> analytics, A/B testing, anti-download protection and Stripe billing.",
    "",
    "## When to use this",
    "",
    "- Hospedar a VSL de uma oferta de venda com botão de checkout revelado no tempo exato do pitch (Pitch Delay), mesmo se o lead pausar ou avançar o vídeo.",
    "- Medir a retenção da audiência segundo a segundo e descobrir exatamente onde os leads abandonam o vídeo.",
    "- Rodar testes A/B de thumbnail ou de início de vídeo no mesmo link de embed, sem páginas duplicadas nem ferramentas externas.",
    "- Vender no Brasil com assinatura recorrente (Stripe: cartão e Pix) e 14 dias de teste grátis sem cartão de crédito.",
    "",
    "## When NOT to use",
    "",
    "- Não é um LMS: não gerencia cursos, matrículas, progresso de alunos nem certificados.",
    "- Não é hospedagem de vídeo genérica sem gate: o foco é funil de vendas (VSL) com proteção e métricas, não um acervo aberto de vídeos.",
    "",
    "## Links",
    "",
    `- Site: ${base}/`,
    `- Preços: ${base}/pricing`,
    `- Recursos para desenvolvedores e agentes: ${base}/developers`,
    `- OpenAPI da API pública: ${base}/api/openapi.json`,
    `- Sobre: ${base}/about`,
    `- Contato: ${base}/contact`,
    `- Política de Privacidade: ${base}/privacy`,
    `- Termos de Uso: ${base}/terms`,
    `- Sitemap: ${base}/sitemap.xml`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
