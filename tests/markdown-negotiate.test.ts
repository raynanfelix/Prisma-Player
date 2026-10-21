import { describe, expect, it } from "vitest";
import {
  MARKDOWN_PAGE_PATHS,
  acceptsMarkdown,
  hasFileExtension,
  markdownRouteUrl,
  negotiateMarkdown,
  normalizePathname,
  shouldAppendVaryAccept,
} from "@/lib/markdown/negotiate";

/**
 * Item 1 "Is Agentic" (Ora): a decisão de negociação vive num módulo PURO
 * (src/lib/markdown/negotiate.ts) e é testada isoladamente - o proxy apenas
 * aplica o resultado. Regras travadas aqui:
 *
 * - só GET com Accept: text/markdown negocia;
 * - páginas públicas conhecidas → rewrite /api/markdown;
 * - prefixos protegidos e assets NUNCA são interceptados;
 * - caminho desconhecido sem extensão → rewrite /api/markdown/404;
 * - /opengraph-image (rota real sem extensão) nunca vira 404-markdown.
 */

const md = (pathname: string, method = "GET") =>
  negotiateMarkdown({ method, accept: "text/markdown", pathname });

const html = (pathname: string, method = "GET") =>
  negotiateMarkdown({ method, accept: "text/html,application/xhtml+xml", pathname });

describe("normalizePathname", () => {
  it("remove barra final única e múltiplas (skipTrailingSlashRedirect está ligado)", () => {
    expect(normalizePathname("/about/")).toBe("/about");
    expect(normalizePathname("/about///")).toBe("/about");
    expect(normalizePathname("/")).toBe("/");
  });
});

