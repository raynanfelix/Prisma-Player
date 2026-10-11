import { beforeAll, describe, expect, it } from "vitest";

const VIDEO = "33333333-3333-4333-8333-333333333333";
const OTHER_VIDEO = "44444444-4444-4444-8444-444444444444";
const PLAYER = "55555555-5555-4555-8555-555555555555";
const TEST = "77777777-7777-4777-8777-777777777777";
const OTHER_TEST = "88888888-8888-4888-8888-888888888888";
const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_SESSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let mod: typeof import("@/lib/security/embed-origin");

beforeAll(async () => {
  process.env.EMBED_ORIGIN_SECRET = "segredo-de-teste-binding";
  mod = await import("@/lib/security/embed-origin");
});

function headersWith(...pairs: Array<[string, string]>) {
  const init: Record<string, string> = {};
  for (const [name, value] of pairs) init[name] = value;
  return new Headers(init) as unknown as Pick<Headers, "get">;
}

describe("origin token: render-nonce binding (RM-02)", () => {
  it("round-trips the per-render nonce into the token", () => {
    const nonce = "abc123nonce";
    const token = mod.createEmbedOriginToken({ playerId: PLAYER, host: "https://cliente.com.br/pagina", nonce });
    expect(mod.verifyEmbedOriginToken(token, PLAYER)).toEqual({ host: "cliente.com.br", nonce });
  });

  it("keeps emitting/verifying tokens without nonce (compat)", () => {
    const token = mod.createEmbedOriginToken({ playerId: PLAYER, host: "cliente.com.br" });
    expect(mod.verifyEmbedOriginToken(token, PLAYER)).toEqual({ host: "cliente.com.br" });
  });

  it("rejects an expired origin token even with a valid nonce", () => {
    const token = mod.createEmbedOriginToken({ playerId: PLAYER, host: "cliente.com.br", nonce: "n", maxAgeSeconds: -60 });
    expect(mod.verifyEmbedOriginToken(token, PLAYER)).toBeNull();
  });

  it("rejects a token whose nonce claim was swapped after signing", () => {
    const token = mod.createEmbedOriginToken({ playerId: PLAYER, host: "cliente.com.br", nonce: "real" });
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ v: "v1", playerId: PLAYER, host: "cliente.com.br", nonce: "evil", exp: 4102444800 })).toString("base64url");
    expect(mod.verifyEmbedOriginToken(`${forged}.${signature}`, PLAYER)).toBeNull();
  });

  it("rejects a token of another player", () => {
    const token = mod.createEmbedOriginToken({ playerId: PLAYER, host: "cliente.com.br", nonce: "n" });
    expect(mod.verifyEmbedOriginToken(token, "66666666-6666-4666-8666-666666666666")).toBeNull();
  });
});

describe("origin token: A/B test scoping (RM-04)", () => {
  it("mints a test-scoped token carrying the abTest claim", () => {
    const token = mod.createEmbedOriginToken({ playerId: TEST, host: "cliente.com.br", abTestId: TEST });
    const parsed = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) as { playerId?: string; abTest?: string };
    expect(parsed.playerId).toBe(TEST);
    expect(parsed.abTest === TEST).toBe(true);
  });

  it("verifies the test-scoped token only with the matching abTestPath", () => {
    const token = mod.createEmbedOriginToken({ playerId: TEST, host: "cliente.com.br", abTestId: TEST });
    expect(mod.verifyEmbedOriginToken(token, TEST, { abTestPath: TEST })).toEqual({ host: "cliente.com.br" });
  });

  it("rejects the test-scoped token on the direct-player consumption path (no abTestPath)", () => {
    const token = mod.createEmbedOriginToken({ playerId: TEST, host: "cliente.com.br", abTestId: TEST });
    expect(mod.verifyEmbedOriginToken(token, TEST)).toBeNull();
  });

  it("rejects a test-scoped token verified against the wrong test id", () => {
    const token = mod.createEmbedOriginToken({ playerId: TEST, host: "cliente.com.br", abTestId: TEST });
    expect(mod.verifyEmbedOriginToken(token, OTHER_TEST, { abTestPath: OTHER_TEST })).toBeNull();
  });

  it("rejects a plain player token presented with an abTestPath requirement", () => {
    const token = mod.createEmbedOriginToken({ playerId: PLAYER, host: "cliente.com.br", nonce: "n" });
    expect(mod.verifyEmbedOriginToken(token, PLAYER, { abTestPath: TEST })).toBeNull();
  });

  it("rejects a test-scoped token presented under a different test path", () => {
    const token = mod.createEmbedOriginToken({ playerId: TEST, host: "cliente.com.br", abTestId: TEST });
    expect(mod.verifyEmbedOriginToken(token, TEST, { abTestPath: OTHER_TEST })).toBeNull();
  });
});

