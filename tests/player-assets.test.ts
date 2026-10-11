import { describe, expect, it } from "vitest";
import { ownedAssetPaths } from "@/lib/player/assets";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("ownedAssetPaths", () => {
  it("mantém assets do próprio dono", () => {
    const assets = { thumbnailStart: `${OWNER}/video/thumb-abc.png`, captions: `${OWNER}/video/captions-x.vtt` };
    expect(ownedAssetPaths(assets, OWNER)).toEqual(assets);
  });

  // Regressão do IDOR: `player_configs.config` é jsonb livre gravado pelo
  // usuário, e o endpoint de embed assinava qualquer caminho encontrado ali.
  it("descarta assets que apontam para outro workspace", () => {
    const assets = { thumbnailStart: `${OTHER}/video/thumb-secreto.png` };
    expect(ownedAssetPaths(assets, OWNER)).toEqual({});
  });

  it("descarta tipos de asset desconhecidos", () => {
    const assets = { __proto__: `${OWNER}/x.png`, arbitrario: `${OWNER}/x.png`, thumbnailEnd: `${OWNER}/ok.png` };
    expect(ownedAssetPaths(assets, OWNER)).toEqual({ thumbnailEnd: `${OWNER}/ok.png` });
  });

  it("descarta travessia de caminho e valores não textuais", () => {
    const assets = {
      thumbnailStart: `${OWNER}/../${OTHER}/thumb.png`,
      thumbnailPause: `${OWNER}\\..\\x.png`,
      headlineDesktop: 42,
      headlineMobile: null,
    };
    expect(ownedAssetPaths(assets, OWNER)).toEqual({});
  });

  it("descarta prefixo que apenas começa parecido", () => {
    expect(ownedAssetPaths({ thumbnailStart: `${OWNER}extra/x.png` }, OWNER)).toEqual({});
  });

  it("tolera entradas inválidas", () => {
    expect(ownedAssetPaths(null, OWNER)).toEqual({});
    expect(ownedAssetPaths([], OWNER)).toEqual({});
    expect(ownedAssetPaths("texto", OWNER)).toEqual({});
  });
});
