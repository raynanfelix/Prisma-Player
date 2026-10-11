import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { purgeEmbedManifest } from "@/lib/cache/embed-purge";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";

const normalize = (value: unknown) => typeof value === "string"
  ? value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  : "";

export async function GET(request: Request) {
  const gate = await guard(request);
  if (!gate.ok) return gate.response;
  // Usava o cliente com RLS e o id do ator: um membro de equipe via a lista de
  // domínios vazia em vez da lista real da conta.
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("account_security_settings").select("allowed_domains,updated_at").eq("user_id", gate.account.accountOwnerId).maybeSingle();
  return error ? NextResponse.json({ error: "security_load_failed" }, { status: 500 }) : NextResponse.json({ domains: data?.allowed_domains ?? [] });
}

export async function PUT(request: Request) {
  const gate = await guard(request, { csrf: true, role: "manage", paid: true });
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;

  const limited = await rateLimit(request, `dashboard-security:${gate.account.accountOwnerId}`, { max: 30, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ domains?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const domains = Array.isArray(parsed.body?.domains) ? [...new Set(parsed.body.domains.map(normalize).filter(Boolean))].slice(0, 100) : [];

  const supabase = createAdminClient();
  const { data: affected } = await supabase.from("player_configs").select("id").eq("user_id", ownerId);
  const { error } = await supabase.from("account_security_settings").upsert({ user_id: ownerId, allowed_domains: domains, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: "security_save_failed" }, { status: 400 });
  await supabase.from("player_configs").update({ allowed_domains: domains, updated_at: new Date().toISOString() }).eq("user_id", ownerId);
  if (affected?.length) await Promise.all(affected.map((row) => purgeEmbedManifest(row.id)));
  return NextResponse.json({ domains });
}
