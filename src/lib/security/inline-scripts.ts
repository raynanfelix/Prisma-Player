export function themeBootstrapScript() {
  return `(function() {
    var theme = localStorage.getItem('theme');
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
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