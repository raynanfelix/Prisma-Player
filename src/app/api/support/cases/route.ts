import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { validateCaseInput, validateNoteBody } from "@/lib/admin/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Tickets do cliente: abre caso vinculado a si mesmo. Sem acesso a casos
 * alheios — o user_id vem da sessão, nunca do body.
 */
export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true });
  if (!gate.ok) return gate.response;
  const { account } = gate;

  const limited = await rateLimit(request, `support-customer:${account.accountOwnerId}`, { max: 10, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ subject?: unknown; category?: unknown; priority?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const input = {
    userId: account.accountOwnerId,
    subject: String(parsed.body?.subject ?? ""),
    category: String(parsed.body?.category ?? "geral"),
    priority: String(parsed.body?.priority ?? "normal"),
  };
  const invalid = validateCaseInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("support_cases").insert({
    user_id: account.accountOwnerId,
    subject: input.subject.trim().replace(/\s+/g, " "),
    category: input.category, priority: input.priority,
  }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "case_create_failed" }, { status: 400 });
  return NextResponse.json({ created: true, id: data.id }, { headers: { "cache-control": "no-store" } });
}
