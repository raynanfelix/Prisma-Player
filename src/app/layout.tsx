import type { Metadata } from "next";
import { Geist } from "next/font/google";
import ThemeScript from "@/components/ThemeScript";
import { AppProviders } from "@/providers/AppProviders";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: {
    default: "Prisma Player — Aplicação",
    template: "%s | Prisma Player",
  },
  description: "Dashboard da aplicação Prisma Player: VSLs, players, analytics de retenção e testes A/B.",
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={cn("h-full", "antialiased", "font-sans", geist.variable)}>
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col"><AppProviders>{children}</AppProviders></body>
    </html>
  );
}
