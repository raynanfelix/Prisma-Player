import { beforeAll, describe, expect, it } from "vitest";

const VIDEO = "33333333-3333-4333-8333-333333333333";
const OTHER_VIDEO = "44444444-4444-4444-8444-444444444444";
const PLAYER = "55555555-5555-4555-8555-555555555555";

let mod: typeof import("@/lib/security/embed-origin");

beforeAll(async () => {
  process.env.EMBED_ORIGIN_SECRET = "segredo-de-teste-independente";
  mod = await import("@/lib/security/embed-origin");
});

describe("tokens de evento do embed", () => {
  it("aceita um token válido para o vídeo correspondente", () => {
    const token = mod.createEmbedEventToken(VIDEO);
    expect(mod.verifyEmbedEventToken(token, VIDEO)).toBe(true);
  });

  it("rejeita token emitido para outro vídeo", () => {
    const token = mod.createEmbedEventToken(OTHER_VIDEO);
    expect(mod.verifyEmbedEventToken(token, VIDEO)).toBe(false);
  });

  it("rejeita token expirado", () => {
    const token = mod.createEmbedEventToken(VIDEO, -60);
    expect(mod.verifyEmbedEventToken(token, VIDEO)).toBe(false);
  });

  it("rejeita assinatura adulterada", () => {
    const token = mod.createEmbedEventToken(VIDEO);
    const [payload] = token.split(".");
    expect(mod.verifyEmbedEventToken(`${payload}.assinaturafalsa`, VIDEO)).toBe(false);
  });

  it("rejeita payload adulterado mantendo a assinatura antiga", () => {
    const token = mod.createEmbedEventToken(VIDEO);
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ v: "v1", k: "evt", videoId: OTHER_VIDEO, exp: 4102444800 })).toString("base64url");
    expect(mod.verifyEmbedEventToken(`${forged}.${signature}`, OTHER_VIDEO)).toBe(false);
  });

  it("rejeita token ausente ou malformado", () => {
    expect(mod.verifyEmbedEventToken(null, VIDEO)).toBe(false);
    expect(mod.verifyEmbedEventToken("", VIDEO)).toBe(false);
    expect(mod.verifyEmbedEventToken("sem-ponto", VIDEO)).toBe(false);
  });
});

describe("tokens de origem do embed", () => {
  it("valida host e player", () => {
    const token = mod.createEmbedOriginToken({ playerId: PLAYER, host: "https://cliente.com.br/pagina" });
    expect(mod.verifyEmbedOriginToken(token, PLAYER)).toEqual({ host: "cliente.com.br" });
  });

  it("rejeita token de outro player", () => {
    const token = mod.createEmbedOriginToken({ playerId: PLAYER, host: "cliente.com.br" });
    expect(mod.verifyEmbedOriginToken(token, "66666666-6666-4666-8666-666666666666")).toBeNull();
  });
});

describe("domainAllowed", () => {
  it("libera tudo quando não há domínios cadastrados", () => {
    expect(mod.domainAllowed("qualquer.com", [])).toBe(true);
  });

  it("normaliza www., protocolo e caminho", () => {
    expect(mod.domainAllowed("www.cliente.com.br", ["https://cliente.com.br/vsl"])).toBe(true);
  });

  it("suporta curinga de subdomínio sem liberar o vizinho", () => {
    expect(mod.domainAllowed("vendas.cliente.com", ["*.cliente.com"])).toBe(true);
    expect(mod.domainAllowed("cliente.com.br.atacante.com", ["*.cliente.com"])).toBe(false);
  });

  it("bloqueia domínio não listado", () => {
    expect(mod.domainAllowed("atacante.com", ["cliente.com.br"])).toBe(false);
  });
});
