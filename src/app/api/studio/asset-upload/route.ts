import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAYER_ASSET_KINDS } from "@/lib/player/assets";
import { rateLimit } from "@/lib/security/rate-limit";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_KINDS = new Set<string>(PLAYER_ASSET_KINDS);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "text/vtt"]);
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Assinaturas de arquivo. O `file.type` vem do navegador e é escolhido pelo
 * cliente: sem checar os bytes reais, um executável renomeado para .png passa
 * pelo filtro de MIME e fica hospedado num domínio da Prisma.
 */
const MAGIC_BYTES: Array<{ mime: string; test: (bytes: Uint8Array) => boolean }> = [
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/webp", test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
];

function contentMatchesMime(buffer: Buffer, contentType: string): boolean {
  // WebVTT é texto: exige o cabeçalho obrigatório do formato.
  if (contentType === "text/vtt") return buffer.subarray(0, 6).toString("utf8").replace(/^﻿/, "").startsWith("WEBVTT");
  const signature = MAGIC_BYTES.find((entry) => entry.mime === contentType);
  return signature ? signature.test(new Uint8Array(buffer.subarray(0, 16))) : false;
}

export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;
  const { account } = gate;

  const limited = await rateLimit(request, `asset-upload:${account.accountOwnerId}`, { max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BYTES * 2) return NextResponse.json({ error: "file_too_large" }, { status: 413 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  const videoId = String(form.get("videoId") ?? "");
  const kind = String(form.get("kind") ?? "");
  if (!uuid.test(videoId) || !ALLOWED_KINDS.has(kind)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "invalid_file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  const contentType = (file.type || "").toLowerCase();
  if (!ALLOWED_MIME.has(contentType)) return NextResponse.json({ error: "unsupported_mime_type" }, { status: 415 });

  // Valida que o video pertence a esta conta antes de qualquer escrita no bucket.
  const admin = createAdminClient();
  const { data: ownedVideo } = await admin.from("videos").select("id").eq("id", videoId).eq("user_id", account.accountOwnerId).maybeSingle();
  if (!ownedVideo) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!contentMatchesMime(buffer, contentType)) return NextResponse.json({ error: "file_content_mismatch" }, { status: 415 });

  // Path montado server-side: {ownerId}/{videoId}/{kind}-{uuid}.{ext}.
  // O {kind} mantem legibilidade para o editor; o {uuid} impede colisao e nao
  // expoe sequencias previsiveis para outros usuarios mesmo se a RLS falhar.
  const ext = (file.name.split(".").pop() || "").replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const path = `${account.accountOwnerId}/${videoId}/${kind}-${crypto.randomUUID()}.${ext}`;

  const { error } = await admin.storage.from("player-assets").upload(path, buffer, { contentType, cacheControl: "31536000", upsert: false });
  if (error) {
    console.error("player-asset upload failed", { videoId, kind, message: error.message });
    return NextResponse.json({ error: "asset_upload_failed" }, { status: 500 });
  }
  return NextResponse.json({ path }, { status: 201, headers: { "cache-control": "no-store" } });
}
