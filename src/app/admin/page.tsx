import Link from "next/link";
import { Activity, BrainCircuit, CircleDollarSign, CreditCard, Search, Users, Video } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminHeader, AdminMetric, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import { AdminCheckoutRing, AdminRevenueChart } from "@/components/admin/admin-charts";

export const dynamic = "force-dynamic";
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PERIODS = [7, 30, 90] as const;

function delta(current: number, previous: number): string | null {
  if (previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs período anterior`;
}

/**
 * Centro de comando: negócio no período, atenção priorizada, atividade
 * administrativa e atalhos. Nada fictício: sem dado, sem comparação.
 */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const params = await searchParams;
  const days = PERIODS.includes(Number(params.period) as (typeof PERIODS)[number]) ? Number(params.period) : 30;
  const now = Date.now();
  const start = new Date(now - days * 86400000).toISOString();
  const prevStart = new Date(now - days * 2 * 86400000).toISOString();

  const admin = createAdminClient();
  const [users, active, videos, paid, prevPaid, signups, prevSignups, wallets, webhooks, checkoutStatuses, stuck, pastDue, noPeriod, expiring, audit] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("videos").select("id", { count: "exact", head: true }),
    admin.from("billing_checkouts").select("paid_at,amount_cents").eq("status", "paid").gte("paid_at", start).order("paid_at", { ascending: true }).limit(5000),
    admin.from("billing_checkouts").select("amount_cents").eq("status", "paid").gte("paid_at", prevStart).lt("paid_at", start).limit(5000),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", start),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", prevStart).lt("created_at", start),
    admin.from("ai_credit_wallets").select("balance,lifetime_purchased,lifetime_used").limit(2000),
    admin.from("payment_webhook_events").select("provider_event_id,event_name,status,received_at,processing_error").order("received_at", { ascending: false }).limit(8),
    admin.from("billing_checkouts").select("status").limit(5000),
    admin.from("videos").select("id,title,user_id,created_at").eq("status", "processing").lt("created_at", new Date(now - 86400000).toISOString()).order("created_at", { ascending: false }).limit(10),
    admin.from("subscriptions").select("user_id").eq("status", "past_due").limit(20),
    admin.from("subscriptions").select("user_id", { count: "exact", head: true }).eq("status", "active").is("current_period_end", null),
    admin.from("subscriptions").select("user_id,current_period_end").eq("status", "active").lt("current_period_end", new Date(now + 7 * 86400000).toISOString()).order("current_period_end").limit(20),
    admin.from("admin_audit_log").select("action,target_user_id,admin_user_id,created_at").order("created_at", { ascending: false }).limit(10),
  ]);

  const revenue = (paid.data ?? []).reduce((sum, item) => sum + item.amount_cents, 0);
  const prevRevenue = (prevPaid.data ?? []).reduce((sum, item) => sum + item.amount_cents, 0);
  const revenueByDay = new Map<string, number>();
  for (const item of paid.data ?? []) {
    if (!item.paid_at) continue;
    const day = item.paid_at.slice(0, 10);
    revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + item.amount_cents);
  }
  const revenueSeries: { date: string; value: number }[] = [];
  for (let i = 0; i < days; i++) {
    const key = new Date(now - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
    revenueSeries.push({ date: key, value: (revenueByDay.get(key) ?? 0) / 100 });
  }
  const statusCounts = new Map<string, number>();
  for (const row of checkoutStatuses.data ?? []) statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  const totalCheckouts = [...statusCounts.values()].reduce((sum, count) => sum + count, 0);
  const statusLabel: Record<string, string> = { paid: "Pago", pending: "Pendente", creating: "Criando", processing: "Processando", failed: "Falhou", expired: "Expirado", cancelled: "Cancelado", refunded: "Reembolsado" };
  const statusColor: Record<string, string> = { paid: "var(--chart-1)", creating: "var(--chart-2)", pending: "var(--chart-3)", processing: "var(--chart-4)", failed: "#ef4444", expired: "var(--chart-3)", cancelled: "var(--chart-5)", refunded: "var(--chart-5)" };
  const checkoutRingData = [...statusCounts.entries()].sort((a, b) => b[1] - a[1]).map(([status, count]) => ({ label: statusLabel[status] ?? status, value: count, maxValue: totalCheckouts, color: statusColor[status] ?? "var(--chart-3)" }));

  const failedHooks = (webhooks.data ?? []).filter((item) => item.status === "failed");
  const creditBalance = (wallets.data ?? []).reduce((sum, item) => sum + item.balance, 0);
  const attention: Array<{ severity: "alta" | "media"; text: string; href: string }> = [];
  if (failedHooks.length > 0) attention.push({ severity: "alta", text: `${failedHooks.length} webhooks com falha entre os recentes`, href: "/admin/system" });
  if ((pastDue.data ?? []).length > 0) attention.push({ severity: "alta", text: `${pastDue.data?.length} assinaturas inadimplentes (past_due)`, href: "/admin/finance" });
  if ((noPeriod.count ?? 0) > 0) attention.push({ severity: "alta", text: `${noPeriod.count} ativas sem período (higiene: reativar define +30d)`, href: "/admin/users" });
  if ((stuck.data ?? []).length > 0) attention.push({ severity: "media", text: `${stuck.data?.length} vídeos travados em processamento há +24h`, href: "/admin/content" });
  const expiringCount = (expiring.data ?? []).length;
  if (expiringCount > 0) attention.push({ severity: "media", text: `${expiringCount} assinaturas vencem em até 7 dias`, href: "/admin/finance" });

  const actorIds = [...new Set((audit.data ?? []).map((item) => item.admin_user_id))];
  const actors = actorIds.length ? await admin.from("profiles").select("id,email").in("id", actorIds) : { data: [] as Array<{ id: string; email: string }> };
  const actorEmail = new Map((actors.data ?? []).map((item) => [item.id, item.email]));
  const actionLabel: Record<string, string> = { plan_change: "Troca de plano", subscription_suspend: "Suspensão", subscription_reactivate: "Reativação", trial_extend: "Trial +", trial_reset: "Trial reset", credit_adjust: "Créditos", support_case_opened: "Caso aberto", support_case_updated: "Caso atualizado", support_note_added: "Nota", team_role_changed: "Equipe" };

  return <div>
    <AdminHeader title="Visão geral" description={`Negócio, atenção e atividade — últimos ${days} dias. Receita = checkouts pagos; MRR fica no Financeiro.`} />
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {PERIODS.map((option) => <Link key={option} href={option === 30 ? "/admin" : `/admin?period=${option}`} className={`rounded-xl px-3.5 py-2 text-[12px] font-semibold ${days === option ? "bg-selected text-selected-foreground" : "border border-slate-200 dark:border-zinc-800"}`}>{option === 30 && params.period === undefined ? "30 dias" : `${option}d`}</Link>)}
    </div>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <AdminMetric label="Contas" value={(users.count ?? 0).toLocaleString("pt-BR")} detail="cadastradas (total)" icon={Users} />
      <AdminMetric label="Novas contas" value={(signups.count ?? 0).toLocaleString("pt-BR")} detail={delta(signups.count ?? 0, prevSignups.count ?? 0) ?? `no período de ${days}d`} icon={Video} />
      <AdminMetric label="Assinaturas ativas" value={(active.count ?? 0).toLocaleString("pt-BR")} detail="pagando agora" icon={CreditCard} tone="green" />
      <AdminMetric label={`Receita ${days}d`} value={money(revenue)} detail={delta(revenue, prevRevenue) ?? "checkouts pagos no período"} icon={CircleDollarSign} tone="green" />
      <AdminMetric label="VSLs" value={(videos.count ?? 0).toLocaleString("pt-BR")} detail="vídeos na plataforma" icon={Video} />
      <AdminMetric label="Créditos em carteira" value={creditBalance.toLocaleString("pt-BR")} detail="saldo dos clientes" icon={BrainCircuit} />
    </section>

    <div className="mt-6"><AdminPanel title={`Atenção (${attention.length})`} description="Condições verificadas agora, não lista estática."><div className="space-y-3 p-5">{attention.map((item) => <Link key={item.text} href={item.href} className="flex items-center gap-3 rounded-[14px] border p-4 themeable-border-hairline hover:bg-black/[0.02] dark:hover:bg-transparent"><StatusPill value={item.severity === "alta" ? "failed" : "pending"} /><span className="text-[13px] font-semibold themeable-text-ink">{item.text}</span><span className="ml-auto text-[12px] font-semibold underline">Investigar</span></Link>)}
      {attention.length === 0 && <p className="text-[13px] themeable-text-ink-muted-48">Nada pendente: webhooks fluindo, sem inadimplência nem processamento travado.</p>}</div></AdminPanel></div>

    <section className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <AdminPanel title="Receita recebida" description={`Checkouts pagos por dia — últimos ${days} dias.`}>
        <AdminRevenueChart series={revenueSeries} totalCents={revenue} periodLabel={`Últimos ${days} dias`} />
      </AdminPanel>
      <AdminPanel title="Checkouts por status" description="Distribuição registrada na cobrança.">
        {checkoutRingData.length > 0 ? <AdminCheckoutRing data={checkoutRingData} /> : <div className="p-5 text-[12px] themeable-text-ink-muted-48">Nenhum checkout registrado ainda.</div>}
      </AdminPanel>
    </section>
    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      <AdminPanel title="Atividade administrativa" description="Últimas 10 ações da equipe."><div className="space-y-2 p-5 text-[12px]">{(audit.data ?? []).map((item, index) => <div key={index} className="flex items-center justify-between gap-2"><span className="font-semibold themeable-text-ink">{actionLabel[item.action] ?? item.action}</span><span className="truncate themeable-text-ink-muted-48">{actorEmail.get(item.admin_user_id) ?? "—"} · {new Date(item.created_at).toLocaleString("pt-BR")}</span></div>)}
        {(audit.data ?? []).length === 0 && <p className="themeable-text-ink-muted-48">Nenhuma ação registrada no período.</p>}</div></AdminPanel>
      <AdminPanel title="Acesso rápido" description="Fluxos reais."><div className="grid gap-2 p-5 sm:grid-cols-2">{[
        { href: "/admin/users", label: "Buscar conta", icon: Search },
        { href: "/admin/support", label: "Abrir suporte", icon: Activity },
        { href: "/admin/system", label: "Investigar webhook", icon: Activity },
        { href: "/admin/content", label: "Consultar vídeo", icon: Video },
      ].map((item) => <Link key={item.href + item.label} href={item.href} className="flex items-center gap-2 rounded-xl border p-3 text-[13px] font-semibold themeable-border-hairline hover:bg-black/[0.02] dark:hover:bg-transparent"><item.icon size={15} />{item.label}</Link>)}</div></AdminPanel>
    </div>
  </div>;
}
