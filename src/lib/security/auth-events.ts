import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPostHogClient } from "@/lib/posthog-server";

export async function recordAuthFailure(eventType: "login_failed" | "signup_failed", email: string, request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "";
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (profile?.id) {
    await admin.from("security_events").insert({
      user_id: profile.id,
      event_type: eventType,
      metadata: { email, ip },
    });
  }
  getPostHogClient().capture({
    distinctId: profile?.id ?? email,
    event: eventType,
    properties: { email, ip },
  });
}
