import "server-only";

/**
 * Porta anti-script (C1 do audit de segurança): regex mínima de navegador
 * real. Um cliente HTTP (curl, wget, python-requests) não carrega a
 * assinatura "Mozilla/5.x" nem o token de engine (Chrome/Safari/Firefox/Edg)
 * no User-Agent; quem forja só o "Mozilla/5.0" sem engine também cai.
 *
 * Limitação honesta: isto eleva o custo do script preguiçoso, não é DRM.
 * A barreira vive no mint do session token e na porta da mídia (stream),
 * junto com rate limit por IP e prova de render (cookie pp_embed).
 */
const REAL_BROWSER_UA = /^mozilla\/5\.\d+.*\b(?:chrome|safari|firefox|edg)\//i;

/** true quando o User-Agent tem a forma de um navegador real. */
export function isRealBrowserUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return REAL_BROWSER_UA.test(userAgent);
}
