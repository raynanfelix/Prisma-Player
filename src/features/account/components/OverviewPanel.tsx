import { Bell, Calculator, CreditCard, Database, HardDrive, Play, Shield, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { AccountOverview, AccountProfile } from "@/features/account/model/types";
import { formatBRL, formatStorageOverage } from "@/lib/billing/catalog";
import { InfoRow, SettingsCard, SettingsSkeleton } from "./SettingsUi";

export function OverviewPanel({
  overview,
  profile,
}: {
  overview: AccountOverview | null;
  profile: AccountProfile | null;
}) {
  if (!overview) return <SettingsSkeleton />;

  const storageBytes = Number(overview.usage.storageBytes);
  const storageGb = (Number.isFinite(storageBytes) && storageBytes > 0 ? storageBytes : 0) / 1024 ** 3;
  const plan = overview.plan;
  const metrics = [
    {
      icon: Play,
      label: "Plays neste mês",
      value: overview.usage.plays.toLocaleString("pt-BR"),
      detail: plan ? `de ${plan.included_plays.toLocaleString("pt-BR")}` : "sem plano",
      percent: plan?.included_plays ? (overview.usage.plays / plan.included_plays) * 100 : 0,
    },
    {
      icon: HardDrive,
      label: "Biblioteca",
      value: `${storageGb.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB`,
      detail: plan ? `de ${plan.storage_gb} GB` : `${overview.usage.videos} vídeos`,
      percent: plan?.storage_gb ? (storageGb / plan.storage_gb) * 100 : 0,
    },
    {
      icon: Sparkles,
      label: "Créditos Prisma IA",
      value: overview.usage.aiCredits.toLocaleString("pt-BR"),
      detail: `${overview.usage.aiUsed} utilizados`,
      percent: 0,
    },
    {
      icon: Database,
      label: "VSLs na conta",
      value: overview.usage.videos.toLocaleString("pt-BR"),
      detail: "organizadas na biblioteca",
      percent: 0,
    },
  ];

  const bandwidth = overview.usage.bandwidth;
  if (bandwidth) {
    const trendDetail = bandwidth.trendPct === null ? "" : ` · ${bandwidth.trendPct > 0 ? "+" : ""}${bandwidth.trendPct.toFixed(0)}% últimos 7 dias`;
    metrics.push({
      icon: Calculator,
      label: "Custo de banda (estimado)",
      value: formatBRL(bandwidth.monthCostCents),
      detail: `${bandwidth.gb.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB / ${formatStorageOverage(bandwidth.centsPerGb)} por GB${trendDetail}`,
      percent: 0,
    });
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 p-5 sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Sua operação</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              {profile?.full_name || "Conta Prisma"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {plan
                ? `${plan.name} ativo`
                : overview.access.trialStatus === "active"
                  ? "Teste gratuito ativo"
                  : "Escolha um plano para publicar"}
            </p>
          </div>
          <Button className="rounded-full" render={<Link href="/dashboard/billing" />}>
            Gerenciar plano
          </Button>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-5">
          {metrics.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.label} className="border-b border-r border-border/60 p-5 last:border-r-0">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                </div>
                <strong className="mt-3 block text-2xl tracking-tight">{item.value}</strong>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                {item.percent > 0 && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={item.percent >= 90 ? "h-full rounded-full bg-amber-500" : "h-full rounded-full bg-primary"}
                      style={{ width: `${Math.min(item.percent, 100)}%` }}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <SettingsCard title="Acesso e cobrança" description="Assinatura e período de acesso.">
          <div className="space-y-3">
            <InfoRow
              icon={CreditCard}
              title={plan?.name ?? "Sem assinatura"}
              detail={
                overview.subscription?.currentPeriodEnd
                  ? `Válido até ${new Date(overview.subscription.currentPeriodEnd).toLocaleDateString("pt-BR")}`
                  : overview.access.trialEndsAt
                    ? `Teste até ${new Date(overview.access.trialEndsAt).toLocaleDateString("pt-BR")}`
                    : "Ative o teste ou escolha um plano"
              }
            />
            <InfoRow icon={Sparkles} title="Prisma IA" detail={`${overview.usage.aiCredits} créditos disponíveis`} />
          </div>
        </SettingsCard>
        <SettingsCard title="Proteção da conta" description="Camadas que protegem sua operação.">
          <div className="space-y-3">
            <InfoRow icon={Shield} title="Sessão protegida" detail="Sua sessão é validada em todas as áreas privadas." />
            <InfoRow
              icon={Bell}
              title="Alertas de segurança"
              detail={profile?.security_notifications ? "Ativados" : "Desativados nas preferências"}
            />
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
