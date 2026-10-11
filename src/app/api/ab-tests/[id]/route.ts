import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";
import { getAccountAccess } from "@/lib/access/service";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hash(value: string) { let result = 0; for (let index = 0; index < value.length; index += 1) result = ((result << 5) - result + value.charCodeAt(index)) >>> 0; return result; }

/** Sorteio da variante. Público (roda dentro do embed), por isso com rate limit. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sessionId = new URL(request.url).searchParams.get("sessionId") ?? "";
  // A regex anterior (`[0-9a-f-]{36}`) aceitava 36 hifens como id válido.
  if (!uuid.test(id) || !uuid.test(sessionId)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const limited = await rateLimit(request, `ab-assign:${id}`, { max: 600, windowMs: 60_000 });
  if (limited) return limited;

  const supabase = createAdminClient();
  const { data: test } = await supabase.from("ab_tests").select("id,status,user_id").eq("id", id).eq("status", "active").maybeSingle();
  if (!test) return NextResponse.json({ error: "test_not_found" }, { status: 404 });

  // Mesma regra do embed: conta sem acesso ativo não entrega mais conteúdo.
  const ownerAccess = await getAccountAccess(test.user_id);
  if (!ownerAccess.hasAccess) return NextResponse.json({ error: "test_unavailable" }, { status: 402 });

  const { data: variants } = await supabase.from("ab_test_variants").select("id,video_id,weight").eq("test_id", id).order("id");
  if (!variants?.length) return NextResponse.json({ error: "variants_not_found" }, { status: 404 });
  const point = hash(`${id}:${sessionId}`) % 100;
  let cursor = 0;
  const variant = variants.find((item) => { cursor += item.weight; return point < cursor; }) ?? variants.at(-1)!;
  const { data: config } = await supabase.from("player_configs").select("id").eq("video_id", variant.video_id).eq("published", true).maybeSingle();
  if (!config) return NextResponse.json({ error: "variant_not_published" }, { status: 409 });
  return NextResponse.json({ testId: id, variantId: variant.id, videoId: variant.video_id, playerId: config.id }, { headers: { "cache-control": "private, no-store" } });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await guard(request, { csrf: true, role: "edit" });
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("ab_tests").delete().eq("id", id).eq("user_id", gate.account.accountOwnerId);
  return error ? NextResponse.json({ error: "delete_failed" }, { status: 400 }) : NextResponse.json({ ok: true });
}
