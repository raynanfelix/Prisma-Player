export function themeBootstrapScript() {
  return `(function() {
    try {
      if (localStorage.getItem('theme') === 'dark') {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();`;
}

export function softwareApplicationJsonLd(siteUrl: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Prisma Player",
    applicationCategory: "Multimedia",
    operatingSystem: "Web",
    description:
      "Player de vídeo para publicar, personalizar, proteger e otimizar VSLs com dados de conversão.",
    url: siteUrl,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "BRL",
      description: "Teste gratuito de 14 dias",
    },
  });
}

/**
 * Organization JSON-LD (item 4 da spec Agentic v2): entidade da marca para
 * rich results eKnowledge Panel. Deliberadamente enxuto e honesto: endereço
 * só com país (nada de rua/cidade inventadas), logo é o arquivo real em
 * public/logo.png, e o e-mail de suporte é o atual do dono marcado como
 * pendência para troca.
 */
export function organizationJsonLd(siteUrl: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Prisma Player",
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        // TODO(dono): trocar pelo e-mail oficial de suporte quando existir.
        email: "raynanbarbosa803@gmail.com",
        availableLanguage: ["pt-BR"],
      },
    ],
    address: {
      "@type": "PostalAddress",
      addressCountry: "BR",
    },
  });
}