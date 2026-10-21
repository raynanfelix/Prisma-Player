import "server-only";

/**
 * Origens próprias da plataforma derivadas do ambiente. Calculadas uma vez e
 * nunca mutadas.
 *
 * A versão anterior fazia `cache.add(origemDaRequisicao)` a cada chamada, ou
 * seja, guardava estado de requisição num Set de módulo. Em serverless, com a
 * instância reaproveitada, o conjunto crescia com todo host que já tinha
 * respondido (incluindo previews) e virava um vazamento lento de memória.
 *
 * Fonte única usada por csrf.ts (validação de mutações) e embed-origin.ts
 * (isenção de Origin/Referer self - nunca como autoridade de domínio de embed).
 */
export function buildConfiguredSelfOrigins(): ReadonlySet<string> {
  const origins = new Set<string>();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (siteUrl) {
    try { origins.add(new URL(siteUrl).origin); } catch {}
  }
  if (process.env.VERCEL_URL) {
    try { origins.add(new URL(`https://${process.env.VERCEL_URL}`).origin); } catch {}
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    try { origins.add(new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`).origin); } catch {}
  }
  if (process.env.NODE_ENV !== "production") origins.add("http://localhost:3000");
  return origins;
}
