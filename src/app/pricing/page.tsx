import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import PositivusPricing from "@/features/landing-page/components/PositivusPricing";
import { getCurrentUserId } from "@/lib/auth/server";
import { db, schema } from "@/lib/db";

const { profiles } = schema;

export const metadata: Metadata = {
  title: "Planos e Preços | Prisma Player - O Player de VSL Mais Rápido",
  description: "Compare os planos Prisma Player e escolha a capacidade de plays, armazenamento e equipe ideal para sua operação de VSL.",
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  const userId = await getCurrentUserId();
  const [profile] = userId
    ? await db.select({ fullName: profiles.fullName }).from(profiles).where(eq(profiles.id, userId)).limit(1)
    : [];
  const firstName = profile?.fullName?.trim().split(/\s+/)[0] || "Dashboard";

  return <PositivusPricing account={userId ? { firstName } : null} />;
}
