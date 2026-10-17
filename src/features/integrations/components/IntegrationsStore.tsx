"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface IntegrationItem {
  provider: string;
  config: Record<string, string>;
  vslIds: string[];
  enabled: boolean;
  updatedAt: string;
}

export interface VslOption {
  id: string;
  title: string;
}

type ProviderId = "meta_pixel" | "google_ads" | "tiktok" | "utmify" | "discord" | "telegram";

interface ProviderDef {
  id: ProviderId;
  name: string;
  category: "ads" | "webhooks" | "attribution";
  description: string;
  logo: string;
  comingSoon?: boolean;
  /** Campos de configuração na tela de detalhe. */
  fields: Array<{ key: string; label: string; placeholder: string; secret?: boolean; optional?: boolean }>;
  howItWorks: { intro: string; bullets: string[]; note?: string };
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "meta_pixel",
    name: "Meta Pixel Ads",
    category: "ads",
    description: "Pixel de rastreamento para campanhas do Facebook e Instagram Ads.",
    logo: "/assets/facebook.png",
    fields: [
      { key: "pixelId", label: "Chave da API (ID do Pixel)", placeholder: "123456789012345" },
      { key: "accessToken", label: "Access Token (API de Conversões)", placeholder: "EAAx… (Events Manager → API de Conversões)", secret: true },
      { key: "testEventCode", label: "Test Event Code (opcional)", placeholder: "Ex.: TEST12345", optional: true },
    ],
    howItWorks: {
      intro: "O Meta Pixel envia eventos de conversão diretamente para a API de Conversões do Facebook/Instagram, permitindo otimizar suas campanhas com dados precisos de compra.",
      bullets: [
        "Purchase — enviado quando um pagamento é confirmado",
        "Valor da compra e moeda",
        "ID do pedido (deduplicação entre browser e servidor)",
        "E-mail do cliente (hash SHA-256) e informações do dispositivo",
      ],
      note: "Para a API de Conversões você precisa de um Access Token com permissão ads_management.",
    },
  },
  {
    id: "google_ads",
    name: "Google Ads",
    category: "ads",
    description: "Rastreamento para Google Ads e Google Analytics 4.",
    logo: "/assets/google-ads.png",
    fields: [
      { key: "tagId", label: "ID da tag", placeholder: "AW-123456789 ou G-ABC123DEF" },
      { key: "conversionDestination", label: "Destino da conversão (opcional)", placeholder: "AW-123456789/AbCdEfGhIj", optional: true },
    ],
    howItWorks: {
      intro: "A tag do Google dispara conversões de visualização, reprodução, clique no CTA e compra para o Google Ads e o GA4.",
      bullets: ["view_item — a VSL é vista", "video_start / video_progress / video_complete", "generate_lead — clique no CTA", "purchase — compra confirmada no seu checkout"],
    },
  },
  {
    id: "tiktok",
    name: "TikTok",
    category: "ads",
    description: "Pixel de rastreamento para o TikTok Ads Manager.",
    logo: "/assets/tiktok.png",
    fields: [{ key: "pixelId", label: "ID do pixel", placeholder: "CXXXXXXXXXXXXXXXXX" }],
    howItWorks: {
      intro: "O TikTok Pixel registra os eventos da VSL e a compra confirmada para otimizar campanhas no TikTok Ads Manager.",
      bullets: ["ViewContent — a VSL é vista", "Play/Progress/Complete — reprodução", "Purchase — compra confirmada"],
    },
  },
  {
    id: "utmify",
    name: "UTMify",
    category: "attribution",
    description: "Atribuição de vendas por UTM com a origem exata da campanha.",
    logo: "/assets/utmify.png",
    comingSoon: true,
    fields: [],
    howItWorks: {
      intro: "As compras confirmadas pela Prisma serão enviadas ao UTMify com a origem exata da campanha (UTMs capturadas na entrada do espectador).",
      bullets: ["Atribuição por campanha/origem", "Envio automático das compras confirmadas"],
      note: "Integração em finalização.",
    },
  },
  {
    id: "discord",
    name: "Discord",
    category: "webhooks",
    description: "Receba eventos da VSL em um canal do seu servidor.",
    logo: "",
    comingSoon: true,
    fields: [{ key: "webhookUrl", label: "Webhook do Discord", placeholder: "https://discord.com/api/webhooks/…" }],
    howItWorks: {
      intro: "Os eventos da VSL (play, conclusão, compra) serão entregues no canal do seu servidor via webhook do Discord.",
      bullets: ["Mensagem por evento", "Configuração em 1 passo com a URL do webhook"],
      note: "Integração em finalização.",
    },
  },
  {
    id: "telegram",
    name: "Telegram",
    category: "webhooks",
    description: "Receba eventos da VSL no seu bot do Telegram.",
    logo: "",
    comingSoon: true,
    fields: [{ key: "webhookUrl", label: "Webhook do Telegram", placeholder: "https://api.telegram.org/bot…/sendMessage" }],
    howItWorks: {
      intro: "Os eventos da VSL serão entregues no seu chat/bot do Telegram via API de bot.",
      bullets: ["Mensagem por evento", "Configuração em 1 passo com a URL do bot"],
      note: "Integração em finalização.",
    },
  },
];

