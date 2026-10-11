import { Activity, AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { AdminHeader, AdminMetric, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export default async function AdminSystemPage() {
  const admin = createAdminClient();
  const [failed, pending, events] = await Promise.all([
    admin.from("payment_webhook_events").select("id", { count: "exact", head: true }).eq("status", "failed"),
    admin.from("payment_webhook_events").select("id", { count: "exact", head: true }).in("status", ["received", "processing"]),
    admin.from("payment_webhook_events").select("provider_event_id,event_name,status,received_at,processed_at,processing_error").order("received_at", { ascending: false }).limit(100),
  ]);
  const healthy = (failed.count ?? 0) === 0;
  return <div><AdminHeader title="Saúde do sistema" description="Webhooks financeiros, filas pendentes e falhas que exigem ação imediata." />
    <section className="mb-6 grid gap-4 sm:grid-cols-3"><AdminMetric label="Estado financeiro" value={healthy ? "Saudável" : "Atenção"} detail="eventos da AbacatePay" icon={healthy ? CheckCircle2 : AlertTriangle} tone={healthy ? "green" : "red"} /><AdminMetric label="Falhas" value={(failed.count ?? 0).toLocaleString("pt-BR")} detail="eventos não processados" icon={AlertTriangle} tone={(failed.count ?? 0) ? "red" : "green"} /><AdminMetric label="Em processamento" value={(pending.count ?? 0).toLocaleString("pt-BR")} detail="recebidos ou executando" icon={Clock3} tone="amber" /></section>
    <AdminPanel title="Log de entregas" description="O erro interno é visível somente para administradores."><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">Evento</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Recebido</th><th className="px-5 py-3 font-medium">Processado</th><th className="px-5 py-3 font-medium">Erro</th></tr></thead><tbody>{(events.data ?? []).map((event) => <tr key={event.provider_event_id} className="border-t themeable-border-hairline"><td className="px-5 py-4 font-semibold themeable-text-ink"><span className="inline-flex items-center gap-2"><Activity size={14} />{event.event_name}</span></td><td className="px-5 py-4"><StatusPill value={event.status} /></td><td className="px-5 py-4 themeable-text-ink-muted-48">{new Date(event.received_at).toLocaleString("pt-BR")}</td><td className="px-5 py-4 themeable-text-ink-muted-48">{event.processed_at ? new Date(event.processed_at).toLocaleString("pt-BR") : "—"}</td><td className="max-w-[280px] truncate px-5 py-4 text-red-500">{event.processing_error ?? "—"}</td></tr>)}</tbody></table></div></AdminPanel>
  </div>;
}
