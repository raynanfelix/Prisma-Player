import { beforeAll, describe, expect, it } from "vitest";

const VIDEO = "33333333-3333-4333-8333-333333333333";
const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_SESSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let mod: typeof import("@/lib/security/embed-origin");

beforeAll(async () => {
  process.env.EMBED_ORIGIN_SECRET = "segredo-de-teste-analytics";
  mod = await import("@/lib/security/embed-origin");
});

function headersWith(...pairs: Array<[string, string]>) {
  const init: Record<string, string> = {};
  for (const [name, value] of pairs) init[name] = value;
  return new Headers(init) as unknown as Pick<Headers, "get">;
}

/**
 * Cobre os helpers puros que sustentam o gate de efeitos laterais do
 * /api/analytics-events (RM-03). O handler em si depende de Supabase/`after()`
 * e não é alvo de teste unitário aqui; as regras de vínculo (sessão + host +
 * nonce + host do Origin) são as mesmas funções puras validadas abaixo.
 */
describe("analytics event-token binding (RM-03)", () => {
  it("binds the event to the session that issued the token", () => {
    const token = mod.createBoundEmbedEventToken({ videoId: VIDEO, host: "cliente.com.br", sessionId: SESSION });
    expect(mod.verifyEmbedEventTokenContext(token, { videoId: VIDEO, sessionId: SESSION })).not.toBeNull();
    // Forged play/conversion with a different sessionId is rejected at the gate.
    expect(mod.verifyEmbedEventTokenContext(token, { videoId: VIDEO, sessionId: OTHER_SESSION })).toBeNull();
  });

  it("binds the event to the embed host used for allowed_domains", () => {
    const token = mod.createBoundEmbedEventToken({ videoId: VIDEO, host: "cliente.com.br", sessionId: SESSION });
    expect(mod.verifyEmbedEventTokenContext(token, { videoId: VIDEO, sessionId: SESSION, host: "cliente.com.br" })).not.toBeNull();
    expect(mod.verifyEmbedEventTokenContext(token, { videoId: VIDEO, sessionId: SESSION, host: "atacante.com" })).toBeNull();
  });

  it("rejects unbound legacy tokens issued before the binding", () => {
    const legacy = mod.createEmbedEventToken(VIDEO);
    expect(mod.verifyEmbedEventTokenContext(legacy, { videoId: VIDEO, sessionId: SESSION })).toBeNull();
  });

  it("only accepts events pinned to a render (token must carry a nonce)", () => {
    // O gate do /api/analytics-events exige `verifiedEvent.nonce`; um token sem
    // nonce (não amarrado a nenhum render observável) é rejeitado no router.
    const token = mod.createBoundEmbedEventToken({ videoId: VIDEO, host: "cliente.com.br", sessionId: SESSION });
    const ctx = mod.verifyEmbedEventTokenContext(token, { videoId: VIDEO, sessionId: SESSION });
    expect(ctx).not.toBeNull();
    expect(ctx!.nonce).toBeUndefined();
    // Com nonce presente, o router pode confirmar o render via cookie `pp_embed`.
    const pinned = mod.createBoundEmbedEventToken({ videoId: VIDEO, host: "cliente.com.br", sessionId: SESSION, nonce: "r" });
    const pinnedCtx = mod.verifyEmbedEventTokenContext(pinned, { videoId: VIDEO, sessionId: SESSION });
    expect(pinnedCtx?.nonce).toBe("r");
  });

  it("does not deliver conversion side effects without a confirmed render nonce", () => {
    const tokenWithNonce = mod.createBoundEmbedEventToken({ videoId: VIDEO, host: "cliente.com.br", sessionId: SESSION, nonce: "render-1" });
    const ctx = mod.verifyEmbedEventTokenContext(tokenWithNonce, { videoId: VIDEO, sessionId: SESSION });
    expect(ctx).not.toBeNull();
    // Sem o cookie `pp_embed` = nonce, o render não é confirmado.
    expect(mod.verifyEmbedRenderCookie(headersWith(), ctx!.nonce ?? "")).toBe(false);
    // Com o cookie correto, o render é confirmado (prova de que a sessão veio de uma página real).
    expect(mod.verifyEmbedRenderCookie(headersWith(["cookie", `pp_embed=${ctx!.nonce}`]), ctx!.nonce ?? "")).toBe(true);
  });

  it("agrees when a foreign Origin matches the token host but still requires first-party for delivery", () => {
    // Este é o caso do atacante que forja Origin = domínio do token: o header
    // "concorda" com o token (não há disagreement), mas a origem não é
    // first-party. O gate do /api/analytics-events bloqueia efeitos laterais
    // com `!firstPartyOrigin` — replicado aqui pela checagem self.
    const token = mod.createBoundEmbedEventToken({ videoId: VIDEO, host: "cliente.com.br", sessionId: SESSION });
    const ctx = mod.verifyEmbedEventTokenContext(token, { videoId: VIDEO, sessionId: SESSION });
    expect(ctx).not.toBeNull();
    expect(mod.originHeaderDisagrees(headersWith(["origin", "https://cliente.com.br"]), ctx!.host)).toBe(false);
    expect(mod.isSelfOrigin("https://cliente.com.br")).toBe(false);
    // E um Origin que NÃO bate com o token já é rejeitado no router.
    expect(mod.originHeaderDisagrees(headersWith(["origin", "https://atacante.com"]), ctx!.host)).toBe(true);
  });
});