import { describe, expect, it } from "vitest";
import { DELETE, GET, PATCH, POST, PUT } from "@/app/api/[...slug]/route";

/**
 * Item 1 da spec Agentic v2: /api/* desconhecido responde 404 em JSON (no
 * store) em vez do HTML padrão do Next. Handlers são stateless (sem banco,
 * sem segredos) e são chamados diretamente como os demais testes de rota do
 * repo. A precedência do Next (estáticas e dinâmicas antes do catch-all)
 * garante que nenhum endpoint real é sombreado.
 */

// Handlers não consomem o Request: a resposta é determinística para qualquer
// caminho ou método, então os testes chamam direto (padrão dos handlers
// stateless do repo, como /llms.txt).

describe("catch-all /api/* desconhecido", () => {
  it("GET devolve 404 JSON no corpo do contrato Error com no-store", async () => {
    const response = GET();
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as { error: string; message: string; hint: string };
    expect(body.error).toBe("not_found");
    expect(body.message).toBeTruthy();
    expect(body.hint).toContain("/api/openapi.json");
  });

  it("POST devolve o mesmo 404 JSON", async () => {
    const response = POST();
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  it("qualquer outro método de escrita também cai no 404 JSON", async () => {
    for (const handler of [PUT, PATCH, DELETE]) {
      const response = handler();
      expect(response.status).toBe(404);
      expect(await response.text()).toContain("not_found");
    }
  });

  it("caminhos profundos também respondem 404 JSON", async () => {
    const response = GET();
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });
});
