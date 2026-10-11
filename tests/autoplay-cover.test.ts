import { describe, expect, it } from "vitest";
import { resolveAutoplayCover, sanitizeCoverUrl } from "@/lib/player/autoplay-cover";

describe("capa do Smart Autoplay", () => {
  it("aceita GIF e imagem com URL https", () => {
    expect(resolveAutoplayCover({ autoplayCoverType: "gif", autoplayGifUrl: "https://media.giphy.com/media/x/giphy.gif" }))
      .toEqual({ type: "gif", url: "https://media.giphy.com/media/x/giphy.gif" });
    expect(resolveAutoplayCover({ autoplayCoverType: "image", autoplayImageUrl: "https://site.com/capa.png" }))
      .toEqual({ type: "image", url: "https://site.com/capa.png" });
  });

  it("cai para padrão sem URL válida", () => {
    expect(resolveAutoplayCover({ autoplayCoverType: "gif", autoplayGifUrl: "" })).toEqual({ type: "standard" });
    expect(resolveAutoplayCover({ autoplayCoverType: "image" })).toEqual({ type: "standard" });
    expect(resolveAutoplayCover({})).toEqual({ type: "standard" });
  });

  it("rejeita javascript:, data: e http", () => {
    expect(sanitizeCoverUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeCoverUrl("data:image/png;base64,AAA")).toBeNull();
    expect(sanitizeCoverUrl("http://site.com/a.gif")).toBeNull();
    expect(sanitizeCoverUrl(42)).toBeNull();
  });
});
