import { describe, expect, it } from "vitest";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { GET as getHealth } from "@/app/api/health/route";
import { API_VERSION } from "@/lib/api/version";

/**
 * Testes da OpenAPI pública (item 3 e 4 "Is Agentic" / Ora): /api/openapi.json
 * JSON válido, versão por data, Error schema, política de versão.
 * Handlers são stateless (sem banco/segredos) - chamados
 * diretamente como os demais testes de rota do repo.
 */

const ORIGIN = "http://localhost:3000";

function get(url: string): Request {
  return new Request(url, { method: "GET" });
}

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
    expect(document.servers[0]?.url).toContain("app.prismaplayer.online");
    expect(Object.keys(document.paths).length).toBeGreaterThanOrEqual(5);
    for (const path of [
      "/api/health",
      "/api/embed/{id}",
      "/api/embed/{id}/manifest",
      "/api/embed/{id}/session",
      "/api/ab-events",
    ]) {
      expect(document.paths, `path ${path}`).toHaveProperty(path);
    }
  });

  it("declara 401 na nota das APIs autenticadas (honestidade Ora)", async () => {
    const document = JSON.parse(await (await getOpenApi()).text()) as { "x-note": string };
    expect(document["x-note"]).toContain("401");
  });
});

describe("OpenAPI: versão por data, Error schema e política (spec Agentic v2, item 3)", () => {
  const document = async () =>
    JSON.parse(await (await getOpenApi()).text()) as {
      info: { version: string; description: string };
      components: {
        schemas: {
          Error: {
            type: string;
            properties: Record<string, { type: string }>;
            required: string[];
            examples: Array<Record<string, string>>;
          };
        };
      };
      paths: Record<string, { get?: { responses?: Record<string, unknown> }; post?: { responses?: Record<string, unknown> } }>;
    };

  it("info.version é a data da API e casa com o header X-API-Version", async () => {
    const response = await getOpenApi();
    const doc = await document();
    expect(doc.info.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(doc.info.version).toBe(API_VERSION);
    expect(response.headers.get("x-api-version")).toBe(API_VERSION);
  });

  it("descrição carrega a política de versão (X-API-Version, Sunset 90 dias, sem /v1 no path, changelog no marketing)", async () => {
    const doc = await document();
    expect(doc.info.description).toContain("X-API-Version");
    expect(doc.info.description).toContain("Sunset");
    expect(doc.info.description).toContain("90 dias");
    expect(doc.info.description).toContain("prismaplayer.online");
    expect(doc.info.description).toContain("/v1");
  });

  it("components.schemas.Error existe com código obrigatório e exemplo completo", async () => {
    const doc = await document();
    const errorSchema = doc.components.schemas.Error;
    expect(errorSchema.type).toBe("object");
    expect(errorSchema.properties.error.type).toBe("string");
    expect(errorSchema.properties.message.type).toBe("string");
    expect(errorSchema.properties.hint.type).toBe("string");
    expect(errorSchema.required).toEqual(["error"]);
    expect(errorSchema.examples[0]?.error).toBe("not_found");
    expect(errorSchema.examples[0]?.hint).toContain("/api/openapi.json");
  });

  it("erros reais de embed, session e ab-events referenciam o schema Error", async () => {
    const doc = await document();
    const assertRef = (response: unknown, status: string) => {
      const typed = response as { content?: { "application/json"?: { schema?: { $ref?: string } } } };
      expect(typed.content?.["application/json"]?.schema?.$ref, `status ${status}`).toBe("#/components/schemas/Error");
    };
    for (const status of ["401", "402", "403", "404"]) {
      assertRef(doc.paths["/api/embed/{id}"]?.get?.responses?.[status], `embed ${status}`);
      assertRef(doc.paths["/api/embed/{id}/manifest"]?.get?.responses?.[status], `manifest ${status}`);
    }
    assertRef(doc.paths["/api/embed/{id}/session"]?.post?.responses?.["403"], "session 403");
    for (const status of ["400", "403", "404", "409", "429", "500"]) {
      assertRef(doc.paths["/api/ab-events"]?.post?.responses?.[status], `ab-events ${status}`);
    }
  });

  it("descrição declara o contrato 429 (RateLimit-Reset e Retry-After)", async () => {
    const doc = await document();
    expect(doc.info.description).toContain("RateLimit-Reset");
    expect(doc.info.description).toContain("Retry-After");
  });
});

describe("X-API-Version nas respostas públicas baratas (spec Agentic v2, item 3)", () => {
  it("health carrega o header da versão", async () => {
    const health = await getHealth();
    expect(health.headers.get("x-api-version")).toBe(API_VERSION);
  });
});