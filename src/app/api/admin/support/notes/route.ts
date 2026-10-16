import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { audit, validateNoteBody } from "@/lib/admin/support";
import { rateLimit } from "@/lib/security/rate-limit";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { supportCases, supportNotes } = schema;

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

  const [existing] = await db.select({ id: supportCases.id, status: supportCases.status })
    .from(supportCases).where(eq(supportCases.id, caseId)).limit(1);
  if (!existing) return NextResponse.json({ error: "case_not_found" }, { status: 404 });

  const now = new Date();
  try {
    // Nota e o bump/reabertura do caso pertencem ao mesmo evento: transação.
    await db.transaction(async (tx) => {
      await tx.insert(supportNotes).values({ caseId, authorAdminId: gate.adminId, body: body.trim(), isInternal: !reply });
      // Resposta ao cliente reabre o fluxo: tira o caso de "aberto" parado.
      await tx.update(supportCases).set({
        updatedAt: now,
        ...(reply && existing.status === "aberto" ? { status: "em_andamento" as const } : {}),
      }).where(eq(supportCases.id, caseId));
    });
  } catch {
    return NextResponse.json({ error: "note_create_failed" }, { status: 400 });
  }
  const [target] = await db.select({ userId: supportCases.userId }).from(supportCases).where(eq(supportCases.id, caseId)).limit(1);
  await audit(gate.adminId, "support_note_added", target?.userId ?? null, { case_id: caseId });
  return NextResponse.json({ created: true }, { headers: { "cache-control": "no-store" } });
}
