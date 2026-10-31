import Link from "next/link";
import {
  Activity, BrainCircuit, CircleDollarSign, CreditCard, Search, Users, Video,
} from "lucide-react";
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { AdminGreeting, AdminKpi, AdminCard, AdminDotPill } from "@/components/admin/AdminKit";
import { AdminBarChart, type AdminBarGroup } from "@/components/admin/AdminBarChart";
import { AdminCheckoutRing } from "@/components/admin/admin-charts";
import Reveal from "@/components/motion/reveal";
import { db, schema } from "@/lib/db";
import { formatBrlFromCents as money } from "@/lib/format/money";
import { nowMs } from "@/lib/datetime";

const {
  adminAuditLog, aiCreditWallets, billingCheckouts, paymentWebhookEvents,
  profiles, subscriptions, videos,
} = schema;

export const dynamic = "force-dynamic";
const PERIODS = [7, 30, 90] as const;
const countExpr = { count: sql<number>`count(*)::int` };

function delta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function greetingFor(): string {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  if (hour < 5) return "Boa madrugada, Admin";
  if (hour < 12) return "Bom dia, Admin";
  if (hour < 18) return "Boa tarde, Admin";
  return "Boa noite, Admin";
}

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Centro de comando redesign (spec: docs/specs/ADMIN_REDESIGN_SPEC.md). */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const params = await searchParams;
  const days = PERIODS.includes(Number(params.period) as (typeof PERIODS)[number]) ? Number(params.period) : 30;
  const now = nowMs();
  const start = new Date(now - days * 86_400_000);
  const prevStart = new Date(now - days * 2 * 86_400_000);

  const [users, active, videosCount, paidRows, prevPaidRows, signups, prevSignups, wallets, webhooks, checkoutStatuses, stuck, pastDue, noPeriod, expiring, audit] = await Promise.all([
    db.select(countExpr).from(profiles),
    db.select(countExpr).from(subscriptions).where(eq(subscriptions.status, "active")),
    db.select(countExpr).from(videos),
    db.select({ paidAt: billingCheckouts.paidAt, amountCents: billingCheckouts.amountCents })
      .from(billingCheckouts).where(and(eq(billingCheckouts.status, "paid"), gte(billingCheckouts.paidAt, start)))
      .orderBy(asc(billingCheckouts.paidAt)).limit(5000),
    db.select({ paidAt: billingCheckouts.paidAt, amountCents: billingCheckouts.amountCents })
      .from(billingCheckouts).where(and(eq(billingCheckouts.status, "paid"), gte(billingCheckouts.paidAt, prevStart), lt(billingCheckouts.paidAt, start)))
      .limit(5000),
    db.select(countExpr).from(profiles).where(gte(profiles.createdAt, start)),
    db.select(countExpr).from(profiles).where(and(gte(profiles.createdAt, prevStart), lt(profiles.createdAt, start))),
    db.select({ balance: aiCreditWallets.balance }).from(aiCreditWallets).limit(2000),
    db.select({ status: paymentWebhookEvents.status }).from(paymentWebhookEvents).orderBy(desc(paymentWebhookEvents.receivedAt)).limit(8),
    db.select({ status: billingCheckouts.status }).from(billingCheckouts).limit(5000),
    db.select({ id: videos.id }).from(videos).where(and(eq(videos.status, "processing"), lt(videos.createdAt, new Date(now - 86_400_000)))).limit(10),
    db.select({ userId: subscriptions.userId }).from(subscriptions).where(eq(subscriptions.status, "past_due")).limit(20),
    db.select(countExpr).from(subscriptions).where(and(eq(subscriptions.status, "active"), isNull(subscriptions.currentPeriodEnd))),
    db.select({ userId: subscriptions.userId }).from(subscriptions).where(and(eq(subscriptions.status, "active"), lt(subscriptions.currentPeriodEnd, new Date(now + 7 * 86_400_000)))).limit(20),
    db.select({ action: adminAuditLog.action, adminUserId: adminAuditLog.adminUserId, createdAt: adminAuditLog.createdAt })
      .from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(8),
  ]);

  const revenue = paidRows.reduce((sum, item) => sum + item.amountCents, 0);
  const prevRevenue = prevPaidRows.reduce((sum, item) => sum + item.amountCents, 0);
  const dayKey = (date: Date) => date.toISOString().slice(0, 10);
  const currentByDay = new Map<string, number>();
  for (const item of paidRows) if (item.paidAt) currentByDay.set(dayKey(item.paidAt), (currentByDay.get(dayKey(item.paidAt)) ?? 0) + item.amountCents);
  const prevByDay = new Map<string, number>();
  for (const item of prevPaidRows) if (item.paidAt) prevByDay.set(dayKey(item.paidAt), (prevByDay.get(dayKey(item.paidAt)) ?? 0) + item.amountCents);
  const dayLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
  const barGroups: AdminBarGroup[] = [];
  for (let i = 0; i < days; i++) {
    const key = new Date(now - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const showLabel = days <= 30 || i % 7 === days - 1 || i === 0;
    barGroups.push({
      label: showLabel ? dayLabel.format(new Date(`${key}T12:00:00Z`)) : "",
      current: (currentByDay.get(key) ?? 0) / 100,
      previous: (prevByDay.get(key) ?? 0) / 100,
    });
  }

  const statusCounts = new Map<string, number>();
  for (const row of checkoutStatuses) statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  const totalCheckouts = [...statusCounts.values()].reduce((sum, count) => sum + count, 0);
  const statusLabel: Record<string, string> = { paid: "Pago", pending: "Pendente", creating: "Criando", processing: "Processando", failed: "Falhou", expired: "Expirado", cancelled: "Cancelado", refunded: "Reembolsado" };
  const statusColor: Record<string, string> = { paid: "var(--chart-1)", creating: "var(--chart-2)", pending: "var(--chart-3)", processing: "var(--chart-4)", failed: "#ef4444", expired: "var(--chart-3)", cancelled: "var(--chart-5)", refunded: "var(--chart-5)" };
  const checkoutRingData = [...statusCounts.entries()].sort((a, b) => b[1] - a[1]).map(([status, count]) => ({ label: statusLabel[status] ?? status, value: count, maxValue: totalCheckouts, color: statusColor[status] ?? "var(--chart-3)" }));

  const failedHooks = webhooks.filter((item) => item.status === "failed");
  const creditBalance = wallets.reduce((sum, item) => sum + item.balance, 0);
  const attention: Array<{ severity: "alta" | "media"; text: string; href: string }> = [];
  if (failedHooks.length > 0) attention.push({ severity: "alta", text: `${failedHooks.length} webhooks com falha entre os recentes`, href: "/admin/system" });
  if (pastDue.length > 0) attention.push({ severity: "alta", text: `${pastDue.length} assinaturas inadimplentes (past_due)`, href: "/admin/finance" });
  if ((noPeriod[0]?.count ?? 0) > 0) attention.push({ severity: "alta", text: `${noPeriod[0].count} ativas sem período (reativar define +30d)`, href: "/admin/users" });
  if (stuck.length > 0) attention.push({ severity: "media", text: `${stuck.length} vídeos travados em processamento há +24h`, href: "/admin/content" });
  if (expiring.length > 0) attention.push({ severity: "media", text: `${expiring.length} assinaturas vencem em até 7 dias`, href: "/admin/finance" });

  const actorIds = [...new Set(audit.map((item) => item.adminUserId))];
  const actors = actorIds.length ? await db.select({ id: profiles.id, email: profiles.email }).from(profiles).where(inArray(profiles.id, actorIds)) : [];
  const actorEmail = new Map(actors.map((item) => [item.id, item.email]));
  const actionLabel: Record<string, string> = { plan_change: "Troca de plano", subscription_suspend: "Suspensão", subscription_reactivate: "Reativação", trial_extend: "Trial +", trial_reset: "Trial reset", credit_adjust: "Créditos", support_case_opened: "Caso aberto", support_case_updated: "Caso atualizado", support_note_added: "Nota", team_role_changed: "Equipe", roadmap_task_moved: "Roadmap: task movida", roadmap_task_updated: "Roadmap: task editada", roadmap_task_deleted: "Roadmap: task excluída" };

  return <div className="space-y-5">
    <Reveal>
      <AdminGreeting title={greetingFor()} subtitle={`Acompanhe o negócio, priorize a atenção e monitore a equipe — últimos ${days} dias.`}>
        <div className="flex items-center gap-1 rounded-full border bg-white p-1 themeable-border-hairline dark:bg-white/[0.035]">
          {PERIODS.map((option) => (
            <Link key={option} href={option === 30 ? "/admin" : `/admin?period=${option}`} aria-current={days === option ? "true" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B9FF66] ${days === option ? "bg-[#191A23] text-white dark:bg-[#B9FF66] dark:text-[#191A23]" : "text-slate-500 hover:bg-slate-100 hover:text-[#191A23] dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"}`}>
              {option}d
            </Link>
          ))}
        </div>
      </AdminGreeting>
    </Reveal>

    <Reveal delay={0.05}>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <AdminKpi variant="hero" label={`Receita ${days}d`} value={money(revenue)} detail="checkouts pagos no período" icon={CircleDollarSign} index={0} />
        <AdminKpi label="Contas" value={(users[0]?.count ?? 0).toLocaleString("pt-BR")} numericValue={users[0]?.count ?? 0} detail="cadastradas (total)" icon={Users} index={1} />
        <AdminKpi label="Novas contas" value={(signups[0]?.count ?? 0).toLocaleString("pt-BR")} delta={delta(signups[0]?.count ?? 0, prevSignups[0]?.count ?? 0)} detail={`no período de ${days}d`} icon={Video} index={2} />
        <AdminKpi label="Assinaturas ativas" value={(active[0]?.count ?? 0).toLocaleString("pt-BR")} numericValue={active[0]?.count ?? 0} detail="pagando agora" icon={CreditCard} index={3} />
        <AdminKpi label="VSLs" value={(videosCount[0]?.count ?? 0).toLocaleString("pt-BR")} numericValue={videosCount[0]?.count ?? 0} detail="vídeos na plataforma" icon={Video} index={4} />
        <AdminKpi label="Créditos em carteira" value={creditBalance.toLocaleString("pt-BR")} numericValue={creditBalance} detail="saldo dos clientes" icon={BrainCircuit} index={5} />
      </section>
    </Reveal>

    <Reveal delay={0.1}>
      <section className="grid gap-4 xl:grid-cols-[1.4fr_.6fr]">
        <AdminCard title="Receita recebida" description={`Checkouts pagos por dia — atual vs ${days} dias anteriores.`}>
          <div className="pt-4"><AdminBarChart groups={barGroups} valueFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : `${Math.round(value)}`} /></div>
        </AdminCard>
        <AdminCard title="Checkouts por status" description="Distribuição registrada na cobrança.">
          {checkoutRingData.length > 0 ? <AdminCheckoutRing data={checkoutRingData} /> : <div className="p-5 text-[12px] themeable-text-ink-muted-48">Nenhum checkout registrado ainda.</div>}
        </AdminCard>
      </section>
    </Reveal>

    <Reveal delay={0.15}>
      <section className="grid gap-4 xl:grid-cols-[1.4fr_.6fr]">
        <AdminCard title={`Atenção (${attention.length})`} description="Condições verificadas agora, não lista estática.">
          <div className="px-2 pb-2">
            {attention.map((item) => (
              <Link key={item.text} href={item.href} className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-slate-50 dark:hover:bg-white/5">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.severity === "alta" ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"}`}><Activity size={16} aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <AdminDotPill label={item.severity === "alta" ? "Crítico" : "Média"} tone={item.severity === "alta" ? "bad" : "warn"} />
                  <span className="mt-0.5 block truncate text-[13px] font-semibold themeable-text-ink">{item.text}</span>
                </span>
                <span className="text-[12px] font-bold text-[#191A23] underline decoration-[#B9FF66] decoration-2 underline-offset-4 dark:text-[#B9FF66]">Investigar</span>
              </Link>
            ))}
            {attention.length === 0 && <p className="px-3 py-4 text-[13px] themeable-text-ink-muted-48">Nada pendente: webhooks fluindo, sem inadimplência nem processamento travado.</p>}
          </div>
        </AdminCard>
        <AdminCard title="Acesso rápido" description="Fluxos reais.">
          <div className="grid grid-cols-2 gap-2 px-5 pb-5">
            {[
              { href: "/admin/users", label: "Buscar conta", icon: Search },
              { href: "/admin/support", label: "Abrir suporte", icon: Activity },
              { href: "/admin/system", label: "Ver webhooks", icon: Activity },
              { href: "/admin/content", label: "Consultar vídeo", icon: Video },
            ].map((item) => (
              <Link key={item.href + item.label} href={item.href} className="flex items-center gap-2 rounded-2xl border px-3 py-3 text-[12px] font-semibold transition hover:border-[#B9FF66] hover:bg-[#B9FF66]/10 themeable-border-hairline">
                <item.icon size={15} aria-hidden />{item.label}
              </Link>
            ))}
          </div>
        </AdminCard>
      </section>
    </Reveal>

    <Reveal delay={0.2}>
      <AdminCard title="Atividade administrativa" description="Últimas ações da equipe.">
        <div className="px-2 pb-2">
          {audit.map((item, index) => (
            <div key={index} className="flex items-center gap-3 rounded-2xl px-3 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#B9FF66]/20 text-[#191A23] dark:text-[#B9FF66]"><Activity size={15} aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold themeable-text-ink">{actionLabel[item.action] ?? item.action}</span>
                <span className="block truncate text-[11px] themeable-text-ink-muted-48">{actorEmail.get(item.adminUserId) ?? "—"}</span>
              </span>
              <span className="whitespace-nowrap text-[11px] font-medium themeable-text-ink-muted-48">{dateTimeFormat.format(item.createdAt)}</span>
            </div>
          ))}
          {audit.length === 0 && <p className="px-3 py-4 text-[13px] themeable-text-ink-muted-48">Nenhuma ação registrada no período.</p>}
        </div>
      </AdminCard>
    </Reveal>
  </div>;
}
