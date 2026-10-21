import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { validateCaseInput, validateNoteBody } from "@/lib/admin/support";
import { rateLimit } from "@/lib/security/rate-limit";
import { db, schema } from "@/lib/db";

const { supportCases } = schema;

/**
 * Tickets do cliente: abre caso vinculado a si mesmo. Sem acesso a casos
 * alheios - o user_id vem da sessão, nunca do body.
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

  const [created] = await db.insert(supportCases).values({
    userId: account.accountOwnerId,
    subject: input.subject.trim().replace(/\s+/g, " "),
    category: input.category,
    priority: input.priority,
  }).returning({ id: supportCases.id });
  if (!created) return NextResponse.json({ error: "case_create_failed" }, { status: 400 });
  return NextResponse.json({ created: true, id: created.id }, { headers: { "cache-control": "no-store" } });
}
