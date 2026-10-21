/**
 * Negociação de conteúdo Markdown para agentes de IA (item 1 do relatório
 * "Is Agentic" / Ora, score 70/100).
 *
 * A decisão é PURA (sem NextRequest, sem I/O) e vive fora do proxy para ser
 * testável isoladamente; src/proxy.ts apenas aplica o resultado. Regras:
 *
 * - SOMENTE GET com `accept` contendo `text/markdown` é negociado. Qualquer
 *   outra requisição (navegador, RSC, prefetch) segue o fluxo HTML byte a
 *   byte - o proxy não muda de comportamento.
 * - Páginas públicas conhecidas → rewrite para `/api/markdown?path=<path>`.
 * - Prefixos sempre passthrough (API, framework, app autenticado, telas de
 *   auth, embed, integrações) e qualquer caminho com extensão (assets,
 *   manifests, llms.txt, sitemap.xml) NUNCA são interceptados.
 * - Qualquer outro caminho sem extensão → rewrite para
 *   `/api/markdown/404?path=<path>` (404 + Markdown), garantindo que uma
 *   rota real nunca receba 404-markdown por acidente.
 */

export type MarkdownNegotiation =
  | { kind: "markdown-page"; path: string }
  | { kind: "markdown-404"; path: string }
  | { kind: "passthrough" };

/**
 * Páginas públicas que possuem versão Markdown (conteúdo em pages.ts).
 * `/cookies` está aqui porque é página pública real (linkada nas políticas) -
 * deixá-la de fora faria o agente receber 404-markdown numa rota que existe.
 */
export const MARKDOWN_PAGE_PATHS = [
  "/",
  "/pricing",
  "/services",
  "/about",
  "/privacy",
  "/terms",
  "/cookies",
  "/contact",
  "/developers",
] as const;

/**
 * Prefixos que NUNCA são interceptados, em nenhuma hipótese: API, bundle do
 * framework, app autenticado (dashboard/admin/studio), telas de auth, embed
 * (token de origem/cookie pp_embed) e integrações (PostHog ingest,
 * player-loader).
 */
const PASSTHROUGH_PREFIXES = [
  "/api",
  "/_next",
  "/dashboard",
  "/admin",
  "/embed",
  "/login",
  "/signup",
  "/welcome",
  "/reset-password",
  "/studio",
  "/auth",
  "/player-loader",
  "/ingest",
] as const;

/** Rotas reais sem extensão que não são páginas (nunca 404-markdown). */
const NON_NAVIGATION_PATHS = ["/opengraph-image"] as const;

/** Prefixos de route handlers (respostas que não são páginas HTML). */
const HANDLER_PREFIXES = ["/api", "/auth", "/player-loader", "/ingest"] as const;

/** Normaliza barras finais (skipTrailingSlashRedirect está ligado no app). */
export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "") || "/";
  }
  return pathname;
}

/** Último segmento contém ponto → arquivo/asset (favicon.ico, sitemap.xml…). */
export function hasFileExtension(pathname: string): boolean {
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  return lastSegment.includes(".");
}

/** O header `accept` pede explicitamente Markdown? */
export function acceptsMarkdown(accept: string | null | undefined): boolean {
  return typeof accept === "string" && accept.toLowerCase().includes("text/markdown");
}

function startsWithAnyPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export interface NegotiateInput {
  method?: string | null;
  accept?: string | null;
  pathname: string;
}

/** Decide o destino de uma requisição quando o cliente pede text/markdown. */
export function negotiateMarkdown(input: NegotiateInput): MarkdownNegotiation {
  const path = normalizePathname(input.pathname);

  if (!acceptsMarkdown(input.accept)) return { kind: "passthrough" };
  if ((input.method ?? "").toUpperCase() !== "GET") return { kind: "passthrough" };
  if (hasFileExtension(path)) return { kind: "passthrough" };
  if ((NON_NAVIGATION_PATHS as readonly string[]).includes(path)) return { kind: "passthrough" };
  if (startsWithAnyPrefix(path, PASSTHROUGH_PREFIXES)) return { kind: "passthrough" };
  if ((MARKDOWN_PAGE_PATHS as readonly string[]).includes(path)) {
    return { kind: "markdown-page", path };
  }
  return { kind: "markdown-404", path };
}

/**
 * Item 1 (Vary): toda resposta de navegação de página ganha `Vary: Accept`
 * APPENDADO ao valor existente (nunca sobrescrever os valores do Next), para
 * caches não servirem HTML a um agente que pediu Markdown - e vice-versa.
 * Assets (com extensão) e respostas de route handlers não entram: a resposta
 * Markdown já sai com `Vary: Accept` do próprio handler.
 */
export function shouldAppendVaryAccept(input: { method?: string | null; pathname: string }): boolean {
  if ((input.method ?? "").toUpperCase() !== "GET") return false;
  const path = normalizePathname(input.pathname);
  if (hasFileExtension(path)) return false;
  if ((NON_NAVIGATION_PATHS as readonly string[]).includes(path)) return false;
  if (startsWithAnyPrefix(path, HANDLER_PREFIXES)) return false;
  return true;
}

/** URL de rewrite para o handler Markdown correspondente. */
export function markdownRouteUrl(kind: "markdown-page" | "markdown-404", path: string): string {
  const endpoint = kind === "markdown-page" ? "/api/markdown" : "/api/markdown/404";
  return `${endpoint}?path=${encodeURIComponent(path)}`;
}
