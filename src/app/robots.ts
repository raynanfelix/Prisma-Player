import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://prisma-player.vercel.app").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/dashboard/", "/studio", "/embed/", "/checkout/", "/welcome", "/login", "/signup", "/reset-password"],
      },
      // Bots de busca e citação por IA: explícitos para que o painel admin
      // (SEO e IA) consiga verificar a permissão e as IAs possam citar.
      {
        userAgent: ["GPTBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot", "anthropic-ai", "Google-Extended"],
        allow: "/",
        disallow: ["/api/", "/admin/", "/dashboard/", "/studio", "/embed/", "/checkout/", "/welcome", "/login", "/signup", "/reset-password"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
