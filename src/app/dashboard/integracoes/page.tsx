import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";

import IntegrationsStore, {
  type IntegrationItem,
  type VslOption,
} from "@/features/integrations/components/IntegrationsStore";
import { requireUser } from "@/lib/auth/server";
import { getAccountPlan } from "@/lib/access/service";
import { db, schema } from "@/lib/db";
import { loadAccountBenchmark } from "@/lib/intelligence/benchmark";
import { listIntegrations, maskIntegrationConfig } from "@/lib/integrations/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketplace de apps · Prisma Player" };

const { videos } = schema;

export default async function IntegracoesPage() {
  const userId = await requireUser("/dashboard/integracoes");

  const [rows, vslRows, readyRows, plan] = await Promise.all([
    listIntegrations(userId),
    db
      .select({ id: videos.id, title: videos.title })
      .from(videos)
      .where(eq(videos.userId, userId))
      .orderBy(desc(videos.createdAt))
      .limit(200),
    // Benchmark privado considera apenas VSLs prontas (mesmo recorte do cron).
    db
      .select({ id: videos.id, title: videos.title })
      .from(videos)
      .where(and(eq(videos.userId, userId), eq(videos.status, "ready")))
      .orderBy(desc(videos.createdAt))
      .limit(200),
    getAccountPlan(userId),
  ]);

  // Contrato do item 2 do hardening: segredos NUNCA saem daqui com o valor
  // cru — a page renderiza o mesmo payload mascarado do GET /api/integrations
  // ("" + hasToken/hasWebhookUrl), que a UI usa para o placeholder "••••".
  const integrations: IntegrationItem[] = rows.map((item) => {
    const masked = maskIntegrationConfig(item.provider, item.config);
    return {
      provider: item.provider,
      instanceId: item.instanceId,
      name: item.name,
      config: masked.config,
      vslIds: item.vslIds,
      enabled: item.enabled,
      updatedAt: item.updatedAt.toISOString(),
      hasToken: masked.hasToken,
      hasWebhookUrl: masked.hasWebhookUrl,
    };
  });

  const vsls: VslOption[] = vslRows.map((row) => ({ id: row.id, title: row.title }));
  const benchmarkData = await loadAccountBenchmark(readyRows.map((row) => ({ id: row.id, title: row.title })));

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
      <header>
        <h1 className="text-[22px] font-semibold tracking-[-.03em] themeable-text-ink">Marketplace de apps</h1>
        <p className="mt-1 text-[12px] themeable-text-ink-muted-48">Pixels, webhooks e atribuição para suas VSLs — configurados uma vez por conta.</p>
      </header>
      <IntegrationsStore
        integrations={integrations}
        vsls={vsls}
        capabilities={plan.capabilities}
        benchmarkData={benchmarkData}
      />
    </main>
  );
}
