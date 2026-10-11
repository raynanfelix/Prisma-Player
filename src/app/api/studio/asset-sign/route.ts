import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownedAssetPaths } from "@/lib/player/assets";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;
  const { account } = gate;

  const parsed = await readJsonBody<{ videoId?: unknown; assets?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const videoId = typeof parsed.body?.videoId === "string" ? parsed.body.videoId : "";
  if (!uuid.test(videoId)) return NextResponse.json({ error: "invalid_video_id" }, { status: 400 });

  // Só assina caminhos cuja primeira pasta é o titular da conta: um usuário
  // autenticado não consegue assinar assets de outro workspace mesmo que a RLS
  // do bucket seja mal configurada no futuro.
  const safeEntries = Object.entries(ownedAssetPaths(parsed.body?.assets, account.accountOwnerId));
  if (safeEntries.length === 0) return NextResponse.json({ signedUrls: {} });

  const admin = createAdminClient();
  const results: Record<string, string> = {};
  await Promise.all(safeEntries.map(async ([kind, path]) => {
    const { data, error } = await admin.storage.from("player-assets").createSignedUrl(path, 3600);
    if (!error && data?.signedUrl) results[kind] = data.signedUrl;
  }));
  return NextResponse.json({ signedUrls: results }, { headers: { "cache-control": "private, no-store" } });
}
