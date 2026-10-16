import { NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { getCurrentUserId, getAuth } from "@/lib/auth/server";
import { readJsonBody } from "@/lib/api/request";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { recordSecurityEvent } from "@/lib/security/auth-events";
import { deleteR2Object } from "@/lib/storage/r2";

/**
 * Exclusão de conta e dos dados associados (LGPD, art. 18, VI).
 *
 * Operação irreversível: exige a senha atual (reautenticação no Managed
 * Better Auth via sign-in do próprio auth) e a confirmação textual "EXCLUIR",
 * para que uma sessão roubada não consiga apagar a conta.
 *
 * O schema de produto NÃO tem FK para `neon_auth."user"`, então não existe
 * cascade automático ao apagar o usuário da auth. A deleção de cada tabela de
 * produto é EXPLÍCITA aqui, dentro de uma transação — é o que garante o
 * direito do titular.
 *
 * Storage é somente R2 desde a migração (CHECK em `videos.storage_provider`),
 * então os objetos de vídeo são removidos via deleteR2Object antes da deleção
 * das linhas. Assets de player sem helper de listagem no R2 ficam como aviso
 * (mesma tolerância a órfãos do fluxo anterior).
 */

/** Reautenticação: sign-in do Managed Better Auth valida a senha atual. */
async function passwordMatches(email: string, password: string) {
  const { error } = await getAuth().signIn.email({ email, password });
  return !error;
}

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = await rateLimit(request, `account-delete:${userId}`, { max: 3, windowMs: 30 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ password?: unknown; confirm?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const password = typeof parsed.body?.password === "string" ? parsed.body.password : "";
  if (parsed.body?.confirm !== "EXCLUIR") return NextResponse.json({ error: "confirmation_required", message: 'Envie confirm: "EXCLUIR" para confirmar a exclusão.' }, { status: 400 });
  if (!password) return NextResponse.json({ error: "password_required" }, { status: 400 });

  const session = await getAuth().getSession();
  const email = session.data?.user?.email ?? null;
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await passwordMatches(email, password))) {
    await recordSecurityEvent("account_delete_denied", { userId });
    return NextResponse.json({ error: "invalid_password" }, { status: 403 });
  }

  // Um titular com equipe apagaria o workspace inteiro junto: exige esvaziar a
  // equipe antes, para que a decisão seja explícita.
  const [team] = await db
    .select({ id: schema.accountTeams.id })
    .from(schema.accountTeams)
    .where(eq(schema.accountTeams.ownerId, userId))
    .limit(1);
  if (team) {
    const remaining = await db
      .select({ id: schema.accountTeamMembers.id })
      .from(schema.accountTeamMembers)
      .where(and(eq(schema.accountTeamMembers.teamId, team.id), eq(schema.accountTeamMembers.status, "active"), ne(schema.accountTeamMembers.userId, userId)))
      .limit(1);
    if (remaining.length > 0) {
      return NextResponse.json({ error: "team_not_empty", message: "Remova os outros membros da equipe antes de excluir a conta." }, { status: 409 });
    }
  }

  const videos = await db
    .select({ objectPath: schema.videos.objectPath })
    .from(schema.videos)
    .where(eq(schema.videos.userId, userId))
    .limit(2000);

  const storageErrors: string[] = [];
  for (const video of videos) {
    await deleteR2Object(video.objectPath).catch((reason: unknown) =>
      storageErrors.push(`r2:${video.objectPath}: ${reason instanceof Error ? reason.message : "unknown"}`),
    );
  }
  // Assets de player (R2, prefixo por usuário) não têm listagem aqui; tratamos
  // como órfãos toleráveis — problema de custo, não de privacidade do titular.
  if (videos.length > 0) storageErrors.push("player-assets: cleanup manual pendente (sem listagem R2)");
  if (storageErrors.length) console.error("account_delete_storage_cleanup_failed", { userId, storageErrors });

  // Deleção explícita de TODAS as tabelas de produto (LGPD). Filhos com FK
  // composta para videos cascatesm, mas os deletes explícitos mantêm a rota
  // correta mesmo se o grafo de FKs mudar. rate_limits expira sozinho;
  // admin_audit_log preserva o histórico de auditoria (pseudonimizado).
  try {
    await db.transaction(async (tx) => {
      await tx.delete(schema.subscriptions).where(eq(schema.subscriptions.userId, userId));
      await tx.delete(schema.billingCheckouts).where(eq(schema.billingCheckouts.userId, userId));
      await tx.delete(schema.billingCustomers).where(eq(schema.billingCustomers.userId, userId));
      await tx.delete(schema.aiCreditLedger).where(eq(schema.aiCreditLedger.userId, userId));
      await tx.delete(schema.aiCreditCheckouts).where(eq(schema.aiCreditCheckouts.userId, userId));
      await tx.delete(schema.aiCreditWallets).where(eq(schema.aiCreditWallets.userId, userId));
      await tx.delete(schema.userInbox).where(eq(schema.userInbox.userId, userId));
      await tx.delete(schema.accountAccess).where(eq(schema.accountAccess.userId, userId));
      await tx.delete(schema.intelligenceControls).where(eq(schema.intelligenceControls.userId, userId));
      await tx.delete(schema.accountSecuritySettings).where(eq(schema.accountSecuritySettings.userId, userId));
      await tx.delete(schema.securityEvents).where(eq(schema.securityEvents.userId, userId));
      await tx.delete(schema.playerEvents).where(eq(schema.playerEvents.userId, userId));
      await tx.delete(schema.abTestVariants).where(eq(schema.abTestVariants.userId, userId));
      await tx.delete(schema.abTests).where(eq(schema.abTests.userId, userId));
      await tx.delete(schema.abTestFolders).where(eq(schema.abTestFolders.userId, userId));
      await tx.delete(schema.videoDailyStats).where(eq(schema.videoDailyStats.userId, userId));
      await tx.delete(schema.aiAnalysisJobs).where(eq(schema.aiAnalysisJobs.userId, userId));
      await tx.delete(schema.embedMonitors).where(eq(schema.embedMonitors.userId, userId));
      await tx.delete(schema.elementExperimentVariants).where(eq(schema.elementExperimentVariants.userId, userId));
      await tx.delete(schema.elementExperiments).where(eq(schema.elementExperiments.userId, userId));
      await tx.delete(schema.videoVersions).where(eq(schema.videoVersions.userId, userId));
      await tx.delete(schema.videoLiveSessions).where(eq(schema.videoLiveSessions.userId, userId));
      await tx.delete(schema.videoEvents).where(eq(schema.videoEvents.userId, userId));
      await tx.delete(schema.playerConfigs).where(eq(schema.playerConfigs.userId, userId));
      await tx.delete(schema.videos).where(eq(schema.videos.userId, userId));
      await tx.delete(schema.videoFolders).where(eq(schema.videoFolders.userId, userId));
      await tx.delete(schema.supportCases).where(eq(schema.supportCases.userId, userId));
      await tx.delete(schema.accountTeamMembers).where(eq(schema.accountTeamMembers.userId, userId));
      await tx.delete(schema.accountTeamInvites).where(eq(schema.accountTeamInvites.acceptedBy, userId));
      await tx.delete(schema.accountTeams).where(eq(schema.accountTeams.ownerId, userId));
      await tx.delete(schema.profiles).where(eq(schema.profiles.id, userId));
    });
  } catch (reason) {
    console.error("account_delete_data_failed", { userId, message: reason instanceof Error ? reason.message : "unknown" });
    return NextResponse.json({ error: "account_delete_failed" }, { status: 500 });
  }

  // Por último, o usuário no Neon Auth (schema neon_auth, gerenciado pela
  // Neon). O schema do Better Auth tem ON DELETE CASCADE de session/account/
  // verification para user — uma deleção encerra todas as sessões.
  try {
    await db.execute(sql`DELETE FROM neon_auth."user" WHERE id = ${userId}`);
  } catch (reason) {
    console.error("account_delete_auth_failed", { userId, message: reason instanceof Error ? reason.message : "unknown" });
    return NextResponse.json({ error: "account_delete_failed", message: "Dados do titular removidos; falhou a remoção do usuário na auth." }, { status: 500 });
  }

  await getAuth().signOut().catch(() => undefined);
  return NextResponse.json({ deleted: true, storageWarnings: storageErrors.length });
}
