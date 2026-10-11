"use client";

import { useState } from "react";
import { BarChart3, Check, CheckCircle2, Cookie, Copy, Megaphone, MousePointerClick, Play, RefreshCw, ShieldCheck, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface PixelTrackingFields {
  pixelsEnabled: boolean;
  metaPixelEnabled: boolean;
  metaPixelId: string;
  googlePixelEnabled: boolean;
  googleTagId: string;
  googleConversionDestination: string;
  tiktokPixelEnabled: boolean;
  tiktokPixelId: string;
  pixelConsentMode: "banner" | "external";
  pixelConsentTitle: string;
  pixelConsentDescription: string;
  pixelConsentAcceptLabel: string;
  pixelConsentRejectLabel: string;
  pixelPrivacyUrl: string;
}

interface Props<T extends PixelTrackingFields> {
  config: T;
  update: <K extends keyof T>(key: K, value: T[K]) => void;
  playerId?: string;
  videoId?: string;
}

interface DiagnosticResult {
  eventCount: number;
  lastEventAt: string | null;
  events: Record<string, number>;
  providers: Array<{ provider: string; id: string; browser: boolean; server: boolean }>;
}

const providers = [
  { key: "meta" as const, name: "Meta", description: "Facebook e Instagram Ads", icon: Megaphone, enabled: "metaPixelEnabled" as const, id: "metaPixelId" as const, placeholder: "123456789012345" },
  { key: "google" as const, name: "Google", description: "Google Ads ou Google Analytics 4", icon: BarChart3, enabled: "googlePixelEnabled" as const, id: "googleTagId" as const, placeholder: "AW-123456789 ou G-ABC123DEF" },
  { key: "tiktok" as const, name: "TikTok", description: "TikTok Ads Manager", icon: Play, enabled: "tiktokPixelEnabled" as const, id: "tiktokPixelId" as const, placeholder: "CXXXXXXXXXXXXXXXXX" },
];

function ProviderSwitch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={`${checked ? "Desativar" : "Ativar"} ${label}`} onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066cc]/40 ${checked ? "bg-[#0066cc]" : "bg-black/15 dark:bg-white/20"}`}><span className={`block size-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} /></button>;
}

