import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import PositivusLanding from "@/features/landing-page/components/PositivusLanding";
import { getCurrentUserId } from "@/lib/auth/server";
import { db, schema } from "@/lib/db";
import { ensureAccountBootstrap } from "@/lib/access/bootstrap";

const { profiles } = schema;

export const metadata: Metadata = { alternates: { canonical: "/" } };

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
