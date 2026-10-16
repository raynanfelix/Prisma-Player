import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { validateNoteBody } from "@/lib/admin/support";
import { rateLimit } from "@/lib/security/rate-limit";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { supportCases, supportNotes } = schema;

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

  // Dono do caso, nota e bump de updated_at são uma única decisão: transação.
  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: supportCases.id })
        .from(supportCases)
        .where(and(eq(supportCases.id, caseId), eq(supportCases.userId, account.accountOwnerId)))
        .limit(1);
      if (!existing) {
        throw new Error("case_not_found");
      }
      await tx.insert(supportNotes).values({ caseId, authorAdminId: null, body: body.trim(), isInternal: false });
      await tx.update(supportCases).set({ updatedAt: new Date() }).where(eq(supportCases.id, caseId));
    });
  } catch (error) {
    if (error instanceof Error && error.message === "case_not_found") {
      return NextResponse.json({ error: "case_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "note_create_failed" }, { status: 500 });
  }
  return NextResponse.json({ created: true }, { headers: { "cache-control": "no-store" } });
}
