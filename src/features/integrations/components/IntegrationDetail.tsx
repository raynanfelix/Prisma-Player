"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import type { IntegrationItem, ProviderApp, VslOption } from "./store-data";
import { AppMark } from "./store-mark";

interface Props {
  app: ProviderApp;
  existing: IntegrationItem | null;
  vsls: VslOption[];
  onBack: () => void;
}

export default function IntegrationDetail({ app, existing, vsls, onBack }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(app.fields.map((field) => [field.key, existing?.config?.[field.key] ?? ""])),
  );
  const [draftVsls, setDraftVsls] = useState<string[]>(existing?.vslIds ?? []);
  const [draftEnabled, setDraftEnabled] = useState(existing?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const installed = Boolean(existing);
  const linkedCount = (existing?.vslIds ?? draftVsls).length;

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/integrations", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: app.provider, config: draft, vslIds: draftVsls, enabled: draftEnabled }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "save_failed");
      onBack();
      router.refresh();
    } catch (saveError) {
      const code = saveError instanceof Error ? saveError.message : "save_failed";
      setError(code === "invalid_config" ? "Dados inválidos: confira os campos." : code === "vsl_not_owned" ? "Há VSLs selecionadas que não são suas." : "Não foi possível salvar agora. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/integrations", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: app.provider }),
      });
      if (!response.ok) throw new Error("remove_failed");
      onBack();
      router.refresh();
    } catch {
      setError("Não foi possível remover agora. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground cursor-pointer">
        <ArrowLeft className="size-4" /> Voltar ao marketplace
      </button>

      <Card className="w-full">
        <CardHeader>
          <div className="flex items-start gap-4">
            <AppMark app={app} large />
            <div className="min-w-0 flex-1">
              <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
                {app.name}
                {app.comingSoon ? (
                  <Badge variant="secondary">Em breve</Badge>
                ) : installed ? (
                  <Badge className="bg-[#B9FF66] text-[#191A23] hover:bg-[#B9FF66]">Instalado</Badge>
                ) : app.showAvailableBadge ? (
                  <Badge className="bg-[#B9FF66] text-[#191A23] hover:bg-[#B9FF66]">Disponível</Badge>
                ) : null}
              </CardTitle>
              <CardDescription className="mt-1">{app.description}</CardDescription>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {installed ? `${linkedCount} VSL${linkedCount === 1 ? "" : "s"} conectada${linkedCount === 1 ? "" : "s"}` : "Não instalada nesta conta"}
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {!app.comingSoon && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configurações</CardTitle>
            <CardDescription>Dados da sua conta na plataforma. Tokens ficam no servidor — nunca vão para a embed.</CardDescription>
            <CardAction>
              <button
                type="button"
                role="switch"
                aria-checked={draftEnabled}
                aria-label={`${draftEnabled ? "Desativar" : "Ativar"} ${app.name}`}
                onClick={() => setDraftEnabled((value) => !value)}
                className={`relative h-6 w-11 rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer ${draftEnabled ? "bg-[#B9FF66]" : "bg-black/15 dark:bg-white/20"}`}
              >
                <span className={`block size-4 rounded-full bg-white shadow-sm transition-transform ${draftEnabled ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            {app.fields.map((field) => (
              <label key={field.key} className="block text-[12px] font-medium">
                {field.label}
                {field.optional ? <span className="font-normal text-muted-foreground"> (opcional)</span> : null}
                <Input
                  value={draft[field.key] ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                  placeholder={field.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-1.5 h-10 font-mono text-xs"
                />
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
              <label
                key={vsl.id}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-[13px] transition-colors ${checked ? "border-[#B9FF66]/60 bg-[#B9FF66]/10" : "hover:bg-muted/50"}`}
              >
                <span className="truncate font-medium">{vsl.title}</span>
                <input
                  type="checkbox"
                  className="size-4 accent-[#B9FF66]"
                  checked={checked}
                  onChange={(event) => setDraftVsls((current) => (event.target.checked ? [...current, vsl.id] : current.filter((id) => id !== vsl.id)))}
                  aria-label={`Vincular ${vsl.title}`}
                />
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
          <p className="text-[13px] font-semibold">{app.events.title}</p>
          <Badge variant="secondary" className="mt-1 font-mono text-[10px]">{app.events.tag}</Badge>
          <p className="mt-1.5 text-xs text-muted-foreground">{app.events.detail}</p>
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
          <CardDescription>Entenda como o {app.name} trabalha pela sua operação.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 text-[13px] leading-6 text-muted-foreground">
          <p>{app.howItWorks.intro}</p>
          <p className="font-semibold text-foreground">Eventos e dados enviados:</p>
          <ul className="space-y-1">
            {app.howItWorks.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2">
                <Check className="mt-1 size-3.5 shrink-0 text-[#B9FF66]" aria-hidden />
                {bullet}
              </li>
            ))}
          </ul>
          {app.howItWorks.note && <p className="text-[11px]">{app.howItWorks.note}</p>}
        </CardContent>
        {!app.comingSoon && (
          <CardFooter className="flex-col items-stretch gap-2">
            <div className="flex gap-2">
              <Button type="button" className="flex-1" disabled={saving} onClick={() => void save()}>
                {saving ? "Salvando…" : "Salvar integração"}
              </Button>
              {installed && (
                <Button type="button" variant="outline" className="text-destructive hover:text-destructive" disabled={saving} onClick={() => void remove()}>
                  Remover
                </Button>
              )}
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
