import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { getCurrentUserId } from "@/lib/auth/server";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isoOrNull } from "@/lib/datetime";

const { accountAccess, userInbox } = schema;

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, `account-trial:${userId}`, { max: 5, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;
  const parsed = await readJsonBody<{ action?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const action = body?.action;
  if (action !== "activate" && action !== "later") return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  const now = new Date();
  const update = action === "activate" ? {
    onboardingCompleted: true,
    trialStatus: "active" as const,
    trialStartedAt: now,
    trialEndsAt: new Date(now.getTime() + 14 * 86400000),
    updatedAt: now,
  } : { onboardingCompleted: true, updatedAt: now };
  // Ativar só é permitido com trial 'available'; o RETURNING vazio (nenhuma
  // linha atualizada) é o sinal de trial indisponível.
  const [row] = await db.update(accountAccess)
    .set(update)
    .where(action === "activate"
      ? and(eq(accountAccess.userId, userId), eq(accountAccess.trialStatus, "available"))
      : eq(accountAccess.userId, userId))
    .returning({ trialStatus: accountAccess.trialStatus, trialEndsAt: accountAccess.trialEndsAt });
  if (action === "activate" && !row) return NextResponse.json({ error: "trial_unavailable" }, { status: 409 });
  if (action === "activate") {
    // Marcar o welcome como lido e inserir o aviso de trial são escritas do
    // mesmo evento: uma transação.
    await db.transaction(async (tx) => {
      await tx.update(userInbox).set({ readAt: now })
        .where(and(eq(userInbox.userId, userId), eq(userInbox.kind, "welcome"), isNull(userInbox.readAt)));
      await tx.insert(userInbox).values({
        userId,
        kind: "trial",
        title: "Teste gratuito ativado",
        message: "Voce tem acesso completo por 14 dias. Aproveite para publicar, medir e otimizar suas VSLs.",
      });
    });
  }
  return NextResponse.json({
    ok: true,
    ...(row ? { trial_status: row.trialStatus, trial_ends_at: isoOrNull(row.trialEndsAt) } : {}),
  });
}
