import type { Metadata } from "next";
import ServicesPage from "@/features/landing-page/components/ServicesPage";
import { getCurrentUserId } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Recursos & Serviços | Prisma Player - Tecnologia de Alta Conversão",
  description: "Conheça em detalhes o Pitch Delay Inteligente, Turbo CDN, Escudo DRM Anti-Pirataria, Smart Autoplay e Analytics de Retenção do Prisma Player.",
  alternates: { canonical: "/services" },
};

export default async function Page() {
  const userId = await getCurrentUserId();
  const profile = userId
    ? (await createAdminClient().from("profiles").select("full_name").eq("id", userId).maybeSingle()).data
    : null;
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "Dashboard";
  return <ServicesPage account={userId ? { firstName } : null} />;
}
