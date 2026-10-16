import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import ServicesPage from "@/features/landing-page/components/ServicesPage";
import { getCurrentUserId } from "@/lib/auth/server";
import { db, schema } from "@/lib/db";

const { profiles } = schema;

export const metadata: Metadata = {
  title: "Recursos & Serviços | Prisma Player - Tecnologia de Alta Conversão",
  description: "Conheça em detalhes o Pitch Delay Inteligente, Turbo CDN, Escudo DRM Anti-Pirataria, Smart Autoplay e Analytics de Retenção do Prisma Player.",
  alternates: { canonical: "/services" },
};

export default async function Page() {
  const userId = await getCurrentUserId();
  const [profile] = userId
    ? await db.select({ fullName: profiles.fullName }).from(profiles).where(eq(profiles.id, userId)).limit(1)
    : [];
  const firstName = profile?.fullName?.trim().split(/\s+/)[0] || "Dashboard";
  return <ServicesPage account={userId ? { firstName } : null} />;
}