describe("acceptsMarkdown", () => {
  it("reconhece text/markdown exato, em lista e com q-values (case-insensitive)", () => {
    expect(acceptsMarkdown("text/markdown")).toBe(true);
    expect(acceptsMarkdown("text/markdown; q=0.9, text/html")).toBe(true);
    expect(acceptsMarkdown("Text/Markdown")).toBe(true);
  });

  it("rejeita accept de navegador/RSC/ausente", () => {
    expect(acceptsMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe(false);
    expect(acceptsMarkdown("*/*")).toBe(false);
    expect(acceptsMarkdown(null)).toBe(false);
    expect(acceptsMarkdown(undefined)).toBe(false);
  });
});

describe("hasFileExtension", () => {
  it("detecta assets e deixa passarem rotas sem extensão", () => {
    expect(hasFileExtension("/sitemap.xml")).toBe(true);
    expect(hasFileExtension("/llms.txt")).toBe(true);
    expect(hasFileExtension("/logo.png")).toBe(true);
    expect(hasFileExtension("/videoreferencia.mp4")).toBe(true);
    expect(hasFileExtension("/about")).toBe(false);
    expect(hasFileExtension("/pricing")).toBe(false);
  });
});

describe("negotiateMarkdown - páginas conhecidas → /api/markdown", () => {
  it("rewrite de todas as páginas públicas do mapa (inclusive /cookies, rota real)", () => {
    for (const path of MARKDOWN_PAGE_PATHS) {
      expect(md(path)).toEqual({ kind: "markdown-page", path });
    }
  });

  it("normaliza barra final antes de decidir", () => {
    expect(md("/about/")).toEqual({ kind: "markdown-page", path: "/about" });
  });

  it("URL de rewrite carrega o path codificado", () => {
    expect(markdownRouteUrl("markdown-page", "/")).toBe("/api/markdown?path=%2F");
    expect(markdownRouteUrl("markdown-404", "/nao-existe")).toBe("/api/markdown/404?path=%2Fnao-existe");
  });
});

describe("negotiateMarkdown - prefixos SEMPRE passthrough", () => {
  const protectedPaths = [
    "/api/health",
    "/api/markdown?path=/pricing",
    "/_next/static/chunk.js",
    "/dashboard",
    "/dashboard/videos",
    "/admin/users",
    "/embed/aaaaaaaa-0000-4000-8000-000000000001",
    "/embed/ab/teste",
    "/login",
    "/signup",
    "/welcome",
    "/reset-password",
    "/studio",
    "/auth/callback",
    "/player-loader/aaaaaaaa-0000-4000-8000-000000000001",
    "/ingest/static/posthog.js",
  ];

  it("nenhum prefixo protegido é interceptado, mesmo pedindo markdown", () => {
    for (const path of protectedPaths) {
      expect(md(path)).toEqual({ kind: "passthrough" });
    }
  });

  it("prefixo parcial não vaza (ex.: /dashboardX é desconhecido, não protegido)", () => {
    expect(md("/dashboardX")).toEqual({ kind: "markdown-404", path: "/dashboardX" });
  });
});

describe("negotiateMarkdown - assets e rotas reais sem extensão", () => {
  it("caminhos com extensão nunca são interceptados", () => {
    expect(md("/favicon.ico")).toEqual({ kind: "passthrough" });
    expect(md("/robots.txt")).toEqual({ kind: "passthrough" });
    expect(md("/sitemap.xml")).toEqual({ kind: "passthrough" });
    expect(md("/llms.txt")).toEqual({ kind: "passthrough" });
    expect(md("/llms-full.txt")).toEqual({ kind: "passthrough" });
    expect(md("/logo.png")).toEqual({ kind: "passthrough" });
    expect(md("/manifest.webmanifest")).toEqual({ kind: "passthrough" });
  });

  it("/opengraph-image (rota real do Next sem extensão) nunca recebe 404-markdown", () => {
    expect(md("/opengraph-image")).toEqual({ kind: "passthrough" });
  });
});

describe("negotiateMarkdown - caminho desconhecido → /api/markdown/404", () => {
  it("404-markdown apenas para caminhos não conhecidos e sem extensão", () => {
    expect(md("/nao-existe")).toEqual({ kind: "markdown-404", path: "/nao-existe" });
    expect(md("/blog/post")).toEqual({ kind: "markdown-404", path: "/blog/post" });
  });

  it("checkout de página não existe no app: 404-markdown é a resposta correta", () => {
    // /api/billing/checkout é a rota mutante real; /checkout/* não existe.
    expect(md("/checkout")).toEqual({ kind: "markdown-404", path: "/checkout" });
  });
});

describe("negotiateMarkdown - sem negociação", () => {
  it("sem Accept: text/markdown → passthrough byte a byte (HTML)", () => {
    expect(html("/pricing")).toEqual({ kind: "passthrough" });
    expect(html("/nao-existe")).toEqual({ kind: "passthrough" });
  });

  it("métodos não-GET nunca negociam", () => {
    expect(md("/pricing", "POST")).toEqual({ kind: "passthrough" });
    expect(md("/", "HEAD")).toEqual({ kind: "passthrough" });
  });
});

describe("shouldAppendVaryAccept (Vary: Accept appenado, nunca sobrescrito)", () => {
  it("navegação de página em GET recebe Vary", () => {
    expect(shouldAppendVaryAccept({ method: "GET", pathname: "/" })).toBe(true);
    expect(shouldAppendVaryAccept({ method: "GET", pathname: "/pricing" })).toBe(true);
    expect(shouldAppendVaryAccept({ method: "GET", pathname: "/dashboard" })).toBe(true);
    expect(shouldAppendVaryAccept({ method: "GET", pathname: "/about/" })).toBe(true);
  });

  it("assets, handlers e não-GET não recebem", () => {
    expect(shouldAppendVaryAccept({ method: "GET", pathname: "/logo.png" })).toBe(false);
    expect(shouldAppendVaryAccept({ method: "GET", pathname: "/sitemap.xml" })).toBe(false);
    expect(shouldAppendVaryAccept({ method: "GET", pathname: "/opengraph-image" })).toBe(false);
    expect(shouldAppendVaryAccept({ method: "GET", pathname: "/api/health" })).toBe(false);
    expect(shouldAppendVaryAccept({ method: "GET", pathname: "/auth/callback" })).toBe(false);
    expect(shouldAppendVaryAccept({ method: "GET", pathname: "/ingest/e" })).toBe(false);
    expect(shouldAppendVaryAccept({ method: "POST", pathname: "/pricing" })).toBe(false);
    expect(shouldAppendVaryAccept({ method: "HEAD", pathname: "/pricing" })).toBe(false);
  });
});
