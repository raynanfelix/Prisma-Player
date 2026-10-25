import { Activity } from "lucide-react";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { AdminHeader, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import UptimeCard, { type Incident, type UptimeService } from "@/components/ui/uptime-card";
import { db, schema } from "@/lib/db";
import { nowMs } from "@/lib/datetime";

const { paymentWebhookEvents } = schema;

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const UPTIME_DAYS = 90;

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** Índice do dia (0 = mais antigo) de um timestamp dentro da janela do card. */
function dayIndexFor(timestampMs: number, endMs: number): number {
  const index = UPTIME_DAYS - 1 - Math.floor((endMs - timestampMs) / DAY_MS);
  return Math.min(UPTIME_DAYS - 1, Math.max(0, index));
}

/**
 * Saúde do Sistema - página montada sobre o UptimeCard (kokonutui, MIT)
 * adaptado ao domínio Prisma Player.
 *
 * Fontes de dados REAIS desta página:
 * - Stripe Webhooks: tabela payment_webhook_events - eventos com
 *   status "failed" viram incidentes "Indisponível" no dia em que chegaram
 *   (com o erro real de processamento), e a fila pendente ("received"/
 *   "processing") vira "Degradado" no dia corrente.
 * - Banco Neon: as queries desta página responderam ⇒ dia corrente
 *   operacional (evidência real, sem telemetria histórica).
 *
 * PLACEHOLDER HONESTO (marcado em código e no texto da página):
 * - API (funções Vercel) e Dashboard: sem fonte de incidentes no projeto;
 *   só o dia corrente é comprovado (a própria carga desta página). Dias
 *   anteriores aparecem como "Sem dados" em vez de verde inventado.
 * - R2/Storage: nenhum probe de storage nesta página - linha inteira
 *   "Sem dados" até existir sondagem dedicada.
 * - Minutos de impacto dos incidentes: o log não registra duração; usa-se
 *   estimativa fixa (15 min por evento, teto 240) só para o cálculo de uptime.
 */
export default async function AdminSystemPage() {
  const countExpr = { count: sql<number>`count(*)::int` };
  const [failedRows, pendingRows, events] = await Promise.all([
    db.select(countExpr).from(paymentWebhookEvents).where(eq(paymentWebhookEvents.status, "failed")),
    db.select(countExpr).from(paymentWebhookEvents).where(inArray(paymentWebhookEvents.status, ["received", "processing"])),
    db.select({
      providerEventId: paymentWebhookEvents.providerEventId,
      eventName: paymentWebhookEvents.eventName,
      status: paymentWebhookEvents.status,
      receivedAt: paymentWebhookEvents.receivedAt,
      processedAt: paymentWebhookEvents.processedAt,
      processingError: paymentWebhookEvents.processingError,
    })
      .from(paymentWebhookEvents)
      .orderBy(desc(paymentWebhookEvents.receivedAt))
      .limit(100),
  ]);
  const failedCount = failedRows[0]?.count ?? 0;
  const pendingCount = pendingRows[0]?.count ?? 0;

  const endDate = new Date(nowMs()).toISOString().slice(0, 10);
  const endMs = Date.parse(`${endDate}T00:00:00Z`);
  const sinceMs = endMs - (UPTIME_DAYS - 1) * DAY_MS;

  // Incidentes reais: eventos com falha agrupados por dia (janela do card).
  const failedByDay = new Map<number, { count: number; lastError: string | null; lastEventName: string; lastAtMs: number }>();
  for (const event of events) {
    if (event.status !== "failed") continue;
    const receivedMs = event.receivedAt.getTime();
    if (receivedMs < sinceMs) continue;
    const index = dayIndexFor(receivedMs, endMs);
    const bucket = failedByDay.get(index) ?? {
      count: 0,
      lastError: null,
      lastEventName: event.eventName,
      lastAtMs: receivedMs,
    };
    bucket.count += 1;
    if (!bucket.lastError && event.processingError) {
      bucket.lastError = event.processingError;
    }
    failedByDay.set(index, bucket);
  }

  const webhookIncidents: Record<number, Incident> = {};
  for (const [index, bucket] of failedByDay) {
    webhookIncidents[index] = {
      title: `${bucket.count} ${bucket.count === 1 ? "evento com falha" : "eventos com falha"} no processamento`,
      status: "down",
      minutes: Math.min(240, bucket.count * 15),
      updates: [
        {
          time: timeFormatter.format(bucket.lastAtMs),
          label: "Falha registrada",
          note: bucket.lastError ? `${bucket.lastEventName}: ${bucket.lastError}` : bucket.lastEventName,
        },
      ],
    };
  }
  if (pendingCount > 0) {
    webhookIncidents[UPTIME_DAYS - 1] = {
      title: `${pendingCount} ${pendingCount === 1 ? "evento" : "eventos"} na fila de processamento`,
      status: "degraded",
      minutes: 10,
      updates: [
        {
          time: timeFormatter.format(nowMs()),
          label: "Monitorando",
          note: "Eventos recebidos que ainda não foram processados.",
        },
      ],
    };
  }

  const services: UptimeService[] = [
    // PLACEHOLDER HONESTO: sem telemetria de incidentes; o dia corrente é
    // comprovado pela própria carga desta página (route handler respondeu).
    { name: "API (funções Vercel)", missing: UPTIME_DAYS - 1 },
    // PLACEHOLDER HONESTO: idem - esta página do Dashboard renderizou hoje.
    { name: "Dashboard", missing: UPTIME_DAYS - 1 },
    // Dados reais: payment_webhook_events (falhas + fila) da Stripe.
    { name: "Stripe Webhooks", incidents: webhookIncidents },
    // PLACEHOLDER HONESTO: as queries desta página responderam (Neon ativo
    // hoje); não há registro histórico de incidentes de banco no projeto.
    { name: "Banco Neon", missing: UPTIME_DAYS - 1 },
    // PLACEHOLDER HONESTO: nenhum probe de R2 nesta página - "Sem dados".
    { name: "R2/Storage", missing: UPTIME_DAYS },
  ];

  return (
    <div>
      <AdminHeader
        title="Saúde do Sistema"
        description="Disponibilidade dos serviços do Prisma Player, com incidentes reais dos webhooks Stripe e telemetria da própria página."
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <UptimeCard
            title="Status do Sistema"
            services={services}
            days={UPTIME_DAYS}
            endDate={endDate}
          />
          <p className="text-[11px] leading-relaxed themeable-text-ink-muted-48">
            Fonte real: tabela <strong>payment_webhook_events</strong> (falhas e fila dos webhooks Stripe) e a
            resposta desta página. API, Dashboard e Banco Neon ainda não possuem telemetria histórica de incidentes -
            os dias anteriores aparecem como <em>Sem dados</em> e apenas o dia corrente é comprovado. R2/Storage
            aguarda sondagem dedicada.
          </p>
        </div>

        <AdminPanel
          title="Log de entregas"
          description={`${failedCount.toLocaleString("pt-BR")} falha(s) e ${pendingCount.toLocaleString("pt-BR")} evento(s) em processamento. O erro interno é visível somente para administradores.`}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-[12px]">
              <thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48">
                <tr>
                  <th className="px-5 py-3 font-medium">Evento</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Recebido</th>
                  <th className="px-5 py-3 font-medium">Processado</th>
                  <th className="px-5 py-3 font-medium">Erro</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.providerEventId} className="border-t themeable-border-hairline">
                    <td className="px-5 py-4 font-semibold themeable-text-ink">
                      <span className="inline-flex items-center gap-2">
                        <Activity size={14} />
                        {event.eventName}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill value={event.status} />
                    </td>
                    <td className="px-5 py-4 themeable-text-ink-muted-48">
                      {timeFormatter.format(event.receivedAt.getTime())} · {event.receivedAt.toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-5 py-4 themeable-text-ink-muted-48">
                      {event.processedAt ? event.processedAt.toLocaleString("pt-BR") : "-"}
                    </td>
                    <td className="max-w-[280px] truncate px-5 py-4 text-red-500">{event.processingError ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminPanel>
      </div>
    </div>
  );
}
