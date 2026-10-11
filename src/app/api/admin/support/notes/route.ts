import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { validateNoteBody } from "@/lib/admin/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Suporte: adiciona nota interna ao caso. Não envia nada ao cliente. */
export async function POST(request: Request) {
  const gate = await adminGuard(request);
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `admin-support:${gate.adminId}`, { max: 60, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ caseId?: unknown; body?: unknown; reply?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const caseId = String(parsed.body?.caseId ?? "");
  const body = String(parsed.body?.body ?? "");
  // reply=true: resposta visível ao cliente (mostra que alguém atendeu).
  const reply = parsed.body?.reply === true;
  if (!uuid.test(caseId)) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const invalid = validateNoteBody(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing } = await admin.from("support_cases").select("id,status").eq("id", caseId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "case_not_found" }, { status: 404 });
  const { error } = await admin.from("support_notes").insert({ case_id: caseId, author_admin_id: gate.adminId, body: body.trim(), is_internal: !reply });
  if (error) return NextResponse.json({ error: "note_create_failed" }, { status: 400 });
  // Resposta ao cliente reabre o fluxo: tira o caso de "aberto" parado.
  await admin.from("support_cases").update({ updated_at: new Date().toISOString(), ...(reply && existing.status === "aberto" ? { status: "em_andamento" } : {}) }).eq("id", caseId);
  const { data: target } = await admin.from("support_cases").select("user_id").eq("id", caseId).maybeSingle();
  const { audit } = await import("@/lib/admin/support");
  await audit(gate.adminId, "support_note_added", target?.user_id ?? null, { case_id: caseId });
  return NextResponse.json({ created: true }, { headers: { "cache-control": "no-store" } });
}