const CATEGORY_LABEL: Record<ProviderDef["category"], string> = {
  ads: "Plataformas de anúncios",
  webhooks: "Webhooks",
  attribution: "Atribuição",
};

interface Props {
  integrations: IntegrationItem[];
  vsls: VslOption[];
}

export default function IntegrationsStore({ integrations, vsls }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProviderId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftVsls, setDraftVsls] = useState<string[]>([]);
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [resending, setResending] = useState(false);

  const byProvider = useMemo(() => {
    const map = new Map<string, IntegrationItem>();
    for (const item of integrations) map.set(item.provider, item);
    return map;
  }, [integrations]);

  const detail = useMemo(() => PROVIDERS.find((provider) => provider.id === selected) ?? null, [selected]);

  function openDetail(provider: ProviderDef) {
    const existing = byProvider.get(provider.id);
    setError("");
    setSaving(false);
    setSelected(provider.id);
    setDraft(Object.fromEntries(provider.fields.map((field) => [field.key, existing?.config?.[field.key] ?? ""])));
    setDraftVsls(existing?.vslIds ?? []);
    setDraftEnabled(existing?.enabled ?? true);
  }

  async function save(provider: ProviderId) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/integrations", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, config: draft, vslIds: draftVsls, enabled: draftEnabled }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "save_failed");
      setSelected(null);
      router.refresh();
    } catch (saveError) {
      const code = saveError instanceof Error ? saveError.message : "save_failed";
      setError(code === "invalid_config" ? "Dados inválidos: confira os campos." : code === "vsl_not_owned" ? "Há VSLs selecionadas que não são suas." : "Não foi possível salvar agora. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(provider: ProviderId) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/integrations", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!response.ok) throw new Error("remove_failed");
      setSelected(null);
      router.refresh();
    } catch (removeError) {
      setError("Não foi possível remover agora. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  if (detail) {
    const existing = byProvider.get(detail.id);
    const installed = Boolean(existing);
    const linkedCount = (existing?.vslIds ?? draftVsls).length;
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground cursor-pointer">
          <ArrowLeft className="size-4" /> Voltar às integrações
        </button>
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-start gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl border bg-white p-2 dark:bg-white/95">
                {detail.logo ? <Image src={detail.logo} alt="" width={40} height={40} className="size-10 object-contain" /> : <WebhookMark />}
              </span>
              <div className="min-w-0 flex-1">
                <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
                  {detail.name}
                  {detail.comingSoon ? <Badge variant="secondary">Em breve</Badge> : installed ? <Badge className="bg-[#B9FF66] text-[#191A23] hover:bg-[#B9FF66]">Instalado</Badge> : null}
                </CardTitle>
                <CardDescription className="mt-1">{detail.description}</CardDescription>
                <p className="mt-2 text-[11px] text-muted-foreground">{installed ? `${linkedCount} VSL${linkedCount === 1 ? "" : "s"} conectada${linkedCount === 1 ? "" : "s"}` : "Não instalada nesta conta"}</p>
              </div>
            </div>
          </CardHeader>
        </Card>

        {!detail.comingSoon && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurações</CardTitle>
              <CardDescription>Dados da sua conta na plataforma. Tokens ficam no servidor — nunca vão para a embed.</CardDescription>
              <CardAction>
                <button type="button" role="switch" aria-checked={draftEnabled} aria-label={`${draftEnabled ? "Desativar" : "Ativar"} ${detail.name}`} onClick={() => setDraftEnabled((value) => !value)} className={`relative h-6 w-11 rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066cc]/40 cursor-pointer ${draftEnabled ? "bg-[#B9FF66]" : "bg-black/15 dark:bg-white/20"}`}>
                  <span className={`block size-4 rounded-full bg-white shadow-sm transition-transform ${draftEnabled ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              {detail.fields.map((field) => (
                <label key={field.key} className="block text-[12px] font-medium">
                  {field.label}
                  {field.optional ? <span className="font-normal text-muted-foreground"> (opcional)</span> : null}
                  <Input value={draft[field.key] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} autoComplete="off" spellCheck={false} className="mt-1.5 h-10 font-mono text-xs" />
                </label>
              ))}
              {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vincular VSLs</CardTitle>
            <CardDescription>Escolha em quais VSLs esta integração fica ativa — 1 pixel em várias VSLs ou um pixel por VSL.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {vsls.length === 0 && <p className="text-xs text-muted-foreground">Crie uma VSL primeiro em Meus vídeos.</p>}
            {vsls.map((vsl) => {
              const checked = draftVsls.includes(vsl.id);
              return (
                <label key={vsl.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-[13px] transition-colors ${checked ? "border-[#B9FF66]/60 bg-[#B9FF66]/10" : "hover:bg-muted/50"}`}>
                  <span className="truncate font-medium">{vsl.title}</span>
                  <input type="checkbox" className="size-4 accent-[#B9FF66]" checked={checked} onChange={(event) => setDraftVsls((current) => event.target.checked ? [...current, vsl.id] : current.filter((id) => id !== vsl.id))} aria-label={`Vincular ${vsl.title}`} />
                </label>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventos</CardTitle>
            <CardDescription>O que esta integração dispara.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-[13px] font-semibold">Pagamento Confirmado</p>
            <Badge variant="secondary" className="mt-1 font-mono text-[10px]">payment.received</Badge>
            <p className="mt-1.5 text-xs text-muted-foreground">Disparado quando um pagamento é confirmado no seu checkout.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico de Ações</CardTitle>
            <CardDescription>Entregas recentes desta integração.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">Nenhuma ação registrada. O histórico completo chega junto com as conexões oficiais de vendas reportadas.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Como funciona</CardTitle>
            <CardDescription>Entenda como o {detail.name} rastreia suas conversões.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-[13px] leading-6 text-muted-foreground">
            <p>{detail.howItWorks.intro}</p>
            <p className="font-semibold text-foreground">Eventos e dados enviados:</p>
            <ul className="space-y-1">
              {detail.howItWorks.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2"><Check className="mt-1 size-3.5 shrink-0 text-[#B9FF66]" aria-hidden />{bullet}</li>
              ))}
            </ul>
            {detail.howItWorks.note && <p className="text-[11px]">{detail.howItWorks.note}</p>}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2">
            {!detail.comingSoon && (
              <div className="flex gap-2">
                <Button type="button" className="flex-1" disabled={saving} onClick={() => void save(detail.id)}>{saving ? "Salvando…" : "Salvar integração"}</Button>
                {installed && <Button type="button" variant="outline" className="text-destructive hover:text-destructive" disabled={saving} onClick={() => void remove(detail.id)}>Remover</Button>}
              </div>
            )}
          </CardFooter>
        </Card>
      </div>
    );
  }

  const categories: Array<ProviderDef["category"]> = ["ads", "webhooks", "attribution"];
  const term = search.trim().toLowerCase();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">App de Integrações</h2>
          <p className="text-[12px] text-muted-foreground">Conecte pixels, webhooks e atribuição às suas VSLs.</p>
        </div>
        <div className="relative">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar" aria-label="Pesquisar integração" className="h-10 w-56 pr-9" />
          <RefreshCw aria-hidden className="pointer-events-none absolute right-3 top-3 size-4 text-muted-foreground" />
        </div>
      </div>
      {categories.map((category) => {
        const items = PROVIDERS.filter((provider) => provider.category === category && (!term || provider.name.toLowerCase().includes(term)));
        if (items.length === 0) return null;
        return (
          <section key={category} className="space-y-3">
            <h3 className="text-[13px] font-semibold text-muted-foreground">{CATEGORY_LABEL[category]}</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((provider) => {
                const existing = byProvider.get(provider.id);
                const installed = Boolean(existing);
                const linkedCount = existing?.vslIds.length ?? 0;
                return (
                  <Card key={provider.id} size="sm" className={installed ? "ring-[#B9FF66]/40" : undefined}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2.5">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl border bg-white p-1.5 dark:bg-white/95">
                          {provider.logo ? <Image src={provider.logo} alt="" width={24} height={24} className="size-6 object-contain" /> : <WebhookMark />}
                        </span>
                        {provider.name}
                        {provider.comingSoon ? <Badge variant="secondary">Em breve</Badge> : installed ? <Badge className="bg-[#B9FF66] text-[#191A23] hover:bg-[#B9FF66]">Instalado</Badge> : null}
                      </CardTitle>
                      <CardDescription>{provider.description}</CardDescription>
                      <CardAction>
                        {provider.comingSoon ? null : (
                          <Button type="button" size="sm" variant={installed ? "outline" : "default"} className={installed ? "" : "bg-[#B9FF66] font-semibold text-[#191A23] hover:bg-[#a8f052]"} onClick={() => openDetail(provider)}>
                            {installed ? "Configurar" : "Integrar"}
                          </Button>
                        )}
                      </CardAction>
                    </CardHeader>
                    <CardContent>
                      {installed && <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Check className="size-3" aria-hidden />{linkedCount} VSL{linkedCount === 1 ? "" : "s"} conectada{linkedCount === 1 ? "" : "s"}</p>}
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

function WebhookMark() {
  return <RefreshCw className="size-5 text-[#0066cc]" aria-hidden />;
}
