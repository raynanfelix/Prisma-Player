import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { AdminHeader, AdminMetric, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import UserActions from "@/components/admin/UserActions";
import { isSubscriptionEffective, subscriptionDisplayStatus } from "@/lib/access/service";
import { CreditCard, HardDrive, Radio, Video, Wallet } from "lucide-react";
import { db, schema } from "@/lib/db";
import { isoOrNull } from "@/lib/datetime";
import { formatBrlFromCents as money } from "@/lib/format/money";

const {
  accountAccess,
  adminAuditLog,
  aiCreditLedger,
  aiCreditWallets,
  billingCheckouts,
  billingPlans,
  profiles,
  subscriptions,
  videoEvents,
  videos: videosTable,
} = schema;

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Customer 360: tudo da conta em um lugar - perfil, assinatura, vídeos,
 * créditos, checkouts, eventos e auditoria. Ações de suporte no contexto.
 */
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const [profileRow] = await db.select({ id: profiles.id, email: profiles.email, fullName: profiles.fullName, createdAt: profiles.createdAt })
    .from(profiles).where(eq(profiles.id, id)).limit(1);
  if (!profileRow) notFound();

  const [subscriptionRows, accessRows, walletRows, videoRows, checkoutRows, eventsCountRows, ledgerRows, logRows, planRows] = await Promise.all([
    db.select({
      status: subscriptions.status,
      billingMethod: subscriptions.billingMethod,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      planSlug: billingPlans.slug,
      planName: billingPlans.name,
      planAmountCents: billingPlans.amountCents,
      planStorageGb: billingPlans.storageGb,
      planIncludedPlays: billingPlans.includedPlays,
      planTeamSeats: billingPlans.teamSeats,
    })
      .from(subscriptions)
      .leftJoin(billingPlans, eq(billingPlans.id, subscriptions.planId))
      .where(eq(subscriptions.userId, id))
      .limit(1),
    db.select({ trialStatus: accountAccess.trialStatus, trialEndsAt: accountAccess.trialEndsAt, onboardingCompleted: accountAccess.onboardingCompleted })
      .from(accountAccess).where(eq(accountAccess.userId, id)).limit(1),
    db.select({ balance: aiCreditWallets.balance, lifetimePurchased: aiCreditWallets.lifetimePurchased, lifetimeUsed: aiCreditWallets.lifetimeUsed })
      .from(aiCreditWallets).where(eq(aiCreditWallets.userId, id)).limit(1),
    db.select({ id: videosTable.id, title: videosTable.title, status: videosTable.status, sizeBytes: videosTable.sizeBytes, createdAt: videosTable.createdAt })
      .from(videosTable).where(eq(videosTable.userId, id)).orderBy(desc(videosTable.createdAt)).limit(50),
    db.select({
      id: billingCheckouts.id,
      amountCents: billingCheckouts.amountCents,
      checkoutType: billingCheckouts.checkoutType,
      status: billingCheckouts.status,
      paidAt: billingCheckouts.paidAt,
      createdAt: billingCheckouts.createdAt,
      planName: billingPlans.name,
    })
      .from(billingCheckouts)
      .leftJoin(billingPlans, eq(billingPlans.id, billingCheckouts.planId))
      .where(eq(billingCheckouts.userId, id))
      .orderBy(desc(billingCheckouts.createdAt))
      .limit(20),
    db.select({ count: sql<number>`count(*)::int` }).from(videoEvents).where(eq(videoEvents.userId, id)),
    db.select({ amount: aiCreditLedger.amount, reason: aiCreditLedger.reason, reference: aiCreditLedger.reference, createdAt: aiCreditLedger.createdAt })
      .from(aiCreditLedger).where(eq(aiCreditLedger.userId, id)).orderBy(desc(aiCreditLedger.createdAt)).limit(20),
    db.select({ action: adminAuditLog.action, adminUserId: adminAuditLog.adminUserId, details: adminAuditLog.details, createdAt: adminAuditLog.createdAt })
      .from(adminAuditLog).where(eq(adminAuditLog.targetUserId, id)).orderBy(desc(adminAuditLog.createdAt)).limit(20),
    db.select({ slug: billingPlans.slug, name: billingPlans.name }).from(billingPlans).where(eq(billingPlans.isActive, true)).orderBy(asc(billingPlans.displayOrder)),
  ]);

  const subscription = subscriptionRows[0] ? {
    status: subscriptionRows[0].status,
    billing_method: subscriptionRows[0].billingMethod,
    current_period_start: isoOrNull(subscriptionRows[0].currentPeriodStart),
    current_period_end: isoOrNull(subscriptionRows[0].currentPeriodEnd),
    plan: subscriptionRows[0].planSlug ? {
      slug: subscriptionRows[0].planSlug,
      name: subscriptionRows[0].planName ?? "",
      amount_cents: subscriptionRows[0].planAmountCents ?? 0,
      storage_gb: subscriptionRows[0].planStorageGb ?? 0,
      included_plays: subscriptionRows[0].planIncludedPlays ?? 0,
      team_seats: subscriptionRows[0].planTeamSeats ?? 1,
    } : null,
  } : null;
  const access = accessRows[0] ? {
    trial_status: accessRows[0].trialStatus,
    trial_ends_at: isoOrNull(accessRows[0].trialEndsAt),
    onboarding_completed: accessRows[0].onboardingCompleted,
  } : null;
  const wallet = walletRows[0] ?? null;
  const videos = videoRows.map((video) => ({
    id: video.id,
    title: video.title,
    status: video.status,
    size_bytes: video.sizeBytes,
    created_at: video.createdAt.toISOString(),
  }));
  const checkouts = checkoutRows.map((checkout) => ({
    id: checkout.id,
    amount_cents: checkout.amountCents,
    checkout_type: checkout.checkoutType,
    status: checkout.status,
    paid_at: isoOrNull(checkout.paidAt),
    created_at: checkout.createdAt.toISOString(),
    plan: checkout.planName ? { name: checkout.planName } : null,
  }));
  const ledger = ledgerRows.map((entry) => ({
    amount: entry.amount,
    reason: entry.reason,
    reference: entry.reference,
    created_at: entry.createdAt.toISOString(),
  }));
  const logs = logRows.map((log) => ({
    action: log.action,
    admin_user_id: log.adminUserId,
    details: log.details,
    created_at: log.createdAt.toISOString(),
  }));
  const plans = planRows;
  const eventsCount = eventsCountRows[0]?.count ?? 0;
  const profile = {
    id: profileRow.id,
    email: profileRow.email,
    full_name: profileRow.fullName,
    created_at: profileRow.createdAt.toISOString(),
  };

  const plan = subscription?.plan ?? null;
  const storageBytes = videos.reduce((sum, item) => sum + Number(item.size_bytes || 0), 0);
  const storageGb = storageBytes / 1024 ** 3;
  const adminIds = [...new Set(logs.map((log) => log.admin_user_id))];
  const operators = adminIds.length ? await db.select({ id: profiles.id, email: profiles.email }).from(profiles).where(inArray(profiles.id, adminIds)) : [];
  const operatorEmail = new Map(operators.map((item) => [item.id, item.email]));
  const actionLabel: Record<string, string> = { plan_change: "Troca de plano", subscription_suspend: "Suspensão", subscription_reactivate: "Reativação", trial_extend: "Trial estendido", trial_reset: "Trial resetado", credit_adjust: "Ajuste de créditos" };

  return <div>
    <AdminHeader title={profile.full_name || profile.email} description={`${profile.email} · desde ${new Date(profile.created_at).toLocaleDateString("pt-BR")} · ${id}`} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AdminMetric label="Assinatura" value={subscriptionDisplayStatus(subscription ?? null)} detail={plan ? `${plan.name} · ${money(plan.amount_cents)}/mês` : "sem plano"} icon={CreditCard} tone={isSubscriptionEffective(subscription ?? null) ? "green" : "red"} />
      <AdminMetric label="Trial" value={access?.trial_status ?? "-"} detail={access?.trial_ends_at ? `até ${new Date(access.trial_ends_at).toLocaleDateString("pt-BR")}` : "sem trial ativo"} icon={Video} />
      <AdminMetric label="Storage" value={`${storageGb.toFixed(2)} GB`} detail={`sem limite · ${videos.length} vídeo${videos.length === 1 ? "" : "s"}`} icon={HardDrive} tone="blue" />
      <AdminMetric label="Créditos IA" value={(wallet?.balance ?? 0).toLocaleString("pt-BR")} detail={`usados ${(wallet?.lifetimeUsed ?? 0).toLocaleString("pt-BR")} · eventos ${eventsCount}`} icon={Wallet} />
    </section>

    <div className="mt-6"><AdminPanel title="Ações de suporte" description="Toda ação exige confirmação e motivo, e entra na trilha abaixo."><div className="max-w-xl p-5"><UserActions userId={id} email={profile.email} plans={plans} subStatus={subscription?.status ?? null} /></div></AdminPanel></div>

    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      <AdminPanel title="Assinatura e pagamentos" description="Ciclo, método e checkouts da conta."><div className="space-y-2 p-5 text-[12px]">
        <p className="themeable-text-ink">Status: {subscription ? <StatusPill value={subscriptionDisplayStatus(subscription)} /> : "-"}</p>
        <p className="themeable-text-ink-muted-48">Método: {subscription?.billing_method ?? "-"} · Período: {subscription?.current_period_start ? new Date(subscription.current_period_start).toLocaleDateString("pt-BR") : "-"} → {subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString("pt-BR") : "-"}</p>
        {(checkouts).map((checkout) => { const item = Array.isArray(checkout.plan) ? checkout.plan[0] : checkout.plan; return <div key={checkout.id} className="flex items-center justify-between gap-2 rounded-xl border p-3 themeable-border-hairline"><span className="themeable-text-ink">{item?.name ?? "?"} · {money(checkout.amount_cents)} · {checkout.checkout_type}</span><StatusPill value={checkout.status} /></div>; })}
        {checkouts.length === 0 && <p className="themeable-text-ink-muted-48">Nenhum checkout.</p>}
      </div></AdminPanel>
      <AdminPanel title="Vídeos e players" description={`${videos.length} vídeos (50 recentes).`}><div className="max-h-80 space-y-2 overflow-y-auto p-5">{videos.map((video) => <div key={video.id} className="flex items-center justify-between gap-2 text-[12px]"><span className="max-w-[60%] truncate font-semibold themeable-text-ink">{video.title}</span><StatusPill value={video.status} /></div>)}{videos.length === 0 && <p className="text-[12px] themeable-text-ink-muted-48">Nenhum vídeo.</p>}</div></AdminPanel>
      <AdminPanel title="Créditos e ledger" description="Saldo e últimos 20 lançamentos."><div className="space-y-2 p-5 text-[12px]">{ledger.map((entry, index) => <div key={index} className="flex items-center justify-between gap-2"><span className="themeable-text-ink-muted-48">{entry.reason} · {new Date(entry.created_at).toLocaleDateString("pt-BR")}</span><span className={`font-bold ${entry.amount >= 0 ? "text-emerald-600" : "text-red-500"}`}>{entry.amount >= 0 ? "+" : ""}{entry.amount}</span></div>)}{ledger.length === 0 && <p className="themeable-text-ink-muted-48">Sem movimentos.</p>}</div></AdminPanel>
      <AdminPanel title="Auditoria da conta" description="Ações administrativas sobre esta conta. Somente leitura."><div className="space-y-2 p-5 text-[12px]">{logs.map((log, index) => <div key={index} className="flex items-center justify-between gap-2"><span className="font-semibold themeable-text-ink">{actionLabel[log.action] ?? log.action}</span><span className="themeable-text-ink-muted-48">{operatorEmail.get(log.admin_user_id) ?? "-"} · {new Date(log.created_at).toLocaleString("pt-BR")}</span></div>)}{logs.length === 0 && <p className="themeable-text-ink-muted-48">Nenhuma ação registrada.</p>}</div></AdminPanel>
    </div>
    <p className="mt-6 text-[12px] themeable-text-ink-muted-48"><Link href="/admin/users" className="font-semibold underline">← Voltar para contas</Link> · <Radio size={12} className="inline" /> {eventsCount} eventos de reprodução vinculados.</p>
  </div>;
}
