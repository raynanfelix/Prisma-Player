"use client";

import { useState } from "react";
import { ArrowLeft, Check, LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

import type { FeatureApp, VslOption } from "./store-data";
import { AppMark } from "./store-mark";

/** Limite do contrato da rota /api/player-configs (PUT corta em 100). */
const MAX_DOMAINS_PER_VSL = 100;

const DOMAIN_PATTERN = /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/** Uma linha por domínio; aceita https://dominio.com, dominio.com e *.dominio.com. */
function parseDomainLines(text: string): { domains: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const domains: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const host = line.toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "";
    if (!DOMAIN_PATTERN.test(host)) {
      invalid.push(line);
      continue;
    }
    if (!seen.has(host)) {
      seen.add(host);
      domains.push(host);
    }
  }
  return { domains, invalid };
}

export function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground cursor-pointer">
      <ArrowLeft className="size-4" /> Voltar ao marketplace
    </button>
  );
}

export function HeaderCard({ app }: { app: FeatureApp }) {
  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-start gap-4">
          <AppMark app={app} large />
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
              {app.name}
              <Badge className="bg-[#B9FF66] text-[#191A23] hover:bg-[#B9FF66]">Disponível</Badge>
            </CardTitle>
            <CardDescription className="mt-1">{app.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

export function HowItWorksCard({ app }: { app: FeatureApp }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Como funciona</CardTitle>
        <CardDescription>O que existe hoje, sem promessa futura.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5 text-[13px] leading-6 text-muted-foreground">
        <p>{app.howItWorks.intro}</p>
        <ul className="flex flex-col gap-1">
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
  );
}

/** Switch acessível (mesmo visual do editor de instâncias do Marketplace). */
export function ConfigToggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-4 rounded-xl border p-3 themeable-border-hairline ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span className="text-sm font-medium themeable-text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed cursor-pointer ${checked ? "bg-[#B9FF66]" : "bg-black/15 dark:bg-white/20"}`}
      >
        <span className={`block size-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </label>
  );
}

/** Botão de salvar padrão das telas de configuração (verde de marca). */
export function SaveButton({ busy, onClick, label = "Salvar", disabled }: { busy: boolean; onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <Button
      type="button"
      className="bg-[#B9FF66] font-semibold text-[#191A23] hover:bg-[#a8f052]"
      disabled={busy || disabled}
      onClick={onClick}
    >
      {busy ? (
        <>
          <LoaderCircle className="animate-spin" aria-hidden /> Salvando…
        </>
      ) : (
        label
      )}
    </Button>
  );
}

/** Mensagem de resultado (sucesso/falha) das telas de configuração. */
export function ConfigNotice({ text }: { text: string }) {
  return <p role="status" className="rounded-xl bg-muted/60 px-4 py-3 text-xs font-medium themeable-text-ink">{text}</p>;
}

/** Recurso bloqueado pelo plano - mensagem clara em vez de silêncio. */
export function PlanRequiredNotice() {
  return (
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400">
      Este app faz parte de um plano superior. Faça upgrade para liberar a configuração.
    </p>
  );
}

interface DomainDraft {
  text: string;
  config: Record<string, unknown>;
  loaded: boolean;
}

/** Detalhe de "Domínios autorizados": allowlist por VSL salva em allowedDomains via /api/player-configs. */
export function DomainsManager({ app, vsls, onBack }: { app: FeatureApp; vsls: VslOption[]; onBack: () => void }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DomainDraft>>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const titleById = new Map(vsls.map((vsl) => [vsl.id, vsl.title]));

  async function toggleVsl(vsl: VslOption, checked: boolean) {
    setError("");
    setSavedMessage("");
    if (!checked) {
      setSelectedIds((current) => current.filter((id) => id !== vsl.id));
      setDrafts((current) => {
        const next = { ...current };
        delete next[vsl.id];
        return next;
      });
      return;
    }
    setSelectedIds((current) => [...current, vsl.id]);
    setLoadingIds((current) => [...current, vsl.id]);
    try {
      const response = await fetch(`/api/player-configs?videoId=${encodeURIComponent(vsl.id)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { playerConfig: { config?: unknown; allowed_domains?: unknown } | null }
        | null;
      if (!response.ok || !payload) throw new Error("load_failed");
      const config = (payload.playerConfig?.config && typeof payload.playerConfig.config === "object"
        ? (payload.playerConfig.config as Record<string, unknown>)
        : {});
      const allowed = Array.isArray(payload.playerConfig?.allowed_domains)
        ? (payload.playerConfig.allowed_domains as string[]).filter((item) => typeof item === "string")
        : [];
      setDrafts((current) => ({ ...current, [vsl.id]: { text: allowed.join("\n"), config, loaded: true } }));
    } catch {
      setError(`Não foi possível carregar os domínios de "${vsl.title}". Tente selecionar novamente.`);
      setSelectedIds((current) => current.filter((id) => id !== vsl.id));
    } finally {
      setLoadingIds((current) => current.filter((id) => id !== vsl.id));
    }
  }

  async function save() {
    setError("");
    setSavedMessage("");
    const parsed: Record<string, string[]> = {};
    for (const id of selectedIds) {
      const draft = drafts[id];
      if (!draft?.loaded) continue;
      const { domains, invalid } = parseDomainLines(draft.text);
      if (invalid.length > 0) {
        setError(`Domínio inválido em "${titleById.get(id) ?? "VSL"}": ${invalid[0]}. Use um domínio por linha (https://dominio.com, dominio.com ou *.dominio.com).`);
        return;
      }
      if (domains.length > MAX_DOMAINS_PER_VSL) {
        setError(`"${titleById.get(id) ?? "VSL"}" passou do limite de ${MAX_DOMAINS_PER_VSL} domínios.`);
        return;
      }
      parsed[id] = domains;
    }

    setSaving(true);
    let saved = 0;
    try {
      for (const id of selectedIds) {
        const domains = parsed[id];
        if (!domains) continue;
        const response = await fetch("/api/player-configs", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ videoId: id, config: drafts[id]?.config ?? {}, domains }),
        });
        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as { error?: string } | null;
          const reason = result?.error === "invalid_pixel_config" ? "o config desta VSL tem pixels inválidos" : undefined;
          setError(`Falha ao salvar "${titleById.get(id) ?? "VSL"}"${reason ? ` (${reason})` : ""}. ${saved > 0 ? `${saved} VSL${saved === 1 ? "" : "s"} anterior(es) já ${saved === 1 ? "foi salva" : "foram salvas"}. ` : ""}Tente novamente.`);
          return;
        }
        saved += 1;
      }
      setSavedMessage(selectedIds.length > 0 ? `Allowlist salva em ${selectedIds.length} VSL${selectedIds.length === 1 ? "" : "s"}.` : "");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <BackButton onBack={onBack} />
      <HeaderCard app={app} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">VSLs com allowlist</CardTitle>
          <CardDescription>Selecione as VSLs para gerenciar os domínios que podem embutir cada uma.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {vsls.length === 0 && <p className="text-xs text-muted-foreground">Crie uma VSL primeiro em Meus vídeos.</p>}
          {vsls.map((vsl) => {
            const checked = selectedIds.includes(vsl.id);
            const loading = loadingIds.includes(vsl.id);
            return (
              <label
                key={vsl.id}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-[13px] transition-colors ${checked ? "border-[#B9FF66]/60 bg-[#B9FF66]/10" : "hover:bg-muted/50"}`}
              >
                <span className="truncate font-medium">{vsl.title}</span>
                {loading ? (
                  <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Carregando" />
                ) : (
                  <input
                    type="checkbox"
                    className="size-4 accent-[#B9FF66]"
                    checked={checked}
                    onChange={(event) => void toggleVsl(vsl, event.target.checked)}
                    aria-label={`Gerenciar domínios de ${vsl.title}`}
                  />
                )}
              </label>
            );
          })}
        </CardContent>
      </Card>

      {selectedIds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Domínios autorizados</CardTitle>
            <CardDescription>Um domínio por linha - https://dominio.com, dominio.com ou *.dominio.com para todos os subdomínios. Lista vazia libera qualquer site.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {selectedIds.map((id) => {
              const draft = drafts[id];
              const { domains } = draft?.loaded ? parseDomainLines(draft.text) : { domains: [] };
              return (
                <div key={id} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] font-semibold">{titleById.get(id) ?? "VSL"}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{domains.length} domínio{domains.length === 1 ? "" : "s"}</span>
                  </div>
                  {draft?.loaded ? (
                    <textarea
                      value={draft.text}
                      onChange={(event) => setDrafts((current) => ({ ...current, [id]: { ...current[id], text: event.target.value } }))}
                      rows={4}
                      spellCheck={false}
                      aria-label={`Domínios autorizados de ${titleById.get(id) ?? "VSL"}`}
                      placeholder={"https://checkout.seudominio.com\nwww.seudominio.com\n*.seudominio.com"}
                      className="min-h-24 w-full rounded-xl border bg-transparent p-3 font-mono text-xs outline-none focus:border-ring"
                    />
                  ) : (
                    <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">Carregando os domínios atuais…</p>
                  )}
                </div>
              );
            })}
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            {savedMessage && <p role="status" className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{savedMessage}</p>}
          </CardContent>
          <CardFooter>
            <Button type="button" className="bg-[#B9FF66] font-semibold text-[#191A23] hover:bg-[#a8f052]" disabled={saving || selectedIds.some((id) => !drafts[id]?.loaded)} onClick={() => void save()}>
              {saving ? "Salvando…" : "Salvar allowlists"}
            </Button>
          </CardFooter>
        </Card>
      )}

      <HowItWorksCard app={app} />
    </div>
  );
}
