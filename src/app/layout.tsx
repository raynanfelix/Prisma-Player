import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import ThemeScript from "@/components/ThemeScript";
import { AppProviders } from "@/providers/AppProviders";
import { softwareApplicationJsonLd } from "@/lib/security/inline-scripts";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://prisma-player.vercel.app").replace(/\/$/, "");

export const metadata: Metadata = {
  title: {
    default: "Player de VSL para aumentar conversões | Prisma Player",
    template: "%s | Prisma Player",
  },
  description:
    "Player de VSL com Pitch Delay sincronizado ao segundo, analytics de retenção, testes A/B e proteção anti-download para publicar, otimizar e aumentar as conversões das suas VSLs.",
  keywords: [
    "player de vídeo",
    "player de VSL",
    "pitch delay",
    "analytics de retenção",
    "conversão de vendas",
    "VSL",
    "video sales letter",
    "aumentar conversão",
    "otimização de vídeo",
  ],
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "Player de VSL para aumentar conversões | Prisma Player",
    description:
      "Player de VSL com Pitch Delay sincronizado, analytics de retenção, testes A/B, proteção e inteligência para transformar sua VSL em uma operação de conversão.",
    url: siteUrl,
    siteName: "Prisma Player",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Prisma Player",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Player de VSL para aumentar conversões | Prisma Player",
    description:
      "Player de VSL com Pitch Delay sincronizado, analytics de retenção, testes A/B, proteção e inteligência para transformar sua VSL em uma operação de conversão.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
  other: {
    "strix-verification": "strix-verify-b20fa474d2f888ccaf535109a506fe83",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce");
  return (
    <html lang="pt-BR" className={cn("h-full", "antialiased", "font-sans", geist.variable)}>
      <head>
        <ThemeScript />
        <script
          nonce={nonce ?? undefined}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: softwareApplicationJsonLd(siteUrl),
          }}
        />
      </head>
      <body className="flex min-h-full flex-col"><AppProviders>{children}</AppProviders></body>
    </html>
  );
}
