import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";

/**
 * Exportação dos dados pessoais do titular (LGPD, art. 18, V — portabilidade).
 *
 * Devolve apenas dados do próprio usuário, em JSON legível. Não inclui eventos
 * de espectadores das VSLs: esses são dados de terceiros, dos quais o cliente é
 * controlador e a Prisma operadora — a exportação deles sai pelo relatório de
 * público, não por aqui.
 */
export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = await rateLimit(request, `account-export:${userId}`, { max: 5, windowMs: 60 * 60_000 });
  if (limited) return limited;

  const admin = createAdminClient();
  const [profile, access, subscription, videos, folders, players, wallet, ledger, inbox, securityEvents, controls] = await Promise.all([
    admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
    admin.from("account_access").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("videos").select("id,title,mime_type,size_bytes,status,duration_seconds,created_at").eq("user_id", userId).limit(2000),
    admin.from("video_folders").select("id,name,created_at").eq("user_id", userId).limit(500),
    admin.from("player_configs").select("id,video_id,config,allowed_domains,published,created_at").eq("user_id", userId).limit(2000),
    admin.from("ai_credit_wallets").select("balance,lifetime_purchased,lifetime_used").eq("user_id", userId).maybeSingle(),
    admin.from("ai_credit_ledger").select("amount,reason,reference,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(500),
    admin.from("user_inbox").select("kind,title,message,created_at,read_at").eq("user_id", userId).limit(500),
    admin.from("security_events").select("event_type,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(500),
    admin.from("intelligence_controls").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    userId,
    profile: profile.data ?? null,
    access: access.data ?? null,
    subscription: subscription.data ?? null,
    intelligenceControls: controls.data ?? null,
    aiCredits: { wallet: wallet.data ?? null, ledger: ledger.data ?? [] },
    videos: videos.data ?? [],
    folders: folders.data ?? [],
    players: players.data ?? [],
    inbox: inbox.data ?? [],
    securityEvents: securityEvents.data ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="prisma-player-dados-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
