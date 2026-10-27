import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const {
  accountAccess,
  accountTeamInvites,
  accountTeamMembers,
  aiCreditLedger,
  aiCreditWallets,
  billingChurnSurveys,
  billingCheckouts,
  intelligenceControls,
  playerConfigs,
  profiles,
  securityEvents,
  subscriptions,
  userInbox,
  videoFolders,
  videos,
} = schema;

/**
 * Exportação dos dados pessoais do titular (LGPD, art. 18, II e V - acesso e
 * portabilidade; resposta completa no prazo do art. 19, II).
 *
 * Devolve apenas dados do próprio usuário, em JSON legível. Não inclui eventos
 * de espectadores das VSLs: esses são dados de terceiros, dos quais o cliente é
 * controlador e a Prisma operadora - a exportação deles sai pelo relatório de
 * público, não por aqui.
 *
 * Cobertura da conta: perfil, acesso, assinatura, controles, créditos+ledger,
 * vídeos, pastas, players, inbox, eventos de segurança, participação em
 * equipes, convites enviados, checkouts e pesquisas de churn (feedback é dado
 * do titular). Dados mantidos por OPERADORES (Stripe, PostHog) não são
 * replicados aqui: o dump informa isso em `thirdPartyData` com o canal para
 * pedido direto ao provedor (art. 18, VII - compartilhamento).
 */

const camelToSnake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/**
 * Converte uma linha Drizzle para o dump snake_case do export: renomeia só as
 * chaves de topo (colunas reais) e serializa timestamps. Valores jsonb (ex.:
 * `player_configs.config`) passam intactos - são dados do usuário, não colunas.
 */
function toJsonRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [camelToSnake(key), value instanceof Date ? value.toISOString() : value]),
  );
}

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = await rateLimit(request, `account-export:${userId}`, { max: 5, windowMs: 60 * 60_000 });
  if (limited) return limited;

  const VIDEO_EXPORT_LIMIT = 2000;
  const FOLDER_EXPORT_LIMIT = 500;
  const [
    profileRows,
    accessRows,
    subscriptionRows,
    videoRows,
    videoTotalRows,
    folderRows,
    folderTotalRows,
    playerRows,
    walletRows,
    ledgerRows,
    inboxRows,
    securityEventRows,
    controlRows,
    teamMemberRows,
    teamInviteRows,
    checkoutRows,
    churnRows,
  ] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.id, userId)).limit(1),
    db.select().from(accountAccess).where(eq(accountAccess.userId, userId)).limit(1),
    db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1),
    db.select({ id: videos.id, title: videos.title, mimeType: videos.mimeType, sizeBytes: videos.sizeBytes, status: videos.status, durationSeconds: videos.durationSeconds, createdAt: videos.createdAt }).from(videos).where(eq(videos.userId, userId)).limit(VIDEO_EXPORT_LIMIT),
    db.select({ count: sql<number>`count(*)::int` }).from(videos).where(eq(videos.userId, userId)),
    db.select({ id: videoFolders.id, name: videoFolders.name, createdAt: videoFolders.createdAt }).from(videoFolders).where(eq(videoFolders.userId, userId)).limit(FOLDER_EXPORT_LIMIT),
    db.select({ count: sql<number>`count(*)::int` }).from(videoFolders).where(eq(videoFolders.userId, userId)),
    db.select({ id: playerConfigs.id, videoId: playerConfigs.videoId, config: playerConfigs.config, allowedDomains: playerConfigs.allowedDomains, published: playerConfigs.published, createdAt: playerConfigs.createdAt }).from(playerConfigs).where(eq(playerConfigs.userId, userId)).limit(2000),
    db.select({ balance: aiCreditWallets.balance, lifetimePurchased: aiCreditWallets.lifetimePurchased, lifetimeUsed: aiCreditWallets.lifetimeUsed }).from(aiCreditWallets).where(eq(aiCreditWallets.userId, userId)).limit(1),
    db.select({ amount: aiCreditLedger.amount, reason: aiCreditLedger.reason, reference: aiCreditLedger.reference, createdAt: aiCreditLedger.createdAt }).from(aiCreditLedger).where(eq(aiCreditLedger.userId, userId)).orderBy(desc(aiCreditLedger.createdAt)).limit(500),
    db.select({ kind: userInbox.kind, title: userInbox.title, message: userInbox.message, createdAt: userInbox.createdAt, readAt: userInbox.readAt }).from(userInbox).where(eq(userInbox.userId, userId)).limit(500),
    db.select({ eventType: securityEvents.eventType, createdAt: securityEvents.createdAt }).from(securityEvents).where(eq(securityEvents.userId, userId)).orderBy(desc(securityEvents.createdAt)).limit(500),
    // LGPD Art. 6º III (minimização): webhookUrl e alertWebhookUrl podem conter
    // tokens assinados que não devem ser expostos no dump de portabilidade.
    // A rota GET /api/intelligence/controls já mascara esses campos; o export
    // segue a mesma semântica para evitar vazamento em arquivo baixável.
    db.select({
      automaticReportsEnabled: intelligenceControls.automaticReportsEnabled,
      reportFrequency: intelligenceControls.reportFrequency,
      reportEmail: intelligenceControls.reportEmail,
      reportVideoIds: intelligenceControls.reportVideoIds,
      audienceSyncEnabled: intelligenceControls.audienceSyncEnabled,
      audienceRetentionThreshold: intelligenceControls.audienceRetentionThreshold,
      outgoingWebhooksEnabled: intelligenceControls.outgoingWebhooksEnabled,
      webhookEvents: intelligenceControls.webhookEvents,
      conversionAlertsEnabled: intelligenceControls.conversionAlertsEnabled,
      conversionDropThreshold: intelligenceControls.conversionDropThreshold,
      alertWebhookEnabled: intelligenceControls.alertWebhookEnabled,
      alertVideoIds: intelligenceControls.alertVideoIds,
      updatedAt: intelligenceControls.updatedAt,
    }).from(intelligenceControls).where(eq(intelligenceControls.userId, userId)).limit(1),
    db.select({ teamId: accountTeamMembers.teamId, role: accountTeamMembers.role, status: accountTeamMembers.status, joinedAt: accountTeamMembers.joinedAt }).from(accountTeamMembers).where(eq(accountTeamMembers.userId, userId)).limit(100),
    db.select({ id: accountTeamInvites.id, email: accountTeamInvites.email, role: accountTeamInvites.role, status: accountTeamInvites.status, invitedBy: accountTeamInvites.invitedBy, expiresAt: accountTeamInvites.expiresAt, createdAt: accountTeamInvites.createdAt }).from(accountTeamInvites).where(eq(accountTeamInvites.invitedBy, userId)).limit(200),
    db.select({ id: billingCheckouts.id, checkoutType: billingCheckouts.checkoutType, amountCents: billingCheckouts.amountCents, currency: billingCheckouts.currency, status: billingCheckouts.status, paidAt: billingCheckouts.paidAt, receiptUrl: billingCheckouts.receiptUrl, createdAt: billingCheckouts.createdAt }).from(billingCheckouts).where(eq(billingCheckouts.userId, userId)).orderBy(desc(billingCheckouts.createdAt)).limit(200),
    db.select({ reason: billingChurnSurveys.reason, feedback: billingChurnSurveys.feedback, createdAt: billingChurnSurveys.createdAt }).from(billingChurnSurveys).where(eq(billingChurnSurveys.userId, userId)).orderBy(desc(billingChurnSurveys.createdAt)).limit(50),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    userId,
    profile: profileRows[0] ? toJsonRow(profileRows[0]) : null,
    access: accessRows[0] ? toJsonRow(accessRows[0]) : null,
    subscription: subscriptionRows[0] ? toJsonRow(subscriptionRows[0]) : null,
    intelligenceControls: controlRows[0] ? toJsonRow(controlRows[0]) : null,
    aiCredits: { wallet: walletRows[0] ? toJsonRow(walletRows[0]) : null, ledger: ledgerRows.map(toJsonRow) },
    videos: videoRows.map(toJsonRow),
    videosMeta: {
      exported: videoRows.length,
      total: videoTotalRows[0]?.count ?? 0,
      truncated: (videoTotalRows[0]?.count ?? 0) > VIDEO_EXPORT_LIMIT,
      limit: VIDEO_EXPORT_LIMIT,
      note: (videoTotalRows[0]?.count ?? 0) > VIDEO_EXPORT_LIMIT
        ? `Export limitado a ${VIDEO_EXPORT_LIMIT} vídeos por requisição. Para obter o conjunto completo, solicite via privacidade@prismaplayer.online.`
        : undefined,
    },
    folders: folderRows.map(toJsonRow),
    foldersMeta: {
      exported: folderRows.length,
      total: folderTotalRows[0]?.count ?? 0,
      truncated: (folderTotalRows[0]?.count ?? 0) > FOLDER_EXPORT_LIMIT,
      limit: FOLDER_EXPORT_LIMIT,
      note: (folderTotalRows[0]?.count ?? 0) > FOLDER_EXPORT_LIMIT
        ? `Export limitado a ${FOLDER_EXPORT_LIMIT} pastas por requisição. Para obter o conjunto completo, solicite via privacidade@prismaplayer.online.`
        : undefined,
    },
    players: playerRows.map(toJsonRow),
    inbox: inboxRows.map(toJsonRow),
    securityEvents: securityEventRows.map(toJsonRow),
    teamMemberships: teamMemberRows.map(toJsonRow),
    teamInvites: teamInviteRows.map(toJsonRow),
    billingCheckouts: checkoutRows.map(toJsonRow),
    churnSurveys: churnRows.map(toJsonRow),
    thirdPartyData: {
      note: "Dados tratados por operadores (Stripe: customer, assinaturas, faturas) permanecem nos sistemas deles e não são replicados neste arquivo. Para exercer direitos sobre esses dados, solicite também diretamente ao provedor, ou pelo nosso canal de privacidade.",
      providers: ["Stripe"],
      privacyPolicyUrl: "/privacy",
      privacyContactEmail: "privacidade@prismaplayer.online",
    },
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="prisma-player-dados-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
