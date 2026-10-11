import "server-only";

const projectUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

export function getSupabaseUrl() {
  if (!projectUrl) throw new Error("SUPABASE_URL is not configured");
  return projectUrl;
}

export function getSupabasePublishableKey() {
  if (!publishableKey) throw new Error("SUPABASE_PUBLISHABLE_KEY is not configured");
  return publishableKey;
}

export function isSupabaseConfigured() {
  return Boolean(projectUrl && publishableKey);
}
