import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, randomUUID, sign as cryptoSign } from "node:crypto";

/**
 * Webhook do Neon Auth: gera um par Ed25519 de teste, expõe a pública num JWKS
 * mockado (fetcher injetado) e assina os payloads exatamente como a Neon —
 * JWS detached com dupla base64url amarrando o timestamp:
 *
 *   signingInput = headerB64 + "." + base64url(`${timestamp}.${base64url(rawBody)}`)
 *
 * Spec: https://neon.com/docs/auth/guides/webhooks.md
 */

const { afterState } = vi.hoisted(() => ({
  /** Tarefas passadas ao after() do Next — executadas manualmente no teste. */
  afterState: { tasks: [] as Array<() => unknown> },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/access/bootstrap", () => ({
  ensureAccountBootstrap: vi.fn(async () => undefined),
}));

// O `after` real exige request scope do Next (fora dele, lança). Nos testes a
// tarefa é capturada e executada na mão para travar o contrato pós-resposta.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: () => unknown) => {
      afterState.tasks.push(task);
    },
  };
});

import { resetNeonWebhookStateForTests, verifyNeonAuthWebhook } from "@/lib/security/neon-webhook";
import { ensureAccountBootstrap } from "@/lib/access/bootstrap";
import { POST } from "@/app/api/webhooks/neon-auth/route";

const KID = "test-kid-0001";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const exportedJwk = publicKey.export({ format: "jwk" }) as { kty: string; crv: string; x: string };
const testJwk = { kid: KID, ...exportedJwk, kty: "OKP", crv: "Ed25519", x: exportedJwk.x };

const ORIGINAL_BASE_URL = process.env.NEON_AUTH_BASE_URL;

function userCreatedBody(eventId: string): string {
  return JSON.stringify({
    event_id: eventId,
    event_type: "user.created",
    timestamp: new Date().toISOString(),
    context: { endpoint_id: "ep-test", project_name: "Prisma Player" },
    user: {
      id: "user-webhook-1",
      email: "novo@exemplo.com",
      name: "Nova Pessoa",
      email_verified: false,
      created_at: new Date().toISOString(),
    },
    event_data: { auth_provider: "credential", ip_address: "203.0.113.9", user_agent: "vitest" },
  });
}

/** Assina como a Neon assina: mesma construção dupla base64url do JWS detached. */
function signWebhook(options: { body: string; timestampMs?: number; kid?: string }): { signature: string; timestamp: string } {
  const timestamp = String(options.timestampMs ?? Date.now());
  const headerB64 = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: options.kid ?? KID })).toString("base64url");
  const payloadB64 = Buffer.from(options.body, "utf8").toString("base64url");
  const signaturePayload = `${timestamp}.${payloadB64}`;
  const signaturePayloadB64 = Buffer.from(signaturePayload, "utf8").toString("base64url");
  const signingInput = `${headerB64}.${signaturePayloadB64}`;
  const signatureB64 = cryptoSign(null, Buffer.from(signingInput, "utf8"), privateKey).toString("base64url");
  return { signature: `${headerB64}..${signatureB64}`, timestamp };
}

function webhookHeaders(
  signed: { signature: string; timestamp: string },
  options: { eventType?: string; eventId?: string; kid?: string } = {},
): Headers {
  return new Headers({
    "content-type": "application/json",
    "x-neon-signature": signed.signature,
    "x-neon-signature-kid": options.kid ?? KID,
    "x-neon-timestamp": signed.timestamp,
    "x-neon-event-type": options.eventType ?? "user.created",
    "x-neon-event-id": options.eventId ?? `evt-${randomUUID()}`,
    "x-neon-delivery-attempt": "1",
  });
}

function jwksResponse(keys: unknown[]): Response {
  return new Response(JSON.stringify({ keys }), { status: 200, headers: { "content-type": "application/json" } });
}

function makeFetcher(keys: unknown[]): { fetcher: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return jwksResponse(keys);
  }) as typeof fetch;
  return { fetcher, calls };
}

function webhookRequest(body: string, headers: Headers): Request {
  return new Request("https://prisma-player.vercel.app/api/webhooks/neon-auth", { method: "POST", headers, body });
}

async function runAfterTasks(): Promise<void> {
  await Promise.all(afterState.tasks.map((task) => task()));
}

