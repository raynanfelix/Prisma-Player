import { describe, expect, it } from "vitest";
import { GET as getMarkdown } from "@/app/api/markdown/route";
import { GET as getMarkdown404 } from "@/app/api/markdown/404/route";
import { GET as getLlmsTxt } from "@/app/llms.txt/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { MARKDOWN_PAGES } from "@/lib/markdown/pages";

/**
 * Itens 2, 3 e 4 "Is Agentic" (Ora): handlers /api/markdown (200) e
 * /api/markdown/404 (404), llms.txt com "When to use" e /api/openapi.json
 * JSON válido. Handlers são stateless (sem banco/segredos) - chamados
 * diretamente como os demais testes de rota do repo.
 */

const ORIGIN = "http://localhost:3000";

function get(url: string): Request {
  return new Request(url, { method: "GET" });
}

describe("GET /api/markdown", () => {
  it("devolve a página pública em Markdown com headers do contrato", async () => {
    const response = await getMarkdown(get(`${ORIGIN}/api/markdown?path=/pricing`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("vary")).toBe("Accept");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");

    const body = await response.text();
    expect(body).toContain("# Planos e Preços");
    expect(body.length).toBeGreaterThan(20);
  });

  it("todas as páginas conhecidas respondem 200 com corpo não vazio", async () => {
    for (const path of Object.keys(MARKDOWN_PAGES)) {
      const response = await getMarkdown(get(`${ORIGIN}/api/markdown?path=${encodeURIComponent(path)}`));
      expect(response.status, `página ${path}`).toBe(200);
      const body = await response.text();
      expect(body.length, `página ${path}`).toBeGreaterThan(20);
    }
  });

  it("raiz sem ?path devolve a home em Markdown", async () => {
    const response = await getMarkdown(get(`${ORIGIN}/api/markdown`));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("# Prisma Player");
  });

  it("path desconhecido → 404 em Markdown (mesmo contrato do /api/markdown/404)", async () => {
    const response = await getMarkdown(get(`${ORIGIN}/api/markdown?path=/nao-existe`));
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    const body = await response.text();
    expect(body).toContain("/nao-existe");
    expect(body).toContain("/llms.txt");
    expect(body).toContain("/sitemap.xml");
    expect(body).toContain("(/)");
  });

  it("conteúdo sem segredos nem dados de usuário", async () => {
    for (const content of Object.values(MARKDOWN_PAGES)) {
      expect(content).not.toMatch(/sk_live|pk_live|DATABASE_URL|secret/i);
    }
  });
});

describe("GET /api/markdown/404", () => {
  it("sempre 404 + text/markdown + corpo ≥20 chars + links de descoberta", async () => {
    const response = await getMarkdown404(get(`${ORIGIN}/api/markdown/404?path=/blog/post`));
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("vary")).toBe("Accept");

    const body = await response.text();
    expect(body.length).toBeGreaterThanOrEqual(20);
    expect(body).toContain("não corresponde a nenhuma página");
    expect(body).toContain("(/)");
    expect(body).toContain("(/llms.txt)");
    expect(body).toContain("(/sitemap.xml)");
  });
});

describe("GET /llms.txt", () => {
  it("200 text/plain com seção When to use e os links exigidos pelo Ora", async () => {
    const response = await getLlmsTxt();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");

    const body = await response.text();
    expect(body).toContain("# Prisma Player");
    expect(body).toContain("## When to use this");
    expect(body).toContain("## When NOT to use");
    for (const link of ["/pricing", "/developers", "/api/openapi.json", "/about", "/contact", "/privacy", "/terms", "/sitemap.xml"]) {
      expect(body, `link ${link}`).toContain(link);
    }
  });
});

describe("GET /api/openapi.json", () => {
  it("200 + JSON válido + OpenAPI 3.1 honesto (paths ≥5)", async () => {
    const response = await getOpenApi();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const document = JSON.parse(await response.text()) as {
      openapi: string;
      info: { title: string };
      servers: Array<{ url: string }>;
      paths: Record<string, unknown>;
    };
    expect(document.openapi).toMatch(/^3\.1\./);
    expect(document.info.title).toContain("Prisma Player");
    expect(document.servers[0]?.url).toContain("prisma-player.vercel.app");
    expect(Object.keys(document.paths).length).toBeGreaterThanOrEqual(5);
    for (const path of [
      "/api/health",
      "/api/embed/{id}",
      "/api/embed/{id}/manifest",
      "/api/embed/{id}/session",
      "/api/ab-events",
      "/llms.txt",
      "/api/markdown",
    ]) {
      expect(document.paths, `path ${path}`).toHaveProperty(path);
    }
  });

  it("declara 401 na nota das APIs autenticadas (honestidade Ora)", async () => {
    const document = JSON.parse(await (await getOpenApi()).text()) as { "x-note": string };
    expect(document["x-note"]).toContain("401");
  });
});
