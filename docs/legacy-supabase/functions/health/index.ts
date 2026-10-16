import { withSupabase } from "npm:@supabase/server@1.4.0";

Deno.serve(withSupabase({ auth: "publishable" }, async (_request, context) => {
  const { error } = await context.supabase.from("profiles").select("id", { head: true, count: "exact" });
  return Response.json({ ok: !error, database: error ? "unavailable" : "ready" }, { status: error ? 503 : 200 });
}));