beforeAll(() => {
  process.env.NEON_AUTH_BASE_URL = "https://ep-test.neonauth.us-east-1.aws.neon.tech/neondb/auth";
});

afterAll(() => {
  if (ORIGINAL_BASE_URL) process.env.NEON_AUTH_BASE_URL = ORIGINAL_BASE_URL;
  else delete process.env.NEON_AUTH_BASE_URL;
});

beforeEach(() => {
  resetNeonWebhookStateForTests();
  afterState.tasks.length = 0;
  vi.clearAllMocks();
  // A rota usa o fetch default (globalThis.fetch) — stub devolve o JWKS de teste.
  vi.stubGlobal("fetch", (async () => jwksResponse([testJwk])) as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyNeonAuthWebhook — verificação cripto", () => {
  it("(a) assinatura válida devolve o evento parseado", async () => {
    const body = userCreatedBody("evt-a");
    const signed = signWebhook({ body });
    const { fetcher, calls } = makeFetcher([testJwk]);

    const event = await verifyNeonAuthWebhook(body, webhookHeaders(signed, { eventId: "evt-a" }), fetcher);

    expect(event).not.toBeNull();
    expect(event?.eventId).toBe("evt-a");
    expect(event?.eventType).toBe("user.created");
    // envelope oficial: user com email_verified → normalizado para emailVerified
    expect(event?.user).toEqual({ id: "user-webhook-1", email: "novo@exemplo.com", name: "Nova Pessoa", emailVerified: false });
    expect(event?.eventData).toMatchObject({ auth_provider: "credential", ip_address: "203.0.113.9" });
    expect(calls[0]).toContain("/.well-known/jwks.json");
  });

  it("reentrega do mesmo event id devolve evento VÁLIDO com duplicate=true (idempotência)", async () => {
    const body = userCreatedBody("evt-dup");
    const signed = signWebhook({ body });
    const { fetcher } = makeFetcher([testJwk]);
    const headers = webhookHeaders(signed, { eventId: "evt-dup" });

    const first = await verifyNeonAuthWebhook(body, headers, fetcher);
    const replay = await verifyNeonAuthWebhook(body, headers, fetcher);

    expect(first?.duplicate).toBe(false);
    // Duplicado não é "inválido": null só para assinatura/timestamp/kid ruins.
    expect(replay).not.toBeNull();
    expect(replay?.duplicate).toBe(true);
    expect(replay?.eventId).toBe("evt-dup");
  });

  it("JWKS fica cacheado por kid: segunda chamada não refaz fetch", async () => {
    const body = userCreatedBody("evt-cache");
    const { fetcher, calls } = makeFetcher([testJwk]);

    await verifyNeonAuthWebhook(body, webhookHeaders(signWebhook({ body }), { eventId: "evt-cache" }), fetcher);
    await verifyNeonAuthWebhook(userCreatedBody("evt-cache-2"), webhookHeaders(signWebhook({ body: userCreatedBody("evt-cache-2") }), { eventId: "evt-cache-2" }), fetcher);

    expect(calls).toHaveLength(1);
  });

  it("(b) assinatura adulterada → null (corpo trocado e bytes corrompidos)", async () => {
    const { fetcher } = makeFetcher([testJwk]);
    const signedForOther = signWebhook({ body: userCreatedBody("evt-b-original") });
    const swapped = await verifyNeonAuthWebhook(
      userCreatedBody("evt-b-outro"),
      webhookHeaders(signedForOther, { eventId: "evt-b" }),
      fetcher,
    );
    expect(swapped).toBeNull();

    const signed = signWebhook({ body: userCreatedBody("evt-b") });
    const corrupted = `${signed.signature.slice(0, -3)}AAA`;
    const corruptedEvent = await verifyNeonAuthWebhook(
      userCreatedBody("evt-b"),
      webhookHeaders({ ...signed, signature: corrupted }, { eventId: "evt-b" }),
      fetcher,
    );
    expect(corruptedEvent).toBeNull();
  });

  it("(c) timestamp com mais de 5 minutos → null (replay)", async () => {
    const body = userCreatedBody("evt-c");
    const stale = signWebhook({ body, timestampMs: Date.now() - 6 * 60_000 });
    const { fetcher } = makeFetcher([testJwk]);

    const event = await verifyNeonAuthWebhook(body, webhookHeaders(stale, { eventId: "evt-c" }), fetcher);

    expect(event).toBeNull();
  });

  it("(d) kid desconhecido no JWKS → null (fail-closed)", async () => {
    const body = userCreatedBody("evt-d");
    const signed = signWebhook({ body, kid: "kid-fantasma" });
    const { fetcher, calls } = makeFetcher([testJwk]);

    const event = await verifyNeonAuthWebhook(body, webhookHeaders(signed, { eventId: "evt-d", kid: "kid-fantasma" }), fetcher);

    expect(event).toBeNull();
    expect(calls).toHaveLength(1); // refresh on unknown kid aconteceu e não achou
  });

  it("falha de rede no JWKS → null (fail-closed, sem throw)", async () => {
    const body = userCreatedBody("evt-net");
    const failing = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const event = await verifyNeonAuthWebhook(body, webhookHeaders(signWebhook({ body }), { eventId: "evt-net" }), failing);

    expect(event).toBeNull();
  });

  it("NEON_AUTH_BASE_URL ausente → null (fail-closed)", async () => {
    const saved = process.env.NEON_AUTH_BASE_URL;
    delete process.env.NEON_AUTH_BASE_URL;
    const body = userCreatedBody("evt-env");
    const { fetcher } = makeFetcher([testJwk]);

    const event = await verifyNeonAuthWebhook(body, webhookHeaders(signWebhook({ body }), { eventId: "evt-env" }), fetcher);

    expect(event).toBeNull();
    process.env.NEON_AUTH_BASE_URL = saved;
  });
});

describe("POST /api/webhooks/neon-auth — rota", () => {
  it("(e) user.created válido → 200 imediato e bootstrap 1x via after()", async () => {
    const body = userCreatedBody("evt-route-e");
    const signed = signWebhook({ body });

    const response = await POST(webhookRequest(body, webhookHeaders(signed, { eventId: "evt-route-e" })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    // 200 sai ANTES do processamento (contrato non-blocking da spec Neon).
    expect(vi.mocked(ensureAccountBootstrap)).not.toHaveBeenCalled();
    expect(afterState.tasks).toHaveLength(1);

    await runAfterTasks();
    expect(vi.mocked(ensureAccountBootstrap)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ensureAccountBootstrap)).toHaveBeenCalledWith({
      id: "user-webhook-1",
      email: "novo@exemplo.com",
      name: "Nova Pessoa",
    });
  });

  it("(f) reentrega com o mesmo event_id → MESMA resposta 200, bootstrap 1x no total", async () => {
    const body = userCreatedBody("evt-route-f");
    const signed = signWebhook({ body });

    const first = await POST(webhookRequest(body, webhookHeaders(signed, { eventId: "evt-route-f" })));
    expect(first.status).toBe(200);

    // Spec Neon (Idempotency): duplicados recebem a mesma resposta — 4xx
    // numa reentrega legítima (resposta perdida) viraria falha de delivery.
    const replay = await POST(webhookRequest(body, webhookHeaders(signed, { eventId: "evt-route-f" })));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ ok: true });
    // O replay não agenda uma segunda tarefa de bootstrap.
    expect(afterState.tasks).toHaveLength(1);

    await runAfterTasks();
    expect(vi.mocked(ensureAccountBootstrap)).toHaveBeenCalledTimes(1);
  });

  it("(g) eventType não subscrito → 200 no-op sem bootstrap", async () => {
    const body = userCreatedBody("evt-route-g");
    const signed = signWebhook({ body });

    const response = await POST(webhookRequest(body, webhookHeaders(signed, { eventId: "evt-route-g", eventType: "phone_number.verified" })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(afterState.tasks).toHaveLength(0);
    await runAfterTasks();
    expect(vi.mocked(ensureAccountBootstrap)).not.toHaveBeenCalled();
  });

  it("(h) sem headers de assinatura → 401, nada processado", async () => {
    const response = await POST(
      new Request("https://prisma-player.vercel.app/api/webhooks/neon-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: userCreatedBody("evt-route-h"),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_webhook" });
    expect(afterState.tasks).toHaveLength(0);
  });
});
