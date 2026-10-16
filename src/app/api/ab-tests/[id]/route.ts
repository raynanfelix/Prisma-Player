import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { db, schema } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { getAccountAccess } from "@/lib/access/service";

const { abTests, abTestVariants, playerConfigs } = schema;

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

  let test: { userId: string } | undefined;
  try {
    [test] = await db.select({ userId: abTests.userId }).from(abTests).where(and(eq(abTests.id, id), eq(abTests.status, "active"))).limit(1);
  } catch {
    test = undefined;
  }
  if (!test) return NextResponse.json({ error: "test_not_found" }, { status: 404 });

  // Mesma regra do embed: conta sem acesso ativo não entrega mais conteúdo.
  const ownerAccess = await getAccountAccess(test.userId);
  if (!ownerAccess.hasAccess) return NextResponse.json({ error: "test_unavailable" }, { status: 402 });

  let variants: Array<{ id: string; videoId: string; weight: number }> = [];
  try {
    variants = await db.select({ id: abTestVariants.id, videoId: abTestVariants.videoId, weight: abTestVariants.weight }).from(abTestVariants).where(eq(abTestVariants.testId, id)).orderBy(asc(abTestVariants.id));
  } catch {
    variants = [];
  }
  if (!variants.length) return NextResponse.json({ error: "variants_not_found" }, { status: 404 });
  const point = hash(`${id}:${sessionId}`) % 100;
  let cursor = 0;
  const variant = variants.find((item) => { cursor += item.weight; return point < cursor; }) ?? variants.at(-1)!;
  let config: { id: string } | undefined;
  try {
    [config] = await db.select({ id: playerConfigs.id }).from(playerConfigs).where(and(eq(playerConfigs.videoId, variant.videoId), eq(playerConfigs.published, true))).limit(1);
  } catch {
    config = undefined;
  }
  if (!config) return NextResponse.json({ error: "variant_not_published" }, { status: 409 });
  return NextResponse.json({ testId: id, variantId: variant.id, videoId: variant.videoId, playerId: config.id }, { headers: { "cache-control": "private, no-store" } });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await guard(request, { csrf: true, role: "edit" });
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  try {
    await db.delete(abTests).where(and(eq(abTests.id, id), eq(abTests.userId, gate.account.accountOwnerId)));
    return NextResponse.json({ ok: true });
  } catch {
    // id não-UUID (ou falha do banco) cai aqui — mesma resposta do PostgREST.
    return NextResponse.json({ error: "delete_failed" }, { status: 400 });
  }
}
