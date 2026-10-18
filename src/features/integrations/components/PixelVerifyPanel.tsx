"use client";

import { useState } from "react";
import { FlaskConical, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { StoreProviderId } from "./store-data";

export type PixelVerifyProviderId = "meta_pixel" | "google_ads" | "tiktok";

/** Resposta padronizada de POST /api/integrations/verify (docs/PIXEL_VERIFY_SPEC.md). */
export interface PixelVerifyResultDto {
  ok: boolean;
  platform: "meta" | "google" | "tiktok";
  message: string;
  detail: string;
  receivedAt: string;
}

interface Props {
  provider: StoreProviderId;
  /** Draft atual do formulário (o teste é puro — usa o que está na tela, não o salvo). */
  config: Record<string, string>;
  disabled: boolean;
  /** O pai guarda o resultado (mensagem na tela) e dispara o PUT pós-ok. */
  onResult: (result: PixelVerifyResultDto) => void;
}

function isPixelProvider(provider: StoreProviderId): provider is PixelVerifyProviderId {
  return provider === "meta_pixel" || provider === "google_ads" || provider === "tiktok";
}

/**
 * Botão "Testar conexão" (Sprint 1 Pixel Verdadeiro): dispara um evento de
 * teste REAL na plataforma e devolve a resposta real. A mensagem de
 * sucesso/falha é renderizada pelo IntegrationDetail — este painel cuida do
 * botão (spinner) e da chamada ao /api/integrations/verify.
 */
export default function PixelVerifyPanel({ provider, config, disabled, onResult }: Props) {
  const [testing, setTesting] = useState(false);

  async function run() {
    if (testing || !isPixelProvider(provider)) return;
    setTesting(true);
    const platform: PixelVerifyResultDto["platform"] = provider === "meta_pixel" ? "meta" : provider === "google_ads" ? "google" : "tiktok";
    try {
      const response = await fetch("/api/integrations/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, config }),
      });
      if (response.status === 429) {
        onResult({ ok: false, platform, message: "Muitos testes seguidos — aguarde um minuto e tente novamente.", detail: "rate limit (10/min)", receivedAt: new Date().toISOString() });
        return;
      }
      const result = (await response.json().catch(() => null)) as PixelVerifyResultDto | null;
      if (!response.ok || !result || typeof result.ok !== "boolean") {
        onResult({ ok: false, platform, message: "Não foi possível testar agora. Tente novamente.", detail: "sem resposta do servidor", receivedAt: new Date().toISOString() });
        return;
      }
      onResult(result);
    } catch {
      onResult({ ok: false, platform, message: "Não foi possível testar agora — verifique sua conexão.", detail: "falha de rede", receivedAt: new Date().toISOString() });
    } finally {
      setTesting(false);
    }
  }

  if (!isPixelProvider(provider) || !pixelVerifyReady(provider, config)) return null;

  return (
    <Button type="button" variant="outline" disabled={disabled || testing} onClick={() => void run()}>
      {testing ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <FlaskConical className="size-4" aria-hidden />}
      {testing ? "Testando…" : "Testar conexão"}
    </Button>
  );
}

/**
 * Campos mínimos para o teste existir (o botão só aparece quando dá para
 * testar de verdade): Meta/TikTok pedem pixel + token; Google aceita AW-
 * (resposta honesta de formato) e exige API Secret para tags G-.
 */
export function pixelVerifyReady(provider: StoreProviderId, config: Record<string, string>): boolean {
  if (!isPixelProvider(provider)) return false;
  const value = (key: string) => (config[key] ?? "").trim();
  if (provider === "google_ads") {
    const tagId = value("tagId").toUpperCase();
    if (!tagId) return false;
    return tagId.startsWith("G-") ? Boolean(value("apiSecret")) : true;
  }
  return Boolean(value("pixelId") && value("accessToken"));
}
