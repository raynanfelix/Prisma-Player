import { NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { getCurrentUserId, getAuth } from "@/lib/auth/server";
import { readJsonBody } from "@/lib/api/request";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { recordSecurityEvent } from "@/lib/security/auth-events";
import { alertOperations } from "@/lib/security/alert-webhook";
import { getStripe } from "@/lib/billing/stripe/client";
import { deleteR2Object } from "@/lib/storage/r2";

/**
 * Exclusão de conta e dos dados associados (LGPD, art. 18, VI).
 *
 * Operação irreversível: exige reautenticação (senha atual via sign-in do
 * Managed Better Auth OU código OTP de e-mail, para contas SSO-only sem
 * senha) e a confirmação textual "EXCLUIR", para que uma sessão roubada não
 * consiga apagar a conta.
 *
 * Step-up OTP (P1 da spec de conta): o mesmo mecanismo de dois estágios da
 * troca de senha (api/account/password): { stage: "request-otp" } envia o
 * código (emailOtp.sendVerificationOtp, type "email-verification") e o POST
 * de exclusão valida com signIn.emailOtp. A verificação acontece NO MOMENTO
 * da exclusão (mais forte que confiar num claim de sessão recente, que teria
 * janela de replay). A sessão extra criada pelo auto sign-in do OTP é
 * destruída pelo signOut final (mesma lição do V7).
 *
 * O schema de produto NÃO tem FK para `neon_auth."user"`, então não existe
 * cascade automático ao apagar o usuário da auth. A deleção de cada tabela de
 * produto é EXPLÍCITA aqui, dentro de uma transação - é o que garante o
 * direito do titular.
 *
 * ANTES do wipe, uma assinatura Stripe VIVA é cancelada no provedor
 * (LGPD, art. 18, VI + boa-fé do art. 6º): apagar a conta e deixar a
 * cobrança ativa continuaria faturando um titular sem relação. O
 * cancelamento é IMEDIATO (não cancel_at_period_end) porque a conta está
 * sendo eliminada; sem cancelamento confirmado o wipe NÃO acontece
 * (fail-closed: o titular tenta de novo e nenhum dado é perdido).
 *
 * Storage é somente R2 desde a migração (CHECK em `videos.storage_provider`),
 * então os objetos de vídeo são removidos via deleteR2Object antes da deleção
 * das linhas. Assets de player sem helper de listagem no R2 ficam como aviso
 * (mesma tolerância a órfãos do fluxo anterior).
 */

/** Reautenticação por senha: sign-in do Managed Better Auth valida a senha atual. */
async function passwordMatches(email: string, password: string) {
  const { error } = await getAuth().signIn.email({ email, password });
  return !error;
}

/** E-mail da sessão (alvo do OTP e do cleanup de convites). */
async function sessionEmail(): Promise<string | null> {
  const session = await getAuth().getSession();
  const email = session.data?.user?.email ?? null;
  return email ? email.trim().toLowerCase() : null;
}

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonBody<{ password?: unknown; otp?: unknown; confirm?: unknown; stage?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  // Estágio 1 do step-up (contas SSO-only): envia o código para o e-mail da
  // sessão. Balde apertado porque dispara e-mail real (mesma calibragem da
  // troca de senha).
  if (body?.stage === "request-otp") {
    const otpLimited = await rateLimit(request, `account-delete-otp:${userId}`, { max: 3, windowMs: 10 * 60_000, failClosed: true });
    if (otpLimited) return otpLimited;
    const email = await sessionEmail();
    if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { error } = await getAuth().emailOtp.sendVerificationOtp({ email, type: "email-verification" });
    if (error) {
      await recordSecurityEvent("account_delete_otp_send_failed", { userId });
      return NextResponse.json({ error: "otp_send_failed", message: "Não foi possível enviar o código. Tente novamente em alguns minutos." }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  }

  const limited = await rateLimit(request, `account-delete:${userId}`, { max: 3, windowMs: 30 * 60_000, failClosed: true });
  if (limited) return limited;

  const password = typeof body?.password === "string" ? body.password : "";
  const otp = typeof body?.otp === "string" ? body.otp.trim() : "";
  if (parsed.body?.confirm !== "EXCLUIR") return NextResponse.json({ error: "confirmation_required", message: 'Envie confirm: "EXCLUIR" para confirmar a exclusão.' }, { status: 400 });
  if (!password && !otp) return NextResponse.json({ error: "password_or_otp_required", message: "Informe a senha ou o código de 6 dígitos enviado por e-mail." }, { status: 400 });

  const email = await sessionEmail();
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (password) {
    if (!(await passwordMatches(email, password))) {
      await recordSecurityEvent("account_delete_denied", { userId });
      return NextResponse.json({ error: "invalid_password" }, { status: 403 });
    }
  } else {
    // Step-up OTP (contas SSO-only): signIn.emailOtp confirma a identidade
    // pelo e-mail. Mesmo padrão da troca de senha (api/account/password).
    if (!/^\d{6}$/.test(otp)) return NextResponse.json({ error: "invalid_otp_format", message: "Digite os 6 dígitos do código." }, { status: 400 });
    const otpResult = await getAuth().signIn.emailOtp({ email, otp });
    if (otpResult.error) {
      await recordSecurityEvent("account_delete_denied", { userId });
      return NextResponse.json({ error: "invalid_otp", message: "Código inválido ou expirado. Solicite um novo código." }, { status: 400, headers: { "cache-control": "no-store" } });
    }
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

  // Assinatura Stripe viva: cancelada ANTES do wipe. Status que seguem
  // faturando no provedor: active, past_due e suspended (pausada, retomável).
  // O id local morre no wipe - depois dele não haveria como cancelar.
  const [subscription] = await db
    .select({
      provider: schema.subscriptions.provider,
      providerSubscriptionId: schema.subscriptions.providerSubscriptionId,
      status: schema.subscriptions.status,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);

  // Id do provedor na tabela de customers: âncora do scrub de
  // payment_webhook_events (a tabela não tem user_id; o PII do titular vive
  // no payload jsonb, indexado pelos ids do provedor).
  const [customer] = await db
    .select({ providerCustomerId: schema.billingCustomers.providerCustomerId })
    .from(schema.billingCustomers)
    .where(eq(schema.billingCustomers.userId, userId))
    .limit(1);

  const liveStripeSubscriptionId =
    subscription?.provider === "stripe" &&
    ["active", "past_due", "suspended"].includes(subscription.status) &&
    subscription.providerSubscriptionId
      ? subscription.providerSubscriptionId
      : null;

  if (liveStripeSubscriptionId) {
    try {
      await getStripe().subscriptions.cancel(liveStripeSubscriptionId, { prorate: false });
    } catch (reason) {
      // resource_missing = a assinatura já não existe na Stripe (cancelada
      // fora, expirada): o efeito desejado já foi alcançado, segue o wipe.
      const code = (reason as { code?: string } | null)?.code;
      if (code !== "resource_missing") {
        await alertOperations({
          title: "Exclusão de conta bloqueada: falha ao cancelar assinatura Stripe",
          detail: `subscription ${liveStripeSubscriptionId} do user ${userId}`,
          kind: "account_delete_stripe_cancel_failed",
        });
        await recordSecurityEvent("account_delete_stripe_cancel_failed", {
          userId,
          metadata: { subscriptionId: liveStripeSubscriptionId },
        });
        return NextResponse.json(
          {
            error: "stripe_cancel_failed",
            message: "Não foi possível cancelar sua assinatura no Stripe agora. Nenhum dado foi apagado; tente novamente em instantes.",
          },
          { status: 503 },
        );
      }
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
  // como órfãos toleráveis - problema de custo, não de privacidade do titular.
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
      // Resíduo do e-mail do titular: convites emitidos por OUTRAS equipes
      // para o e-mail dele não cascam pela equipe própria. Apaga TODOS os
      // registros com esse e-mail (pendentes ainda concederiam entrada; os
      // demais são só resíduo de PII).
      await tx.delete(schema.accountTeamInvites).where(eq(schema.accountTeamInvites.email, email));
      // Tokens de integração (webhooks com credenciais) e feedback de churn.
      await tx.delete(schema.accountIntegrations).where(eq(schema.accountIntegrations.accountOwnerId, userId));
      await tx.delete(schema.billingChurnSurveys).where(eq(schema.billingChurnSurveys.userId, userId));
      await tx.delete(schema.accountTeams).where(eq(schema.accountTeams.ownerId, userId));
      await tx.delete(schema.profiles).where(eq(schema.profiles.id, userId));
      // Scrub do ledger de webhooks (idempotência preservada: providerEventId
      // continua lá para deduplicar reenvio; o conteúdo PII sai). Sem coluna
      // user_id em payment_webhook_events, a atribuição é pelos ids do
      // provedor conhecidos da conta. Sem ids conhecidos (nunca assinou e
      // nunca abriu checkout) não há linhas atribuíveis: pendência
      // documentada, não é silêncio.
      const providerIds = [subscription?.providerSubscriptionId, customer?.providerCustomerId]
        .filter((value): value is string => typeof value === "string" && value.length > 0);
      for (const providerId of providerIds) {
        await tx.update(schema.paymentWebhookEvents)
          .set({ payload: sql`'{}'::jsonb`, processingError: null })
          .where(sql`${schema.paymentWebhookEvents.payload}::text like ${`%${providerId}%`}`);
      }
    });
  } catch (reason) {
    console.error("account_delete_data_failed", { userId, message: reason instanceof Error ? reason.message : "unknown" });
    return NextResponse.json({ error: "account_delete_failed" }, { status: 500 });
  }

  // Por último, o usuário no Neon Auth (schema neon_auth, gerenciado pela
  // Neon). O schema do Better Auth tem ON DELETE CASCADE de session/account/
  // verification para user - uma deleção encerra todas as sessões.
  try {
    await db.execute(sql`DELETE FROM neon_auth."user" WHERE id = ${userId}`);
  } catch (reason) {
    console.error("account_delete_auth_failed", { userId, message: reason instanceof Error ? reason.message : "unknown" });
    return NextResponse.json({ error: "account_delete_failed", message: "Dados do titular removidos; falhou a remoção do usuário na auth." }, { status: 500 });
  }

  await getAuth().signOut().catch(() => undefined);
  return NextResponse.json({ deleted: true, storageWarnings: storageErrors.length });
}
