import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  // Domínio puramente aplicacional (dashboard/API/embed): nada aqui é
  // conteúdo público para busca. O site de marketing (prismaplayer.online,
  // repo da landing) tem o robots próprio com a política de IA.
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
