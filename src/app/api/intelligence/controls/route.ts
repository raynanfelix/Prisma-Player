import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { db, schema } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { deliverWebhook, validateWebhookUrl } from "@/lib/webhooks/delivery";
import type { PlanCapabilities } from "@/lib/access/service";

const { intelligenceControls } = schema;

const frequencies = new Set(["daily", "weekly", "monthly"]);
const thresholds = new Set([25, 50, 75, 90, 100]);
const webhookEvents = new Set(["impression", "play", "progress", "cta_click", "conversion", "complete"]);

function capabilityDenied(capability: keyof PlanCapabilities) {
  return NextResponse.json({
    error: "plan_upgrade_required",
    capability,
    message: "Este recurso faz parte de um plano superior. Faça upgrade para ativá-lo.",
  }, { status: 402 });
}

export async function GET(request: Request) {
  const gate = await guard(request);
  if (!gate.ok) return gate.response;
  const { account, plan } = gate;
  const ownerId = account.accountOwnerId;

  try {
    // Garante a linha do usuário (idempotente) antes da leitura única.
    await db.insert(intelligenceControls).values({ userId: ownerId }).onConflictDoNothing({ target: intelligenceControls.userId });
    const [row] = await db
      .select({
        automaticReportsEnabled: intelligenceControls.automaticReportsEnabled,
        reportFrequency: intelligenceControls.reportFrequency,
        reportEmail: intelligenceControls.reportEmail,
        audienceSyncEnabled: intelligenceControls.audienceSyncEnabled,
        audienceRetentionThreshold: intelligenceControls.audienceRetentionThreshold,
        outgoingWebhooksEnabled: intelligenceControls.outgoingWebhooksEnabled,
        webhookUrl: intelligenceControls.webhookUrl,
        webhookEvents: intelligenceControls.webhookEvents,
        conversionAlertsEnabled: intelligenceControls.conversionAlertsEnabled,
        conversionDropThreshold: intelligenceControls.conversionDropThreshold,
        alertWebhookEnabled: intelligenceControls.alertWebhookEnabled,
        alertWebhookUrl: intelligenceControls.alertWebhookUrl,
        updatedAt: intelligenceControls.updatedAt,
      })
      .from(intelligenceControls)
      .where(eq(intelligenceControls.userId, ownerId))
      .limit(1);
    if (!row) return NextResponse.json({ error: "controls_unavailable" }, { status: 503 });
    // Contrato preservado: o painel consome chaves snake_case.
    const data = {
      automatic_reports_enabled: row.automaticReportsEnabled,
      report_frequency: row.reportFrequency,
      report_email: row.reportEmail,
      audience_sync_enabled: row.audienceSyncEnabled,
      audience_retention_threshold: row.audienceRetentionThreshold,
      outgoing_webhooks_enabled: row.outgoingWebhooksEnabled,
      webhook_url: row.webhookUrl,
      webhook_events: row.webhookEvents,
      conversion_alerts_enabled: row.conversionAlertsEnabled,
      conversion_drop_threshold: row.conversionDropThreshold,
      alert_webhook_enabled: row.alertWebhookEnabled,
      alert_webhook_url: row.alertWebhookUrl,
      updated_at: row.updatedAt.toISOString(),
    };
    // As capacidades vêm do plano ativo. Antes, a ausência de assinatura devolvia
    // tudo como `true` e o painel liberava recursos pagos para qualquer conta.
    return NextResponse.json({ controls: data, capabilities: plan.capabilities }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "controls_unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const gate = await guard(request, { csrf: true, role: "manage", paid: true });
  if (!gate.ok) return gate.response;
  const { account, plan } = gate;
  const ownerId = account.accountOwnerId;

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!body) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const update: Partial<typeof intelligenceControls.$inferInsert> = { userId: ownerId, updatedAt: new Date() };

  if ("automaticReportsEnabled" in body) {
    if (body.automaticReportsEnabled && !plan.capabilities.automatic_reports) return capabilityDenied("automatic_reports");
    update.automaticReportsEnabled = Boolean(body.automaticReportsEnabled);
  }
  if ("reportFrequency" in body) {
    if (!frequencies.has(String(body.reportFrequency))) return NextResponse.json({ error: "invalid_report_frequency" }, { status: 400 });
    update.reportFrequency = String(body.reportFrequency);
  }
  if ("reportEmail" in body) {
    const email = String(body.reportEmail ?? "").trim().toLowerCase();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    update.reportEmail = email || null;
  }
  if ("audienceSyncEnabled" in body) {
    if (body.audienceSyncEnabled && !plan.capabilities.audience_sync) return capabilityDenied("audience_sync");
    update.audienceSyncEnabled = Boolean(body.audienceSyncEnabled);
  }
  if ("audienceRetentionThreshold" in body) {
    // Antes, um valor fora da lista era ignorado em silêncio e o usuário achava
    // que tinha salvo.
    if (!thresholds.has(Number(body.audienceRetentionThreshold))) return NextResponse.json({ error: "invalid_retention_threshold" }, { status: 400 });
    update.audienceRetentionThreshold = Number(body.audienceRetentionThreshold);
  }
  if ("outgoingWebhooksEnabled" in body) {
    if (body.outgoingWebhooksEnabled && !plan.capabilities.outgoing_webhooks) return capabilityDenied("outgoing_webhooks");
    update.outgoingWebhooksEnabled = Boolean(body.outgoingWebhooksEnabled);
  }
  if ("webhookUrl" in body) {
    const value = String(body.webhookUrl ?? "").trim();
    if (value) {
      if (!plan.capabilities.outgoing_webhooks) return capabilityDenied("outgoing_webhooks");
      try { await validateWebhookUrl(value); } catch { return NextResponse.json({ error: "invalid_webhook_url" }, { status: 400 }); }
    }
    update.webhookUrl = value || null;
  }
  if (Array.isArray(body.webhookEvents)) update.webhookEvents = body.webhookEvents.map(String).filter((item) => webhookEvents.has(item)).slice(0, 6);
  if ("conversionAlertsEnabled" in body) {
    if (body.conversionAlertsEnabled && !plan.capabilities.conversion_drop_alerts) return capabilityDenied("conversion_drop_alerts");
    update.conversionAlertsEnabled = Boolean(body.conversionAlertsEnabled);
  }
  if ("conversionDropThreshold" in body) {
    const threshold = Number(body.conversionDropThreshold);
    if (!Number.isInteger(threshold) || threshold < 5 || threshold > 90) return NextResponse.json({ error: "invalid_drop_threshold" }, { status: 400 });
    update.conversionDropThreshold = threshold;
  }
  if ("alertWebhookEnabled" in body) {
    if (body.alertWebhookEnabled && !plan.capabilities.conversion_drop_alerts) return capabilityDenied("conversion_drop_alerts");
    update.alertWebhookEnabled = Boolean(body.alertWebhookEnabled);
  }
  if ("alertWebhookUrl" in body) {
    const value = String(body.alertWebhookUrl ?? "").trim();
    if (value) {
      if (!plan.capabilities.conversion_drop_alerts) return capabilityDenied("conversion_drop_alerts");
      try { await validateWebhookUrl(value); } catch { return NextResponse.json({ error: "invalid_alert_webhook_url" }, { status: 400 }); }
    }
    update.alertWebhookUrl = value || null;
  }

  try {
    // Chave única: user_id (PK da tabela). No insert de
    // garantia só entram userId/updatedAt; o `set` aplica os campos validados.
    await db
      .insert(intelligenceControls)
      .values({ userId: ownerId, updatedAt: update.updatedAt })
      .onConflictDoUpdate({ target: intelligenceControls.userId, set: update });
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "controls_save_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true, role: "manage", paid: true });
  if (!gate.ok) return gate.response;
  const { account, plan } = gate;
  const ownerId = account.accountOwnerId;

  const parsed = await readJsonBody<{ action?: string; target?: string }>(request);
  if (!parsed.ok) return parsed.response;
  if (parsed.body?.action !== "test_webhook") return NextResponse.json({ error: "invalid_action" }, { status: 400 });

  const target = parsed.body.target;
  if (target === "alert" ? !plan.capabilities.conversion_drop_alerts : !plan.capabilities.outgoing_webhooks) {
    return capabilityDenied(target === "alert" ? "conversion_drop_alerts" : "outgoing_webhooks");
  }
  // Cada teste dispara uma requisição externa a um destino escolhido pelo
  // usuário: sem limite, o endpoint vira um gerador de tráfego de graça.
  const limited = await rateLimit(request, `webhook-test:${ownerId}`, { max: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  let url: string | null = null;
  try {
    const [row] = await db.select({ webhookUrl: intelligenceControls.webhookUrl, alertWebhookUrl: intelligenceControls.alertWebhookUrl }).from(intelligenceControls).where(eq(intelligenceControls.userId, ownerId)).limit(1);
    url = target === "alert" ? row?.alertWebhookUrl ?? null : row?.webhookUrl ?? null;
  } catch {
    url = null;
  }
  if (!url) return NextResponse.json({ error: "no_webhook_url_configured" }, { status: 400 });
  try {
    const delivered = await deliverWebhook(url, {
      id: randomUUID(),
      event: target === "alert" ? "conversion_drop" : "prisma.webhook.test",
      timestamp: new Date().toISOString(),
      data: target === "alert"
        ? { video_title: "Exemplo de VSL", previous_rate: 4.2, current_rate: 2.8, drop_percent: 33.3, previous_plays: 120, current_plays: 96 }
        : { video_title: "Exemplo de VSL", progress_percent: 75, country_code: "Brasil", device_type: "Celular" },
    });
    return NextResponse.json({ delivered: true, ...delivered });
  } catch (error) {
    return NextResponse.json({ error: "webhook_delivery_failed", message: error instanceof Error ? error.message : "delivery_failed" }, { status: 502 });
  }
}
