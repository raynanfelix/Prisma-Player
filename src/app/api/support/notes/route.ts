import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { validateNoteBody } from "@/lib/admin/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Chat do cliente: mensagem no próprio caso. Mensagens do cliente entram
 * como não-internas para a equipe ver; notas internas seguem invisíveis.
 */
export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true });
  if (!gate.ok) return gate.response;
  const { account } = gate;

  const limited = await rateLimit(request, `support-chat:${account.accountOwnerId}`, { max: 30, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ caseId?: unknown; body?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const caseId = String(parsed.body?.caseId ?? "");
  const body = String(parsed.body?.body ?? "");
  if (!uuid.test(caseId)) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const invalid = validateNoteBody(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing } = await admin.from("support_cases").select("id").eq("id", caseId).eq("user_id", account.accountOwnerId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "case_not_found" }, { status: 404 });
  const { error } = await admin.from("support_notes").insert({ case_id: caseId, author_admin_id: null, body: body.trim(), is_internal: false });
  if (error) return NextResponse.json({ error: "note_create_failed" }, { status: 500 });
  await admin.from("support_cases").update({ updated_at: new Date().toISOString() }).eq("id", caseId);
  return NextResponse.json({ created: true }, { headers: { "cache-control": "no-store" } });
}
