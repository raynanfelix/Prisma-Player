"use client";

import { useMemo, useState } from "react";

import { Check, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import IntegrationDetail from "./IntegrationDetail";
import { DomainsManager, FeatureInfo } from "./FeatureAppDetails";
import { AppMark } from "./store-mark";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  STORE_APPS,
  type IntegrationItem,
  type StoreApp,
  type VslOption,
} from "./store-data";

export type { IntegrationItem, VslOption } from "./store-data";

interface Props {
  integrations: IntegrationItem[];
  vsls: VslOption[];
}

/** Badge verde de destaque (tokens da Prisma: verde-lima sobre tinta). */
function GreenBadge({ children }: { children: string }) {
  return <Badge className="bg-[#B9FF66] text-[#191A23] hover:bg-[#B9FF66]">{children}</Badge>;
}

function CardBadge({ app, installed }: { app: StoreApp; installed: boolean }) {
  if (app.kind === "provider") {
    if (app.comingSoon) return <Badge variant="secondary">Em breve</Badge>;
    if (installed) return <GreenBadge>Instalado</GreenBadge>;
    if (app.showAvailableBadge) return <GreenBadge>Disponível</GreenBadge>;
    return null;
  }
  return <GreenBadge>Disponível</GreenBadge>;
}

export default function IntegrationsStore({ integrations, vsls }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StoreApp | null>(null);

  const byProvider = useMemo(() => {
    const map = new Map<string, IntegrationItem>();
    for (const item of integrations) map.set(item.provider, item);
    return map;
  }, [integrations]);

  if (selected?.kind === "provider") {
    return (
      <IntegrationDetail
        app={selected}
        existing={byProvider.get(selected.provider) ?? null}
        vsls={vsls}
        onBack={() => setSelected(null)}
      />
    );
  }

  if (selected?.kind === "feature") {
    const featureProps = { app: selected, vsls, onBack: () => setSelected(null) };
    return selected.detail === "domains" ? <DomainsManager {...featureProps} /> : <FeatureInfo {...featureProps} />;
  }

  const term = search.trim().toLowerCase();

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <div className="relative">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar" aria-label="Pesquisar app no marketplace" className="h-10 w-56 pl-9" />
          <Search aria-hidden className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
        </div>
      </div>

      {CATEGORY_ORDER.map((category) => {
        const items = STORE_APPS.filter((app) => app.category === category && (!term || app.name.toLowerCase().includes(term)));
        if (items.length === 0) return null;
        return (
          <section key={category} className="space-y-3">
            <h3 className="text-[13px] font-semibold text-muted-foreground">{CATEGORY_LABEL[category]}</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((app) => {
                const existing = app.kind === "provider" ? byProvider.get(app.provider) : undefined;
                const installed = Boolean(existing);
                const linkedCount = existing?.vslIds.length ?? 0;
                const actionLabel = app.kind === "provider" ? (installed ? "Configurar" : "Integrar") : app.actionLabel;
                return (
                  <Card key={app.id} size="sm" className={installed ? "ring-[#B9FF66]/40" : undefined}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2.5">
                        <AppMark app={app} />
                        {app.name}
                        <CardBadge app={app} installed={installed} />
                      </CardTitle>
                      <CardDescription>{app.description}</CardDescription>
                      <CardAction>
                        {app.kind === "provider" && app.comingSoon ? null : (
                          <Button
                            type="button"
                            size="sm"
                            variant={app.kind === "provider" && installed ? "outline" : "default"}
                            className={app.kind === "provider" && installed ? "" : "bg-[#B9FF66] font-semibold text-[#191A23] hover:bg-[#a8f052]"}
                            onClick={() => setSelected(app)}
                          >
                            {actionLabel}
                          </Button>
                        )}
                      </CardAction>
                    </CardHeader>
                    <CardContent>
                      {installed && (
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                          <Check /> {linkedCount} VSL{linkedCount === 1 ? "" : "s"} conectada{linkedCount === 1 ? "" : "s"}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
