import type { Metadata } from "next";
import AboutPage from "@/features/landing-page/components/AboutPage";
import { getCurrentUserId } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Sobre Nós | Prisma Player - O Player de VSL Mais Rápido",
  description: "Conheça a história, o manifesto e os valores da Prisma Player. A tecnologia líder em retenção e inteligência para VSLs no Brasil.",
  alternates: { canonical: "/about" },
};

export default async function Page() {
  const userId = await getCurrentUserId();
  const profile = userId
    ? (await createAdminClient().from("profiles").select("full_name").eq("id", userId).maybeSingle()).data
    : null;
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "Dashboard";
  return <AboutPage account={userId ? { firstName } : null} />;
}
