import { AdminHeader, AdminMetric, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import { Filter, Layers, Repeat, UserPlus } from "lucide-react";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { accountAccess, billingPlans, profiles, subscriptions, videos } = schema;

export const dynamic = "force-dynamic";

/**
 * Crescimento: funil da empresa com dados do próprio banco (sem PII de
 * espectadores): cadastros → trial ativo → assinatura ativa, mix de planos,
 * cancelados recentes e armazenamento por conta (custo vs receita).
 */
export default async function AdminGrowthPage() {
  const [signupRows, accessRows, subRows, planRows, videoRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(profiles),
    db.select({ trialStatus: accountAccess.trialStatus }).from(accountAccess).limit(5000),
    db.select({
      userId: subscriptions.userId,
      status: subscriptions.status,
      planSlug: billingPlans.slug,
      planName: billingPlans.name,
    })
      .from(subscriptions)
      .leftJoin(billingPlans, eq(billingPlans.id, subscriptions.planId))
      .limit(5000),
    db.select({ slug: billingPlans.slug, name: billingPlans.name }).from(billingPlans).where(eq(billingPlans.isActive, true)),
    db.select({ userId: videos.userId, sizeBytes: videos.sizeBytes }).from(videos).limit(5000),
  ]);

  const signups = signupRows[0]?.count ?? 0;
  const trialActive = accessRows.filter((item) => item.trialStatus === "active").length;
  const subs = subRows.map((item) => ({
    user_id: item.userId,
    status: item.status,
    plan: item.planSlug ? { slug: item.planSlug, name: item.planName ?? "" } : null,
  }));
  const paid = subs.filter((item) => item.status === "active");
  const funnel = [
    { label: "Cadastros", value: signups },
    { label: "Trial ativo", value: trialActive },
    { label: "Assinando", value: paid.length },
  ];

  const mix = new Map<string, number>();
  for (const item of paid) {
    mix.set(item.plan?.name ?? "?", (mix.get(item.plan?.name ?? "?") ?? 0) + 1);
  }
  const cancelled = subs.filter((item) => ["cancelled", "expired", "suspended"].includes(item.status));

  const storage = new Map<string, number>();
  for (const video of videoRows) storage.set(video.userId, (storage.get(video.userId) ?? 0) + Number(video.sizeBytes || 0));
  const topStorage = [...storage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const ownerIds = topStorage.map(([id]) => id);
  const owners = ownerIds.length ? await db.select({ id: profiles.id, email: profiles.email }).from(profiles).where(inArray(profiles.id, ownerIds)) : [];
  const emailOf = new Map(owners.map((item) => [item.id, item.email]));
  const gb = (bytes: number) => `${(bytes / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB`;

  return <div>
    <AdminHeader title="Crescimento" description="Funil da empresa, mix de planos, cancelados e quem mais consome storage." />
    <section className="grid gap-4 sm:grid-cols-3">
      {funnel.map((step, index) => {
        const rate = index === 0 || funnel[index - 1].value === 0 ? null : `${((step.value / funnel[index - 1].value) * 100).toFixed(1)}%`;
        return <AdminMetric key={step.label} label={step.label} value={step.value.toLocaleString("pt-BR")} detail={rate ? `${rate} da etapa anterior` : "topo do funil"} icon={index === 0 ? UserPlus : index === 1 ? Filter : Repeat} tone={index === 2 ? "green" : undefined} />;
      })}
    </section>
    <div className="mt-6 grid gap-5 xl:grid-cols-3">
      <AdminPanel title="Mix de planos pagos" description="Assinaturas ativas por plano."><div className="space-y-3 p-5">{planRows.map((plan) => { const count = mix.get(plan.name) ?? 0; const pct = paid.length ? Math.round((count / paid.length) * 100) : 0; return <div key={plan.slug}><div className="flex justify-between text-[12px]"><span className="font-semibold themeable-text-ink">{plan.name}</span><span className="themeable-text-ink-muted-48">{count} · {pct}%</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-card"><div className="h-full rounded-full bg-selected" style={{ width: `${pct}%` }} /></div></div>; })}</div></AdminPanel>
      <AdminPanel title="Cancelados e suspensos" description={`${cancelled.length} contas fora da base pagante.`}><div className="max-h-72 space-y-2 overflow-y-auto p-5">{cancelled.slice(0, 30).map((item) => <div key={item.user_id} className="flex items-center justify-between gap-2 text-[12px]"><span className="truncate themeable-text-ink-muted-48">{item.user_id.slice(0, 8)}… · {item.plan?.name ?? "?"}</span><StatusPill value={item.status} /></div>)}</div></AdminPanel>
      <AdminPanel title="Top storage por conta" description="Custo concentrado: cruzar com o plano de cada conta."><div className="space-y-2 p-5">{topStorage.map(([id, bytes]) => <div key={id} className="flex items-center justify-between gap-2 text-[12px]"><span className="truncate themeable-text-ink-muted-48">{emailOf.get(id) ?? `${id.slice(0, 8)}…`}</span><span className="font-semibold themeable-text-ink"><Layers size={12} className="mr-1 inline" />{gb(bytes)}</span></div>)}</div></AdminPanel>
    </div>
  </div>;
}
