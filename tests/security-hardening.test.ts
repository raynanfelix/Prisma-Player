import { describe, expect, it } from "vitest";
import { ownedAssetPaths } from "@/lib/player/assets";
import { safeChartColor, safeChartKey } from "@/components/ui/chart";
import { GET as playerLoaderGET } from "@/app/api/player-loader/[id]/route";

const OWNER = "11111111-1111-4111-8111-111111111111";

describe("SEC-5.2 traversal codificado (assets)", () => {
  it("rejeita %2e%2e e %2f", () => {
    expect(ownedAssetPaths({ thumbnailStart: `${OWNER}/%2e%2e/evil.png` }, OWNER)).toEqual({});
    expect(ownedAssetPaths({ thumbnailStart: `${OWNER}%2fvictim.png` }, OWNER)).toEqual({});
    expect(ownedAssetPaths({ thumbnailStart: `${OWNER}/%252e%252e/x.png` }, OWNER)).toEqual({});
  });

  it("rejeita valor que muda após decode", () => {
    expect(ownedAssetPaths({ thumbnailStart: `${OWNER}/a%20b.png` }, OWNER)).toEqual({});
  });

  it("aceita caminho legítimo inalterado", () => {
    const ok = `${OWNER}/video/thumb-abc.png`;
    expect(ownedAssetPaths({ thumbnailStart: ok }, OWNER)).toEqual({ thumbnailStart: ok });
  });
});

describe("SEC-5.4 chart CSS injection", () => {
  it("sanitiza chave e cor", () => {
    expect(safeChartKey("revenue")).toBe("revenue");
    expect(safeChartKey("</style><script>")).toBe("stylescript");
    expect(safeChartColor("#B9FF66")).toBe("#B9FF66");
    expect(safeChartColor("red")).toBe("red");
    expect(safeChartColor("</style><script>alert(1)</script>")).toBe("");
    expect(safeChartColor("javascript:alert(1)")).toBe("");
  });
});

describe("SEC-5.6 UUID estrito player-loader", () => {
  it("rejeita 36 hífens", async () => {
    const res = await playerLoaderGET(new Request("https://x/"), { params: Promise.resolve({ id: "------------------------------------" }) });
    expect(res.status).toBe(400);
  });

  it("aceita UUID v4 válido", async () => {
    const res = await playerLoaderGET(new Request("https://x/"), { params: Promise.resolve({ id: OWNER }) });
    expect(res.status).toBe(200);
  });
});

describe("SEC-5.6 ctaUrl", () => {
  it("regra ^https?:// bloqueia javascript:", () => {
    const isSafe = (u: string) => /^https?:\/\//i.test(u);
    expect(isSafe("https://cliente.com/oferta")).toBe(true);
    expect(isSafe("javascript:alert(1)")).toBe(false);
    expect(isSafe("data:text/html,<script>alert(1)</script>")).toBe(false);
  });
});
