import { describe, expect, it } from "vitest";
import { buildPlayerLoaderScript } from "@/app/api/player-loader/[id]/route";
import { normalizePixelConfig, pixelConfigErrors, pixelIntegrations } from "@/lib/player/pixels";
import { deliverServerPurchase } from "@/services/ads/server-events";

describe("player pixel configuration", () => {
  it("migrates a legacy single-provider configuration", () => {
    const config = normalizePixelConfig({ pixelsEnabled: true, pixelProvider: "Meta", pixelId: "1234567890" });
    expect(config.metaPixelEnabled).toBe(true);
    expect(config.metaPixelId).toBe("1234567890");
    expect(pixelIntegrations(config)).toEqual([{ provider: "meta", id: "1234567890" }]);
    expect(config.pixelConsentMode).toBe("banner");
  });

  it("supports Meta, Google and TikTok at the same time", () => {
    const integrations = pixelIntegrations({
      metaPixelEnabled: true, metaPixelId: "1234567890",
      googlePixelEnabled: true, googleTagId: "AW-123456789", googleConversionDestination: "AW-123456789/Checkout_1",
      tiktokPixelEnabled: true, tiktokPixelId: "C123456789ABCDEF",
    });
    expect(integrations).toHaveLength(3);
    expect(integrations[1]).toMatchObject({ provider: "google", conversionDestination: "AW-123456789/Checkout_1" });
  });

  it("rejects malformed identifiers before publishing", () => {
    expect(pixelConfigErrors({ metaPixelEnabled: true, metaPixelId: "not-an-id" })).toContain("meta_pixel_id_invalid");
    expect(pixelConfigErrors({ googlePixelEnabled: true, googleTagId: "UA-old" })).toContain("google_tag_id_invalid");
    expect(pixelConfigErrors({ tiktokPixelEnabled: true, tiktokPixelId: "short" })).toContain("tiktok_pixel_id_invalid");
  });

  it("emits syntactically valid loader JavaScript with purchase tracking", () => {
    const script = buildPlayerLoaderScript("37c52d61-f4ae-45db-890f-0ef87de5a967");
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain("trackConversion");
    expect(script).toContain("transaction_id");
    expect(script).toContain("connect.facebook.net");
    expect(script).toContain("googletagmanager.com");
    expect(script).toContain("analytics.tiktok.com");
    expect(script).toContain("setConsent(input");
    expect(script).toContain("advertising-consent");
  });

  it("delivers Meta and TikTok purchases server-side without exposing tokens", async () => {
    process.env.META_CAPI_TOKENS_JSON = JSON.stringify({ "1234567890": "meta-secret-token-value" });
    process.env.TIKTOK_EVENTS_TOKENS_JSON = JSON.stringify({ C123456789ABCDEF: "tiktok-secret-token-value" });
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const results = await deliverServerPurchase({ integrations: [{ provider: "meta", id: "1234567890" }, { provider: "tiktok", id: "C123456789ABCDEF" }], eventId: "ORDER-42", eventName: "Purchase", eventSourceUrl: "https://example.com/obrigado", value: 197, currency: "BRL", clientUserAgent: "Vitest" }, fetcher);
    expect(results.every((item) => item.delivered)).toBe(true);
    expect(requests).toHaveLength(2);
    expect(String(requests[0].init?.body)).toContain("ORDER-42");
    expect(JSON.stringify(requests)).not.toContain("NEXT_PUBLIC");
    delete process.env.META_CAPI_TOKENS_JSON;
    delete process.env.TIKTOK_EVENTS_TOKENS_JSON;
  });
});
