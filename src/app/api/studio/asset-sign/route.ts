import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { ownedAssetPaths } from "@/lib/player/assets";
import { signR2ReadUrl } from "@/lib/storage/r2";

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
  // autenticado não consegue assinar assets de outro workspace mesmo que uma
  // autorização futura no bucket seja mal configurada.
  const safeEntries = Object.entries(ownedAssetPaths(parsed.body?.assets, account.accountOwnerId));
  if (safeEntries.length === 0) return NextResponse.json({ signedUrls: {} });

  const results: Record<string, string> = {};
  await Promise.all(safeEntries.map(async ([kind, path]) => {
    const signedUrl = await signR2ReadUrl(path, 3600).catch(() => null);
    if (signedUrl) results[kind] = signedUrl;
  }));
  return NextResponse.json({ signedUrls: results }, { headers: { "cache-control": "private, no-store" } });
}