describe("event token: session/host binding (RM-03)", () => {
  it("accepts a bound token when sessionId+host match the expected context", () => {
    const token = mod.createBoundEmbedEventToken({ videoId: VIDEO, host: "cliente.com.br", sessionId: SESSION, nonce: "n1" });
    expect(mod.verifyEmbedEventTokenContext(token, { videoId: VIDEO, sessionId: SESSION })).toEqual({
      host: "cliente.com.br",
      sessionId: SESSION,
      nonce: "n1",
    });
  });

  it("rejects an event whose body sessionId differs from the token", () => {
    const token = mod.createBoundEmbedEventToken({ videoId: VIDEO, host: "cliente.com.br", sessionId: SESSION });
    expect(mod.verifyEmbedEventTokenContext(token, { videoId: VIDEO, sessionId: OTHER_SESSION })).toBeNull();
  });

  it("rejects an unbound legacy token when a session is required", () => {
    const legacy = mod.createEmbedEventToken(VIDEO);
    expect(mod.verifyEmbedEventTokenContext(legacy, { videoId: VIDEO, sessionId: SESSION })).toBeNull();
  });

  it("rejects tokens for the wrong video, expired, tampered or wrong host", () => {
    const token = mod.createBoundEmbedEventToken({ videoId: VIDEO, host: "cliente.com.br", sessionId: SESSION });
    expect(mod.verifyEmbedEventTokenContext(token, { videoId: OTHER_VIDEO, sessionId: SESSION })).toBeNull();
    const expired = mod.createBoundEmbedEventToken({ videoId: VIDEO, host: "cliente.com.br", sessionId: SESSION, maxAgeSeconds: -60 });
    expect(mod.verifyEmbedEventTokenContext(expired, { videoId: VIDEO, sessionId: SESSION })).toBeNull();
    const [payload] = token.split(".");
    expect(mod.verifyEmbedEventTokenContext(`${payload}.assinaturafalsa`, { videoId: VIDEO, sessionId: SESSION })).toBeNull();
    expect(mod.verifyEmbedEventTokenContext(token, { videoId: VIDEO, sessionId: SESSION, host: "atacante.com" })).toBeNull();
  });

  it("still rejects tokens whose signature does not cover swapped payload", () => {
    const token = mod.createBoundEmbedEventToken({ videoId: VIDEO, host: "cliente.com.br", sessionId: SESSION });
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ v: "v1", k: "evt", videoId: VIDEO, host: "cliente.com.br", sessionId: OTHER_SESSION, exp: 4102444800 })).toString("base64url");
    expect(mod.verifyEmbedEventTokenContext(`${forged}.${signature}`, { videoId: VIDEO, sessionId: OTHER_SESSION })).toBeNull();
  });
});

describe("render cookie + header/token host consistency", () => {
  it("reads pp_embed from the cookie header", () => {
    expect(mod.readEmbedRenderCookie(headersWith(["cookie", "pp_embed=nonce123; outro=x"]))).toBe("nonce123");
    expect(mod.readEmbedRenderCookie(headersWith(["cookie", "outro=x; pp_embed=otroval"]))).toBe("otroval");
    expect(mod.readEmbedRenderCookie(headersWith(["cookie", "outro=x"]))).toBeNull();
    expect(mod.readEmbedRenderCookie(headersWith())).toBeNull();
  });

  it("verifies the nonce against the cookie timing-safely", () => {
    expect(mod.verifyEmbedRenderCookie(headersWith(["cookie", "pp_embed=abc"]), "abc")).toBe(true);
    expect(mod.verifyEmbedRenderCookie(headersWith(["cookie", "pp_embed=abc"]), "abd")).toBe(false);
    expect(mod.verifyEmbedRenderCookie(headersWith(["cookie", "pp_embed=longer"]), "short")).toBe(false);
    expect(mod.verifyEmbedRenderCookie(headersWith(), "abc")).toBe(false);
  });

  it("flags foreign Origin/Referer that disagrees with the token host", () => {
    expect(mod.originHeaderDisagrees(headersWith(["referer", "https://cliente.com.br/vsl"]), "cliente.com.br")).toBe(false);
    expect(mod.originHeaderDisagrees(headersWith(["referer", "https://www.cliente.com.br/vsl"]), "cliente.com.br")).toBe(false);
    expect(mod.originHeaderDisagrees(headersWith(["origin", "https://atacante.com"]), "cliente.com.br")).toBe(true);
    expect(mod.originHeaderDisagrees(headersWith(["referer", "https://cliente.com.br/vsl"]), "outro.com.br")).toBe(true);
    // Self origin is exempt even when the token claims another (embed) host.
    expect(mod.originHeaderDisagrees(headersWith(["referer", "http://localhost:3000/embed/x"]), "cliente.com.br")).toBe(false);
    // No Origin/Referer at all => nothing to disagree (token is the authority).
    expect(mod.originHeaderDisagrees(headersWith(), "cliente.com.br")).toBe(false);
  });
});