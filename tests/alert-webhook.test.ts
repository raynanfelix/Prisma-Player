import { afterEach, describe, expect, it, vi } from "vitest";

import { alertOperations } from "@/lib/security/alert-webhook";

/**
 * Item 5 do hardening: alerta operacional fire-and-forget para o canal
 * privado do dono (ALERT_WEBHOOK_URL). O contrato travado aqui: inerte sem
 * env, só HTTPS, REDACT de segredo no texto e erro que NUNCA sobe.
 */

const WEBHOOK = "https://discord.com/api/webhooks/123/abc";

/** Chamada capturada do fetch: [url, init] - o mesmo modelo do pixel-verify. */
function callOf(mock: ReturnType<typeof vi.fn>, index: number): [string, RequestInit] {
  return mock.mock.calls[index] as [string, RequestInit];
}

function lastBody(fetchMock: ReturnType<typeof vi.fn>): { content: string } {
  return JSON.parse(callOf(fetchMock, 0)[1].body as string) as { content: string };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ALERT_WEBHOOK_URL;
});

describe("alertOperations", () => {
  it("ALERT_WEBHOOK_URL configurada → POST { content } com título, detalhe e kind", async () => {
    process.env.ALERT_WEBHOOK_URL = WEBHOOK;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await alertOperations({ title: "Webhook do Stripe falhou", detail: "Evento charge.dispute.created (evt_1)", kind: "stripe_risk:charge.dispute.created" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = callOf(fetchMock, 0);
    expect(url).toBe(WEBHOOK);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = lastBody(fetchMock);
    expect(body.content).toContain("🚨 [Prisma] Webhook do Stripe falhou - Evento charge.dispute.created (evt_1)");
    expect(body.content).toContain("(stripe_risk:charge.dispute.created)");
  });

  it("sem ALERT_WEBHOOK_URL → inerte: nenhuma chamada, nenhum erro", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(alertOperations({ title: "x", detail: "y" })).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("URL que não é HTTPS → inerte (http:// não é destino válido)", async () => {
    process.env.ALERT_WEBHOOK_URL = "http://localhost:9999/hook";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await alertOperations({ title: "x", detail: "y" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("REDACT: token/segredo no texto sai mascarado - valor cru nunca é postado", async () => {
    process.env.ALERT_WEBHOOK_URL = WEBHOOK;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const metaToken = `EAAW${"z".repeat(30)}`;

    await alertOperations({ title: "Motivo real", detail: `falhou com token ${metaToken} e Bearer abc123def456 no reason` });

    const body = lastBody(fetchMock);
    expect(body.content).not.toContain(metaToken);
    expect(body.content).not.toContain("abc123def456");
    expect(body.content).toContain("[redacted]");
  });

  it("falha de rede/timeout do fetch → NUNCA sobe erro para a rota", async () => {
    process.env.ALERT_WEBHOOK_URL = WEBHOOK;
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));

    await expect(alertOperations({ title: "x", detail: "y" })).resolves.toBeUndefined();
  });

  it("texto gigante é cortado no teto por campo (title/detail/kind ≤ 300)", async () => {
    process.env.ALERT_WEBHOOK_URL = WEBHOOK;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await alertOperations({ title: "t".repeat(500), detail: "d".repeat(500), kind: "k".repeat(500) });

    const body = lastBody(fetchMock);
    // "🚨 [Prisma] " + title(≤300) + " - " + detail(≤300) + " (" + kind(≤300) + ")"
    expect(body.content.length).toBeLessThanOrEqual(13 + 300 + 3 + 300 + 2 + 300 + 1);
  });
});
