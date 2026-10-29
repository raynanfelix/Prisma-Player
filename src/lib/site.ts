/**
 * URLs dos dois domínios do produto (arquitetura de 2 repos):
 * - prismaplayer.online (repo da landing): site de marketing/vendas
 * - app.prismaplayer.online (ESTE repo): aplicação/dashboard/API
 *
 * A URL de marketing é env-overridable para previews/testes; o fallback é o
 * domínio de produção.
 */
export const MARKETING_URL = (
  process.env.NEXT_PUBLIC_MARKETING_URL || "https://prismaplayer.online"
).replace(/\/$/, "");
