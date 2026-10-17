import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";

import IntegrationsStore, {
  type IntegrationItem,
  type VslOption,
} from "@/features/integrations/components/IntegrationsStore";
import { requireUser } from "@/lib/auth/server";
import { db, schema } from "@/lib/db";
import { listIntegrations } from "@/lib/integrations/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Integrações · Prisma Player" };

const { videos } = schema;

export default async function IntegracoesPage() {
  const userId = await requireUser("/dashboard/integracoes");

  const [rows, vslRows] = await Promise.all([
    listIntegrations(userId),
    db
      .select({ id: videos.id, title: videos.title })
      .from(videos)
      .where(eq(videos.userId, userId))
      .orderBy(desc(videos.createdAt))
      .limit(200),
  ]);

  const integrations: IntegrationItem[] = rows.map((item) => ({
    provider: item.provider,
    config: Object.fromEntries(Object.entries(item.config).map(([key, value]) => [key, typeof value === "string" ? value : ""])),
    vslIds: item.vslIds,
    enabled: item.enabled,
    updatedAt: item.updatedAt.toISOString(),
  }));

  const vsls: VslOption[] = vslRows.map((row) => ({ id: row.id, title: row.title }));

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-prisma-blue dark:text-white">App de integrações</p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-[-.03em] themeable-text-ink">Integrações</h1>
        <p className="mt-1 text-[12px] themeable-text-ink-muted-48">Pixels, webhooks e atribuição para suas VSLs — configurados uma vez por conta.</p>
      </header>
      <IntegrationsStore integrations={integrations} vsls={vsls} />
    </main>
  );
}
