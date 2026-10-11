import { Activity, BrainCircuit, CircleDollarSign, CreditCard, Users, Video } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminHeader, AdminMetric, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import { AdminCheckoutRing, AdminRevenueChart } from "@/components/admin/admin-charts";

export const dynamic = "force-dynamic";
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function AdminPage() {
  const admin = createAdminClient();
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const since = new Date(); since.setUTCDate(since.getUTCDate() - 29); since.setUTCHours(0, 0, 0, 0);
  const [users, active, videos, paid30, wallets, webhooks, checkoutStatuses] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("videos").select("id", { count: "exact", head: true }),
    admin.from("billing_checkouts").select("paid_at,amount_cents").eq("status", "paid").gte("paid_at", since.toISOString()).order("paid_at", { ascending: true }).limit(5000),
    admin.from("ai_credit_wallets").select("balance,lifetime_purchased,lifetime_used").limit(2000),
    admin.from("payment_webhook_events").select("provider_event_id,event_name,status,received_at,processing_error").order("received_at", { ascending: false }).limit(8),
    admin.from("billing_checkouts").select("status").limit(5000),
  ]);
  const paidItems = paid30.data ?? [];
  const revenueByDay = new Map<string, number>();
  let revenue30 = 0;
  let revenue = 0;
  for (const item of paidItems) {
    revenue30 += item.amount_cents;
    if (item.paid_at) {
      if (item.paid_at >= monthStart.toISOString()) revenue += item.amount_cents;
      const day = item.paid_at.slice(0, 10);
      revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + item.amount_cents);
    }
  }
  const revenueSeries: { date: string; value: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const day = new Date(since.getTime() + i * 86400000);
    const key = day.toISOString().slice(0, 10);
    revenueSeries.push({ date: key, value: (revenueByDay.get(key) ?? 0) / 100 });
  }
  const statusCounts = new Map<string, number>();
  for (const row of checkoutStatuses.data ?? []) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  }
  const totalCheckouts = [...statusCounts.values()].reduce((sum, count) => sum + count, 0);
  const statusLabel: Record<string, string> = {
    paid: "Pago", pending: "Pendente", creating: "Criando", processing: "Processando",
    failed: "Falhou", expired: "Expirado", cancelled: "Cancelado", refunded: "Reembolsado",
  };
  const statusColor: Record<string, string> = {
    paid: "var(--chart-1)", creating: "var(--chart-2)", pending: "var(--chart-3)",
    processing: "var(--chart-4)", failed: "#ef4444", expired: "var(--chart-3)",
    cancelled: "var(--chart-5)", refunded: "var(--chart-5)",
  };
  const checkoutRingData = [...statusCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      label: statusLabel[status] ?? status,
      value: count,
      maxValue: totalCheckouts,
      color: statusColor[status] ?? "var(--chart-3)",
    }));
  const creditBalance = (wallets.data ?? []).reduce((sum, item) => sum + item.balance, 0);
  const failedHooks = (webhooks.data ?? []).filter((item) => item.status === "failed").length;
  return <div>
    <AdminHeader title="Visão geral" description="Operação, receita, produto e entregas críticas acompanhadas em um único lugar." />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <AdminMetric label="Contas" value={(users.count ?? 0).toLocaleString("pt-BR")} detail="usuários cadastrados" icon={Users} />
      <AdminMetric label="Assinaturas" value={(active.count ?? 0).toLocaleString("pt-BR")} detail="planos ativos" icon={CreditCard} tone="green" />
      <AdminMetric label="Receita no mês" value={money(revenue)} detail="checkouts confirmados" icon={CircleDollarSign} tone="green" />
      <AdminMetric label="VSLs" value={(videos.count ?? 0).toLocaleString("pt-BR")} detail="vídeos na plataforma" icon={Video} />
      <AdminMetric label="Créditos em carteira" value={creditBalance.toLocaleString("pt-BR")} detail="saldo dos clientes" icon={BrainCircuit} />
      <AdminMetric label="Alertas recentes" value={failedHooks.toLocaleString("pt-BR")} detail="webhooks com falha" icon={Activity} tone={failedHooks ? "red" : "green"} />
    </section>
    <section className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <AdminPanel title="Receita confirmada" description="Checkouts pagos agrupados por dia — últimos 30 dias.">
        <AdminRevenueChart series={revenueSeries} totalCents={revenue30} />
      </AdminPanel>
      <AdminPanel title="Checkouts por status" description="Distribuição dos status registrados na cobrança.">
        {checkoutRingData.length > 0 ? <AdminCheckoutRing data={checkoutRingData} /> : <div className="p-5 text-[12px] themeable-text-ink-muted-48">Nenhum checkout registrado ainda.</div>}
      </AdminPanel>
    </section>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <AdminPanel title="Entregas financeiras recentes" description="Eventos recebidos da AbacatePay e processados pela Prisma."><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">Evento</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Recebido</th><th className="px-5 py-3 font-medium">Diagnóstico</th></tr></thead><tbody>{(webhooks.data ?? []).map((item) => <tr key={item.provider_event_id} className="border-t themeable-border-hairline"><td className="px-5 py-3 font-medium themeable-text-ink">{item.event_name}</td><td className="px-5 py-3"><StatusPill value={item.status} /></td><td className="px-5 py-3 themeable-text-ink-muted-48">{new Date(item.received_at).toLocaleString("pt-BR")}</td><td className="max-w-[260px] truncate px-5 py-3 text-red-500">{item.processing_error ?? "—"}</td></tr>)}</tbody></table></div></AdminPanel>
      <AdminPanel title="Prioridades operacionais"><div className="space-y-3 p-5">{failedHooks > 0 ? <div className="rounded-[14px] border border-red-500/20 bg-red-500/5 p-4"><p className="text-[13px] font-semibold text-red-600">Revisar webhooks com falha</p><p className="mt-1 text-[11px] themeable-text-ink-muted-48">Pagamentos nunca devem depender de correção manual.</p></div> : <div className="rounded-[14px] border border-emerald-500/20 bg-emerald-500/5 p-4"><p className="text-[13px] font-semibold text-emerald-600">Fluxo financeiro saudável</p><p className="mt-1 text-[11px] themeable-text-ink-muted-48">Nenhuma falha entre os eventos recentes.</p></div>}<div className="rounded-[14px] border p-4 themeable-border-hairline"><p className="text-[13px] font-semibold themeable-text-ink">Saldo Prisma IA</p><p className="mt-1 text-[11px] themeable-text-ink-muted-48">{creditBalance.toLocaleString("pt-BR")} créditos distribuídos nas carteiras.</p></div></div></AdminPanel>
    </div>
  </div>;
}
