import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const {
  accountAccess,
  aiCreditLedger,
  aiCreditWallets,
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
 * Exportação dos dados pessoais do titular (LGPD, art. 18, V — portabilidade).
 *
 * Devolve apenas dados do próprio usuário, em JSON legível. Não inclui eventos
 * de espectadores das VSLs: esses são dados de terceiros, dos quais o cliente é
 * controlador e a Prisma operadora — a exportação deles sai pelo relatório de
 * público, não por aqui.
 */

const camelToSnake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/**
 * Converte uma linha Drizzle para o dump snake_case do export: renomeia só as
 * chaves de topo (colunas reais) e serializa timestamps. Valores jsonb (ex.:
 * `player_configs.config`) passam intactos — são dados do usuário, não colunas.
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

  const [profileRows, accessRows, subscriptionRows, videoRows, folderRows, playerRows, walletRows, ledgerRows, inboxRows, securityEventRows, controlRows] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.id, userId)).limit(1),
    db.select().from(accountAccess).where(eq(accountAccess.userId, userId)).limit(1),
    db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1),
    db.select({ id: videos.id, title: videos.title, mimeType: videos.mimeType, sizeBytes: videos.sizeBytes, status: videos.status, durationSeconds: videos.durationSeconds, createdAt: videos.createdAt }).from(videos).where(eq(videos.userId, userId)).limit(2000),
    db.select({ id: videoFolders.id, name: videoFolders.name, createdAt: videoFolders.createdAt }).from(videoFolders).where(eq(videoFolders.userId, userId)).limit(500),
    db.select({ id: playerConfigs.id, videoId: playerConfigs.videoId, config: playerConfigs.config, allowedDomains: playerConfigs.allowedDomains, published: playerConfigs.published, createdAt: playerConfigs.createdAt }).from(playerConfigs).where(eq(playerConfigs.userId, userId)).limit(2000),
    db.select({ balance: aiCreditWallets.balance, lifetimePurchased: aiCreditWallets.lifetimePurchased, lifetimeUsed: aiCreditWallets.lifetimeUsed }).from(aiCreditWallets).where(eq(aiCreditWallets.userId, userId)).limit(1),
    db.select({ amount: aiCreditLedger.amount, reason: aiCreditLedger.reason, reference: aiCreditLedger.reference, createdAt: aiCreditLedger.createdAt }).from(aiCreditLedger).where(eq(aiCreditLedger.userId, userId)).orderBy(desc(aiCreditLedger.createdAt)).limit(500),
    db.select({ kind: userInbox.kind, title: userInbox.title, message: userInbox.message, createdAt: userInbox.createdAt, readAt: userInbox.readAt }).from(userInbox).where(eq(userInbox.userId, userId)).limit(500),
    db.select({ eventType: securityEvents.eventType, createdAt: securityEvents.createdAt }).from(securityEvents).where(eq(securityEvents.userId, userId)).orderBy(desc(securityEvents.createdAt)).limit(500),
    db.select().from(intelligenceControls).where(eq(intelligenceControls.userId, userId)).limit(1),
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
    folders: folderRows.map(toJsonRow),
    players: playerRows.map(toJsonRow),
    inbox: inboxRows.map(toJsonRow),
    securityEvents: securityEventRows.map(toJsonRow),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="prisma-player-dados-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
