import { Activity, AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { AdminHeader, AdminMetric, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import { db, schema } from "@/lib/db";

const { paymentWebhookEvents } = schema;

export const dynamic = "force-dynamic";
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
  const healthy = failedCount === 0;
  return <div><AdminHeader title="Saúde do sistema" description="Webhooks financeiros, filas pendentes e falhas que exigem ação imediata." />
    <section className="mb-6 grid gap-4 sm:grid-cols-3"><AdminMetric label="Estado financeiro" value={healthy ? "Saudável" : "Atenção"} detail="eventos da AbacatePay" icon={healthy ? CheckCircle2 : AlertTriangle} tone={healthy ? "green" : "red"} /><AdminMetric label="Falhas" value={failedCount.toLocaleString("pt-BR")} detail="eventos não processados" icon={AlertTriangle} tone={failedCount ? "red" : "green"} /><AdminMetric label="Em processamento" value={pendingCount.toLocaleString("pt-BR")} detail="recebidos ou executando" icon={Clock3} tone="amber" /></section>
    <AdminPanel title="Log de entregas" description="O erro interno é visível somente para administradores."><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">Evento</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Recebido</th><th className="px-5 py-3 font-medium">Processado</th><th className="px-5 py-3 font-medium">Erro</th></tr></thead><tbody>{events.map((event) => <tr key={event.providerEventId} className="border-t themeable-border-hairline"><td className="px-5 py-4 font-semibold themeable-text-ink"><span className="inline-flex items-center gap-2"><Activity size={14} />{event.eventName}</span></td><td className="px-5 py-4"><StatusPill value={event.status} /></td><td className="px-5 py-4 themeable-text-ink-muted-48">{event.receivedAt.toLocaleString("pt-BR")}</td><td className="px-5 py-4 themeable-text-ink-muted-48">{event.processedAt ? event.processedAt.toLocaleString("pt-BR") : "—"}</td><td className="max-w-[280px] truncate px-5 py-4 text-red-500">{event.processingError ?? "—"}</td></tr>)}</tbody></table></div></AdminPanel>
  </div>;
}
