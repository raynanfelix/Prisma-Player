import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUserId() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return String(data.claims.sub);
}

export async function requireUser(next = "/dashboard/videos") {
  const userId = await getCurrentUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(next)}`);
  return userId;
}

export async function getCurrentAdminUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const appRole = typeof data.user.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
  return appRole === "admin" ? data.user : null;
}

export async function getAuthAssuranceLevel(): Promise<"aal1" | "aal2" | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const aal = data.claims.aal;
  return aal === "aal1" || aal === "aal2" ? (aal as "aal1" | "aal2") : null;
}

export async function hasVerifiedMfaFactor(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data?.all) return false;
  return data.all.some((factor) => factor.status === "verified");
}

export async function requireAdmin() {
  const userId = await getCurrentUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent("/admin")}`);
  const user = await getCurrentAdminUser();
  if (!user) redirect("/dashboard/videos");
  if (!(await hasVerifiedMfaFactor())) {
    redirect("/dashboard/settings?section=security&adminMfa=required");
  }
  // Consistência com as APIs (adminGuard exige aal2): página admin com sessão
  // aal1 renderizaria um shell cujas ações falham. Sem fator desafiado na
  // sessão atual, volta ao fluxo de verificação — nunca renderiza achando
  // que está autorizado.
  if ((await getAuthAssuranceLevel()) !== "aal2") {
    redirect("/dashboard/settings?section=security&adminMfa=required");
  }
  return user;
}
