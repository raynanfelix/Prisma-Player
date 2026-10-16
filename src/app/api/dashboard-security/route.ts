import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { purgeEmbedManifest } from "@/lib/cache/embed-purge";
import { db, schema } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";

const { accountSecuritySettings, playerConfigs } = schema;

const normalize = (value: unknown) => typeof value === "string"
  ? value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  : "";

export async function GET(request: Request) {
  const gate = await guard(request);
  if (!gate.ok) return gate.response;
  // Usava o cliente com RLS e o id do ator: um membro de equipe via a lista de
  // domínios vazia em vez da lista real da conta.
  try {
    const [row] = await db
      .select({ allowedDomains: accountSecuritySettings.allowedDomains })
      .from(accountSecuritySettings)
      .where(eq(accountSecuritySettings.userId, gate.account.accountOwnerId))
      .limit(1);
    return NextResponse.json({ domains: row?.allowedDomains ?? [] });
  } catch {
    return NextResponse.json({ error: "security_load_failed" }, { status: 500 });
  }
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

  try {
    const affected = await db.select({ id: playerConfigs.id }).from(playerConfigs).where(eq(playerConfigs.userId, ownerId));
    // Chave única: user_id (PK da tabela); a persistência da
    // lista da conta vem antes da propagação para os players.
    await db
      .insert(accountSecuritySettings)
      .values({ userId: ownerId, allowedDomains: domains, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: accountSecuritySettings.userId,
        set: { allowedDomains: domains, updatedAt: new Date() },
      });
    await db.update(playerConfigs).set({ allowedDomains: domains, updatedAt: new Date() }).where(eq(playerConfigs.userId, ownerId));
    if (affected.length) await Promise.all(affected.map((row) => purgeEmbedManifest(row.id)));
    return NextResponse.json({ domains });
  } catch {
    return NextResponse.json({ error: "security_save_failed" }, { status: 400 });
  }
}
