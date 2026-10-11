import { describe, expect, it } from "vitest";
import { readJsonBody } from "@/lib/api/request";

function jsonRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("https://prisma.test/api/x", { method: "POST", body, headers });
}

describe("readJsonBody", () => {
  it("devolve o corpo quando o JSON é válido", async () => {
    const result = await readJsonBody<{ a: number }>(jsonRequest('{"a":1}'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.a).toBe(1);
  });

  it("rejeita JSON inválido com 400", async () => {
    const result = await readJsonBody(jsonRequest("{nao-e-json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it("rejeita pelo content-length declarado", async () => {
    const result = await readJsonBody(jsonRequest('{"a":1}', { "content-length": "999999" }), 1024);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  // Regressão: confiar só no header deixava passar qualquer cliente que usasse
  // `Transfer-Encoding: chunked`, que não envia content-length.
  it("rejeita pelo tamanho real mesmo sem content-length", async () => {
    const big = JSON.stringify({ a: "x".repeat(5000) });
    const request = new Request("https://prisma.test/api/x", { method: "POST", body: big });
    request.headers.delete("content-length");
    const result = await readJsonBody(request, 1024);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("trata corpo vazio como objeto vazio", async () => {
    const result = await readJsonBody(jsonRequest(""));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body).toEqual({});
  });
});
