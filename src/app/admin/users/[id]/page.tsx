import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, AdminMetric, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import UserActions from "@/components/admin/UserActions";
import { isSubscriptionEffective, subscriptionDisplayStatus } from "@/lib/access/service";
import { CreditCard, HardDrive, Radio, Video, Wallet } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Customer 360: tudo da conta em um lugar — perfil, assinatura, vídeos,
 * créditos, checkouts, eventos e auditoria. Ações de suporte no contexto.
 */
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id,email,full_name,created_at").eq("id", id).maybeSingle();
  if (!profile) notFound();

  const [subscriptionRes, accessRes, walletRes, videosRes, checkoutsRes, eventsRes, ledgerRes, logsRes, plansRes] = await Promise.all([
    admin.from("subscriptions").select("status,billing_method,current_period_start,current_period_end,cancelled_at,plan:billing_plans(slug,name,amount_cents,storage_gb,included_plays,team_seats)").eq("user_id", id).maybeSingle(),
    admin.from("account_access").select("trial_status,trial_ends_at,onboarding_completed").eq("user_id", id).maybeSingle(),
    admin.from("ai_credit_wallets").select("balance,lifetime_purchased,lifetime_used").eq("user_id", id).maybeSingle(),
    admin.from("videos").select("id,title,status,size_bytes,created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
    admin.from("billing_checkouts").select("id,amount_cents,checkout_type,status,paid_at,created_at,plan:billing_plans(name)").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    admin.from("video_events").select("id", { count: "exact", head: true }).eq("user_id", id),
    admin.from("ai_credit_ledger").select("amount,reason,reference,created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    admin.from("admin_audit_log").select("action,admin_user_id,details,created_at").eq("target_user_id", id).order("created_at", { ascending: false }).limit(20),
    admin.from("billing_plans").select("slug,name").eq("is_active", true).order("display_order"),
  ]);
  const subscription = subscriptionRes.data;
  const access = accessRes.data;
  const wallet = walletRes.data;
  const videos = videosRes.data ?? [];
  const checkouts = checkoutsRes.data ?? [];
  const ledger = ledgerRes.data ?? [];
  const logs = logsRes.data ?? [];
  const plans = plansRes.data ?? [];
  const eventsCount = eventsRes.count ?? 0;

  const plan = Array.isArray(subscription?.plan) ? subscription.plan[0] : subscription?.plan;
  const storageBytes = videos.reduce((sum, item) => sum + Number(item.size_bytes || 0), 0);
  const storageGb = storageBytes / 1024 ** 3;
  const quotaGb = plan?.storage_gb ?? 5;
  const adminIds = [...new Set(logs.map((log) => log.admin_user_id))];
  const operators = adminIds.length ? await admin.from("profiles").select("id,email").in("id", adminIds) : { data: [] as Array<{ id: string; email: string }> };
  const operatorEmail = new Map((operators.data ?? []).map((item) => [item.id, item.email]));
  const actionLabel: Record<string, string> = { plan_change: "Troca de plano", subscription_suspend: "Suspensão", subscription_reactivate: "Reativação", trial_extend: "Trial estendido", trial_reset: "Trial resetado", credit_adjust: "Ajuste de créditos" };

  return <div>
    <AdminHeader title={profile.full_name || profile.email} description={`${profile.email} · desde ${new Date(profile.created_at).toLocaleDateString("pt-BR")} · ${id}`} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AdminMetric label="Assinatura" value={subscriptionDisplayStatus(subscription ?? null)} detail={plan ? `${plan.name} · ${money(plan.amount_cents)}/mês` : "sem plano"} icon={CreditCard} tone={isSubscriptionEffective(subscription ?? null) ? "green" : "red"} />
      <AdminMetric label="Trial" value={access?.trial_status ?? "—"} detail={access?.trial_ends_at ? `até ${new Date(access.trial_ends_at).toLocaleDateString("pt-BR")}` : "sem trial ativo"} icon={Video} />
      <AdminMetric label="Storage" value={`${storageGb.toFixed(2)} GB`} detail={`limite ${quotaGb} GB · ${videos.length} vídeos`} icon={HardDrive} tone={storageGb > quotaGb ? "red" : "blue"} />
      <AdminMetric label="Créditos IA" value={(wallet?.balance ?? 0).toLocaleString("pt-BR")} detail={`usados ${(wallet?.lifetime_used ?? 0).toLocaleString("pt-BR")} · eventos ${eventsCount}`} icon={Wallet} />
    </section>

    <div className="mt-6"><AdminPanel title="Ações de suporte" description="Toda ação exige confirmação e motivo, e entra na trilha abaixo."><div className="max-w-xl p-5"><UserActions userId={id} email={profile.email} plans={plans} subStatus={subscription?.status ?? null} /></div></AdminPanel></div>

    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      <AdminPanel title="Assinatura e pagamentos" description="Ciclo, método e checkouts da conta."><div className="space-y-2 p-5 text-[12px]">
        <p className="themeable-text-ink">Status: {subscription ? <StatusPill value={subscriptionDisplayStatus(subscription)} /> : "—"}</p>
        <p className="themeable-text-ink-muted-48">Método: {subscription?.billing_method ?? "—"} · Período: {subscription?.current_period_start ? new Date(subscription.current_period_start).toLocaleDateString("pt-BR") : "—"} → {subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString("pt-BR") : "—"}</p>
        {(checkouts).map((checkout) => { const item = Array.isArray(checkout.plan) ? checkout.plan[0] : checkout.plan; return <div key={checkout.id} className="flex items-center justify-between gap-2 rounded-xl border p-3 themeable-border-hairline"><span className="themeable-text-ink">{item?.name ?? "?"} · {money(checkout.amount_cents)} · {checkout.checkout_type}</span><StatusPill value={checkout.status} /></div>; })}
        {checkouts.length === 0 && <p className="themeable-text-ink-muted-48">Nenhum checkout.</p>}
      </div></AdminPanel>
      <AdminPanel title="Vídeos e players" description={`${videos.length} vídeos (50 recentes).`}><div className="max-h-80 space-y-2 overflow-y-auto p-5">{videos.map((video) => <div key={video.id} className="flex items-center justify-between gap-2 text-[12px]"><span className="max-w-[60%] truncate font-semibold themeable-text-ink">{video.title}</span><StatusPill value={video.status} /></div>)}{videos.length === 0 && <p className="text-[12px] themeable-text-ink-muted-48">Nenhum vídeo.</p>}</div></AdminPanel>
      <AdminPanel title="Créditos e ledger" description="Saldo e últimos 20 lançamentos."><div className="space-y-2 p-5 text-[12px]">{ledger.map((entry, index) => <div key={index} className="flex items-center justify-between gap-2"><span className="themeable-text-ink-muted-48">{entry.reason} · {new Date(entry.created_at).toLocaleDateString("pt-BR")}</span><span className={`font-bold ${entry.amount >= 0 ? "text-emerald-600" : "text-red-500"}`}>{entry.amount >= 0 ? "+" : ""}{entry.amount}</span></div>)}{ledger.length === 0 && <p className="themeable-text-ink-muted-48">Sem movimentos.</p>}</div></AdminPanel>
      <AdminPanel title="Auditoria da conta" description="Ações administrativas sobre esta conta. Somente leitura."><div className="space-y-2 p-5 text-[12px]">{logs.map((log, index) => <div key={index} className="flex items-center justify-between gap-2"><span className="font-semibold themeable-text-ink">{actionLabel[log.action] ?? log.action}</span><span className="themeable-text-ink-muted-48">{operatorEmail.get(log.admin_user_id) ?? "—"} · {new Date(log.created_at).toLocaleString("pt-BR")}</span></div>)}{logs.length === 0 && <p className="themeable-text-ink-muted-48">Nenhuma ação registrada.</p>}</div></AdminPanel>
    </div>
    <p className="mt-6 text-[12px] themeable-text-ink-muted-48"><Link href="/admin/users" className="font-semibold underline">← Voltar para contas</Link> · <Radio size={12} className="inline" /> {eventsCount} eventos de reprodução vinculados.</p>
  </div>;
}
