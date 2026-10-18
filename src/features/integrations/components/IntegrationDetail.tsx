"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import type { IntegrationItem, ProviderApp, VslOption } from "./store-data";
import { AppMark } from "./store-mark";

interface Props {
  app: ProviderApp;
  instances: IntegrationItem[];
  vsls: VslOption[];
  onBack: () => void;
}

/**
 * Detalhe de um provider do Marketplace com MÚLTIPLAS INSTÂNCIAS:
 * o dono cadastra 5 pixels, 5 webhooks de Discord, etc. Cada instância tem
 * nome próprio, config própria e VSLs vinculadas próprias.
 */
export default function IntegrationDetail({ app, instances, vsls, onBack }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<IntegrationItem | "new" | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftName, setDraftName] = useState("");
  const [draftInstance, setDraftInstance] = useState("default");
  const [draftVsls, setDraftVsls] = useState<string[]>([]);
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const installed = instances.length > 0;

  function openNew() {
    setDraft(Object.fromEntries(app.fields.map((field) => [field.key, ""])));
    setDraftName(`Instância ${instances.length + 1}`);
    setDraftInstance(`i-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
    setDraftVsls([]);
    setDraftEnabled(true);
    setError("");
    setEditing("new");
  }

  function openEdit(item: IntegrationItem) {
    setDraft(Object.fromEntries(app.fields.map((field) => [field.key, item.config?.[field.key] ?? ""])));
    setDraftName(item.name ?? "Principal");
    setDraftInstance(item.instanceId ?? "default");
    setDraftVsls(item.vslIds ?? []);
    setDraftEnabled(item.enabled !== false);
    setError("");
    setEditing(item);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/integrations", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: app.provider, instanceId: draftInstance, name: draftName, config: draft, vslIds: draftVsls, enabled: draftEnabled }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "save_failed");
      setEditing(null);
      router.refresh();
    } catch (saveError) {
      const code = saveError instanceof Error ? saveError.message : "save_failed";
      setError(code === "invalid_config" ? "Dados inválidos: confira os campos." : code === "vsl_not_owned" ? "Há VSLs selecionadas que não são suas." : "Não foi possível salvar agora. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(instanceId: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/integrations", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: app.provider, instanceId }),
      });
      if (!response.ok) throw new Error("remove_failed");
      setEditing(null);
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
          <div className="flex flex-wrap items-start gap-4">
            <AppMark app={app} large />
            <div className="min-w-0 flex-1">
              <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
                {app.name}
                {app.comingSoon ? <Badge variant="secondary">Em breve</Badge> : installed ? <Badge className="bg-[#B9FF66] text-[#191A23] hover:bg-[#B9FF66]">{instances.length} instância{instances.length === 1 ? "" : "s"}</Badge> : null}
              </CardTitle>
              <CardDescription className="mt-1">{app.description}</CardDescription>
              {installed && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {instances.reduce((total, item) => total + item.vslIds.length, 0)} vínculo(s) com VSLs no total
                </p>
              )}
            </div>
            {!app.comingSoon && (
              <CardAction>
                <Button type="button" size="sm" className="bg-[#B9FF66] font-semibold text-[#191A23] hover:bg-[#a8f052]" onClick={openNew}>
                  <Plus className="size-4" /> Adicionar
                </Button>
              </CardAction>
            )}
          </div>
        </CardHeader>
      </Card>

      {editing !== null && !app.comingSoon && (
        <Card className="ring-[#B9FF66]/40">
          <CardHeader>
            <CardTitle className="text-base">{editing === "new" ? `Nova instância de ${app.name}` : `Editar: ${draftName}`}</CardTitle>
            <CardDescription>{editing === "new" ? "Cadastre os dados e vincule as VSLs desta instância." : "Ajuste os dados, o nome e as VSLs desta instância."}</CardDescription>
            <CardAction>
              <button
                type="button"
                role="switch"
                aria-checked={draftEnabled}
                aria-label={`${draftEnabled ? "Desativar" : "Ativar"} ${draftName}`}
                onClick={() => setDraftEnabled((value) => !value)}
                className={`relative h-6 w-11 rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer ${draftEnabled ? "bg-[#B9FF66]" : "bg-black/15 dark:bg-white/20"}`}
              >
                <span className={`block size-4 rounded-full bg-white shadow-sm transition-transform ${draftEnabled ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block text-[12px] font-medium">
              Nome desta instância
              <Input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Ex.: Pixel Principal, Canal #vendas, Bot de Alertas…"
                autoComplete="off"
                className="mt-1.5 h-10 text-xs"
              />
            </label>
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
            <div>
              <p className="mb-2 text-[12px] font-semibold">Vincular VSLs</p>
              <p className="mb-2 text-[11px] text-muted-foreground">Esta instância dispara apenas para as VSLs selecionadas.</p>
              <div className="max-h-60 space-y-2 overflow-y-auto rounded-xl border border-slate-200/80 p-3 dark:border-zinc-800">
                {vsls.length === 0 && <p className="text-xs text-muted-foreground">Crie uma VSL primeiro em Meus vídeos.</p>}
                {vsls.map((vsl) => {
                  const checked = draftVsls.includes(vsl.id);
                  return (
                    <label
                      key={vsl.id}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-2.5 text-[13px] transition-colors ${checked ? "border-[#B9FF66]/60 bg-[#B9FF66]/10" : "hover:bg-muted/50"}`}
                    >
                      <span className="truncate font-medium">{vsl.title}</span>
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-[#B9FF66]"
                        checked={checked}
                        onChange={(event) => setDraftVsls((current) => (event.target.checked ? [...current, vsl.id] : current.filter((id) => id !== vsl.id)))}
                        aria-label={`Vincular ${vsl.title}`}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2">
            <div className="flex gap-2">
              <Button type="button" className="flex-1 bg-[#B9FF66] font-semibold text-[#191A23] hover:bg-[#a8f052]" disabled={saving} onClick={() => void save()}>
                {saving ? "Salvando…" : editing === "new" ? "Criar instância" : "Salvar alterações"}
              </Button>
              <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              {editing !== "new" && typeof editing === "object" && (
                <Button type="button" variant="outline" className="text-destructive hover:text-destructive" disabled={saving} onClick={() => void remove(editing.instanceId)}>
                  Remover
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>
      )}

      {installed && editing !== "new" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instâncias cadastradas</CardTitle>
            <CardDescription>{instances.length} de {app.name} na sua conta — clique para editar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {instances.map((item) => (
              <button
                key={item.instanceId}
                type="button"
                onClick={() => openEdit(item)}
                className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 text-left text-[13px] transition-colors ${typeof editing === "object" && editing?.instanceId === item.instanceId ? "border-[#B9FF66]/60 bg-[#B9FF66]/10" : "hover:bg-muted/50"}`}
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{item.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Check className="size-3" aria-hidden />
                    {item.vslIds.length} VSL{item.vslIds.length === 1 ? "" : "s"}
                    {!item.enabled && <span className="ml-1 font-semibold text-amber-600 dark:text-amber-400">· desativada</span>}
                  </p>
                </div>
                <Badge variant={item.enabled ? "secondary" : "outline"} className="shrink-0 text-[10px]">
                  {item.enabled ? "Ativa" : "Inativa"}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

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
      </Card>
    </div>
  );
}
