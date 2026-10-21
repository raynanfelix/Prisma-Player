import { describe, expect, it } from "vitest";
import { organizationJsonLd } from "@/lib/security/inline-scripts";

/**
 * Item 4 da spec Agentic v2: Organization JSON-LD renderizado no layout.
 * O contrato é a função que gera o script (JSON.parse precisa passar) -
 * o layout apenas injeta o resultado com o mesmo nonce dos demais scripts
 * inline, sem mudar nada visual.
 */

const SITE_URL = "https://prisma-player.vercel.app";

describe("Organization JSON-LD (spec Agentic v2, item 4)", () => {
  it("emite JSON válido do tipo Organization com marca e url", () => {
    const parsed = JSON.parse(organizationJsonLd(SITE_URL)) as {
      "@context": string;
      "@type": string;
      name: string;
      url: string;
      logo: string;
    };
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@type"]).toBe("Organization");
    expect(parsed.name).toBe("Prisma Player");
    expect(parsed.url).toBe(SITE_URL);
    expect(parsed.logo).toBe(`${SITE_URL}/logo.png`);
  });

  it("contactPoint de suporte em pt-BR e endereço só com país (nada inventado)", () => {
    const parsed = JSON.parse(organizationJsonLd(SITE_URL)) as {
      contactPoint: Array<{ contactType: string; email: string; availableLanguage: string[] }>;
      address: { "@type": string; addressCountry: string };
    };
    expect(parsed.contactPoint).toHaveLength(1);
    expect(parsed.contactPoint[0]?.contactType).toBe("customer support");
    expect(parsed.contactPoint[0]?.email).toContain("@");
    expect(parsed.contactPoint[0]?.availableLanguage).toEqual(["pt-BR"]);
    expect(parsed.address).toEqual({ "@type": "PostalAddress", addressCountry: "BR" });
    expect(organizationJsonLd(SITE_URL)).not.toMatch(/streetAddress|addressLocality|addressRegion/);
  });
});
