import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import PositivusLanding from "@/features/landing-page/components/PositivusLanding";
import { getCurrentUserId } from "@/lib/auth/server";
import { db, schema } from "@/lib/db";
import { ensureAccountBootstrap } from "@/lib/access/bootstrap";

const { profiles } = schema;

export const metadata: Metadata = {
  title: "Player de VSL com Pitch Delay e Analytics de Retenção | Prisma Player",
  description:
    "Aumente conversões da sua VSL com Pitch Delay sincronizado ao segundo, analytics de retenção segundo a segundo, testes A/B nativos e proteção DRM anti-pirataria. Player feito para vender.",
  alternates: { canonical: "/" },
  keywords: [
    "player de vsl",
    "pitch delay",
    "video sales letter",
    "analytics de retenção",
    "aumentar conversão vsl",
    "proteção drm vídeo",
    "testes ab vsl",
    "player para infoproduto",
  ],
};

export default async function Home() {
  const userId = await getCurrentUserId();
  let [profile] = userId
    ? await db.select({ fullName: profiles.fullName }).from(profiles).where(eq(profiles.id, userId)).limit(1)
    : [];
  if (userId && !profile) {
    // Self-heal: conta sem linha em profiles é inicializada do Neon Auth.
    await ensureAccountBootstrap({ id: userId });
    [profile] = await db.select({ fullName: profiles.fullName }).from(profiles).where(eq(profiles.id, userId)).limit(1);
  }
  const firstName = profile?.fullName?.trim().split(/\s+/)[0] || "Dashboard";
  return <PositivusLanding account={userId ? { firstName } : null} />;
}
