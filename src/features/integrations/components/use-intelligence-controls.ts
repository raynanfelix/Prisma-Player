"use client";

import { useEffect, useState } from "react";

/**
 * Controles da inteligência operacional (contrato snake_case da rota
 * /api/intelligence/controls). Mesmo mecanismo de carga/salvamento do
 * IntelligenceControls — o Marketplace apenas troca a tela, não o motor.
 */
export type IntelligenceControlsState = {
  automatic_reports_enabled: boolean;
  report_frequency: string;
  report_email: string | null;
  report_video_ids: string[];
  audience_sync_enabled: boolean;
  audience_retention_threshold: number;
  outgoing_webhooks_enabled: boolean;
  webhook_url: string | null;
  webhook_events: string[];
  conversion_alerts_enabled: boolean;
  conversion_drop_threshold: number;
  alert_webhook_enabled: boolean;
  alert_webhook_url: string | null;
  alert_video_ids: string[];
};

const empty: IntelligenceControlsState = {
  automatic_reports_enabled: false,
  report_frequency: "weekly",
  report_email: null,
  report_video_ids: [],
  audience_sync_enabled: false,
  audience_retention_threshold: 75,
  outgoing_webhooks_enabled: false,
  webhook_url: null,
  webhook_events: ["play", "cta_click", "conversion"],
  conversion_alerts_enabled: false,
  conversion_drop_threshold: 20,
  alert_webhook_enabled: false,
  alert_webhook_url: null,
  alert_video_ids: [],
};

export function useIntelligenceControls() {
  const [controls, setControls] = useState<IntelligenceControlsState>(empty);
  const [busy, setBusy] = useState<string | null>("load");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/intelligence/controls", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error();
        setControls({ ...empty, ...payload.controls });
      })
      .catch(() => setNotice("Não foi possível carregar as configurações."))
      .finally(() => setBusy(null));
  }, []);

  /** PATCH da rota de controls — mesmo formato de payload do IntelligenceControls. */
  async function saveControls(section: string, payload: Record<string, unknown>, successMessage = "Configuração salva com sucesso."): Promise<boolean> {
    setBusy(section);
    setNotice("");
    try {
      const response = await fetch("/api/intelligence/controls", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        setNotice(
          result?.error === "plan_upgrade_required"
            ? "Este recurso faz parte de um plano superior. Faça upgrade para ativá-lo."
            : "Não foi possível salvar. Verifique os campos e tente novamente.",
        );
        return false;
      }
      setNotice(successMessage);
      return true;
    } catch {
      setNotice("Não foi possível salvar. Verifique os campos e tente novamente.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  /** POST de teste de entrega de webhook (mesma action da rota de controls). */
  async function testWebhook(target: "generic" | "alert"): Promise<string | null> {
    setBusy(`test-${target}`);
    setNotice("");
    try {
      const response = await fetch("/api/intelligence/controls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "test_webhook", target }),
      });
      const result = (await response.json().catch(() => ({}))) as { provider?: string };
      return response.ok
        ? `Mensagem de teste enviada${result.provider === "discord" ? " ao Discord" : ""}. Confira o destino configurado.`
        : "Não foi possível entregar a mensagem. Confira o endereço e tente novamente.";
    } catch {
      return "Não foi possível entregar a mensagem. Confira o endereço e tente novamente.";
    } finally {
      setBusy(null);
    }
  }

  return { controls, setControls, busy, notice, setNotice, saveControls, testWebhook };
}
