import type { Metadata } from "next";
import PositivusPricing from "@/features/landing-page/components/PositivusPricing";
import { getCurrentUserId } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Planos e Preços | Prisma Player - O Player de VSL Mais Rápido",
  description: "Compare os planos Prisma Player e escolha a capacidade de plays, armazenamento e equipe ideal para sua operação de VSL.",
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  const userId = await getCurrentUserId();
  const profile = userId
    ? (await createAdminClient().from("profiles").select("full_name").eq("id", userId).maybeSingle()).data
    : null;
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "Dashboard";

  return <PositivusPricing account={userId ? { firstName } : null} />;
}
