import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { seoTargets, visibilityChecks } = schema;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const platforms = new Set(["google-aio", "chatgpt", "perplexity", "gemini", "copilot"]);

/** Admin SEO: cadastra meta de busca ou registra verificação manual. */
export async function POST(request: Request) {
  const gate = await adminGuard(request);
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `admin-seo:${gate.adminId}`, { max: 60, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body ?? {};

  if (typeof body.keyword === "string") {
    const keyword = body.keyword.trim().replace(/\s+/g, " ").slice(0, 200);
    if (keyword.length < 2) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    const locale = String(body.locale ?? "pt-BR").slice(0, 20);
    const notes = String(body.notes ?? "").slice(0, 500);
    const [created] = await db.insert(seoTargets).values({ keyword, locale, notes }).returning({ id: seoTargets.id });
    if (!created) return NextResponse.json({ error: "target_create_failed" }, { status: 400 });
    return NextResponse.json({ created: true, id: created.id }, { headers: { "cache-control": "no-store" } });
  }

  const targetId = String(body.targetId ?? "");
  const platform = String(body.platform ?? "");
  const runs = Math.trunc(Number(body.runs ?? 1));
  if (!uuid.test(targetId) || !platforms.has(platform) || runs < 1 || runs > 10) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const [target] = await db.select({ id: seoTargets.id }).from(seoTargets).where(and(eq(seoTargets.id, targetId), eq(seoTargets.isActive, true))).limit(1);
  if (!target) return NextResponse.json({ error: "target_not_found" }, { status: 404 });
  try {
    await db.insert(visibilityChecks).values({ targetId, platform, cited: body.cited === true, runs });
  } catch {
    return NextResponse.json({ error: "check_log_failed" }, { status: 500 });
  }
  return NextResponse.json({ logged: true }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  const gate = await adminGuard(request);
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `admin-seo:${gate.adminId}`, { max: 60, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ targetId?: unknown; isActive?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const targetId = String(parsed.body?.targetId ?? "");
  if (!uuid.test(targetId) || typeof parsed.body?.isActive !== "boolean") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  try {
    await db.update(seoTargets).set({ isActive: parsed.body.isActive }).where(eq(seoTargets.id, targetId));
  } catch {
    return NextResponse.json({ error: "target_toggle_failed" }, { status: 400 });
  }
  return NextResponse.json({ updated: true }, { headers: { "cache-control": "no-store" } });
}