export default function PixelTrackingPanel<T extends PixelTrackingFields>({ config, update, playerId, videoId }: Props<T>) {
  const [copied, setCopied] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [diagnosticError, setDiagnosticError] = useState("");
  const enabledCount = providers.filter((provider) => config[provider.enabled]).length;
  const conversionSnippet = `window.PrismaPlayer?.trackConversion({\n  playerId: "${playerId ?? "SALVE_O_PLAYER_PRIMEIRO"}",\n  value: 197, currency: "BRL",\n  transactionId: "PEDIDO_UNICO"\n});`;

  async function copySnippet() {
    await navigator.clipboard.writeText(conversionSnippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function runDiagnostic() {
    if (!videoId) return;
    setDiagnosing(true);
    setDiagnosticError("");
    try {
      const response = await fetch(`/api/player-pixels/diagnostics?videoId=${encodeURIComponent(videoId)}`, { cache: "no-store" });
      const result = await response.json() as DiagnosticResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "diagnostic_failed");
      setDiagnostic(result);
    } catch {
      setDiagnosticError("Não foi possível verificar os eventos agora. Tente novamente.");
    } finally {
      setDiagnosing(false);
    }
  }

  return <div className="space-y-4">
    <div className="rounded-xl border border-[#0066cc]/15 bg-[#0066cc]/[0.055] p-4 text-[12px] leading-5 text-[#424245] dark:text-[#d1d1d6]">
      <div className="mb-1 flex items-center gap-2 font-semibold text-[#1d1d1f] dark:text-white"><CheckCircle2 className="size-4 text-[#0066cc]" />Tracking conectado à VSL</div>
      A Prisma carrega as tags configuradas e envia visualização, play, progresso, conclusão, clique no CTA e compra. IDs de pixel são públicos; tokens privados nunca entram na embed.
    </div>
    <div className="flex items-center justify-between"><span className="text-[13px] font-semibold">Canais de mídia</span><Badge variant={enabledCount ? "default" : "secondary"}>{enabledCount ? `${enabledCount} ativo${enabledCount > 1 ? "s" : ""}` : "Nenhum ativo"}</Badge></div>
    {providers.map((provider) => {
      const Icon = provider.icon;
      const enabled = config[provider.enabled];
      return <Card key={provider.key} size="sm" className={enabled ? "ring-[#0066cc]/30" : undefined}>
        <CardHeader><CardTitle className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-[#0066cc]/10 text-[#0066cc]"><Icon className="size-4" /></span>{provider.name}</CardTitle><CardDescription>{provider.description}</CardDescription><CardAction><ProviderSwitch checked={enabled} label={provider.name} onChange={(value) => { update(provider.enabled, value as T[typeof provider.enabled]); const nextEnabledCount = providers.filter((item) => item.key === provider.key ? value : config[item.enabled]).length; update("pixelsEnabled", (nextEnabledCount > 0) as T["pixelsEnabled"]); }} /></CardAction></CardHeader>
        {enabled && <CardContent className="space-y-3"><label className="block text-[12px] font-medium">{provider.key === "google" ? "ID da tag" : "ID do pixel"}<Input value={config[provider.id]} onChange={(event) => update(provider.id, event.target.value as T[typeof provider.id])} placeholder={provider.placeholder} autoComplete="off" spellCheck={false} className="mt-1.5 h-10 font-mono text-xs" /></label>{provider.key === "google" && <label className="block text-[12px] font-medium">Destino da conversão <span className="font-normal text-muted-foreground">(opcional)</span><Input value={config.googleConversionDestination} onChange={(event) => update("googleConversionDestination", event.target.value as T["googleConversionDestination"])} placeholder="AW-123456789/AbCdEfGhIj" autoComplete="off" spellCheck={false} className="mt-1.5 h-10 font-mono text-xs" /><span className="mt-1.5 block text-[11px] leading-4 text-muted-foreground">Use o destino completo exibido na ação de conversão do Google Ads.</span></label>}</CardContent>}
      </Card>;
    })}
    <Card size="sm"><CardHeader><CardTitle className="flex items-center gap-2"><Cookie className="size-4 text-[#0066cc]" />Consentimento</CardTitle><CardDescription>Pixels de publicidade só carregam depois da escolha do visitante.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Modo de consentimento"><button type="button" role="radio" aria-checked={config.pixelConsentMode === "banner"} onClick={() => update("pixelConsentMode", "banner" as T["pixelConsentMode"])} className={`min-h-9 rounded-md px-2 text-xs font-medium transition ${config.pixelConsentMode === "banner" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Banner Prisma</button><button type="button" role="radio" aria-checked={config.pixelConsentMode === "external"} onClick={() => update("pixelConsentMode", "external" as T["pixelConsentMode"])} className={`min-h-9 rounded-md px-2 text-xs font-medium transition ${config.pixelConsentMode === "external" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>CMP externo</button></div>{config.pixelConsentMode === "banner" ? <><label className="block text-[12px] font-medium">Título<Input className="mt-1.5" value={config.pixelConsentTitle} maxLength={80} onChange={(event) => update("pixelConsentTitle", event.target.value as T["pixelConsentTitle"])} /></label><label className="block text-[12px] font-medium">Explicação<Input className="mt-1.5" value={config.pixelConsentDescription} maxLength={240} onChange={(event) => update("pixelConsentDescription", event.target.value as T["pixelConsentDescription"])} /></label><div className="grid grid-cols-2 gap-2"><label className="block text-[12px] font-medium">Aceitar<Input className="mt-1.5" value={config.pixelConsentAcceptLabel} maxLength={32} onChange={(event) => update("pixelConsentAcceptLabel", event.target.value as T["pixelConsentAcceptLabel"])} /></label><label className="block text-[12px] font-medium">Recusar<Input className="mt-1.5" value={config.pixelConsentRejectLabel} maxLength={32} onChange={(event) => update("pixelConsentRejectLabel", event.target.value as T["pixelConsentRejectLabel"])} /></label></div><label className="block text-[12px] font-medium">Política de privacidade <span className="font-normal text-muted-foreground">(opcional)</span><Input className="mt-1.5" value={config.pixelPrivacyUrl} placeholder="https://seusite.com/privacidade" maxLength={500} onChange={(event) => update("pixelPrivacyUrl", event.target.value as T["pixelPrivacyUrl"])} /></label></> : <div className="rounded-lg border border-border bg-muted/50 p-3 text-[11px] leading-5 text-muted-foreground">Seu gerenciador de consentimento deve chamar <code className="rounded bg-background px-1 py-0.5 text-foreground">PrismaPlayer.setConsent(&#123; advertising: true &#125;)</code>. Até essa chamada, nenhum pixel é carregado.</div>}</CardContent></Card>
    <Card size="sm"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-[#0066cc]" />Diagnóstico</CardTitle><CardDescription>Confirme a configuração e os eventos recebidos pela Prisma nas últimas 24 horas.</CardDescription><CardAction><Button type="button" size="sm" variant="outline" onClick={runDiagnostic} disabled={!videoId || diagnosing}><RefreshCw className={`size-3.5 ${diagnosing ? "animate-spin" : ""}`} />{diagnosing ? "Verificando" : "Verificar"}</Button></CardAction></CardHeader>{(diagnostic || diagnosticError) && <CardContent>{diagnosticError ? <p role="alert" className="text-xs text-destructive">{diagnosticError}</p> : diagnostic && <div className="space-y-3"><div className="flex items-center justify-between rounded-lg bg-muted/60 p-3"><span className="text-xs text-muted-foreground">Eventos em 24h</span><strong className="text-lg">{diagnostic.eventCount}</strong></div><div className="space-y-2">{diagnostic.providers.map((item) => <div key={`${item.provider}:${item.id}`} className="flex items-center justify-between gap-3 text-xs"><span className="truncate font-medium capitalize">{item.provider} · {item.id}</span><div className="flex gap-1"><Badge variant={item.browser ? "default" : "secondary"}>Browser</Badge>{item.provider !== "google" && <Badge variant={item.server ? "default" : "outline"}>Servidor</Badge>}</div></div>)}</div>{diagnostic.lastEventAt && <p className="text-[11px] text-muted-foreground">Último evento: {new Date(diagnostic.lastEventAt).toLocaleString("pt-BR")}</p>}</div>}</CardContent>}</Card>
    <Card size="sm" className="bg-black/[0.02] dark:bg-white/[0.03]"><CardHeader><CardTitle className="flex items-center gap-2"><ShoppingBag className="size-4 text-[#0066cc]" />Registrar uma venda</CardTitle><CardDescription>Na página de obrigado, após a confirmação real do pagamento.</CardDescription><CardAction><Button type="button" variant="outline" size="sm" onClick={copySnippet} disabled={!playerId}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "Copiado" : "Copiar"}</Button></CardAction></CardHeader><CardContent><pre className="overflow-x-auto rounded-lg bg-[#1d1d1f] p-3 text-[10px] leading-5 text-white"><code>{conversionSnippet}</code></pre>{!playerId && <p className="mt-2 text-[11px] font-medium text-amber-600">Salve a VSL para gerar o identificador definitivo.</p>}<p className="mt-3 flex gap-2 text-[11px] leading-4 text-muted-foreground"><MousePointerClick className="mt-0.5 size-3.5 shrink-0" />Mantenha o script da Prisma carregado na página de obrigado. O ID único evita compras duplicadas e ajuda a conciliar os relatórios.</p></CardContent></Card>
  </div>;
}
