import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import AboutPage from "@/features/landing-page/components/AboutPage";
import { getCurrentUserId } from "@/lib/auth/server";
import { db, schema } from "@/lib/db";

const { profiles } = schema;

export const metadata: Metadata = {
  title: "Sobre Nós | Prisma Player - O Player de VSL Mais Rápido",
  description: "Conheça a história, o manifesto e os valores da Prisma Player. A tecnologia líder em retenção e inteligência para VSLs no Brasil.",
  alternates: { canonical: "/about" },
};

export default async function Page() {
  const userId = await getCurrentUserId();
  const [profile] = userId
    ? await db.select({ fullName: profiles.fullName }).from(profiles).where(eq(profiles.id, userId)).limit(1)
    : [];
  const firstName = profile?.fullName?.trim().split(/\s+/)[0] || "Dashboard";
  return <AboutPage account={userId ? { firstName } : null} />;
}
