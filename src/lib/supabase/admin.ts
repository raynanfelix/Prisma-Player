import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "./env";

export function createAdminClient() {
  const configuredSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = configuredSecret?.replace(/\s+/g, "");
  if (!secret) throw new Error("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(getSupabaseUrl(), secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
