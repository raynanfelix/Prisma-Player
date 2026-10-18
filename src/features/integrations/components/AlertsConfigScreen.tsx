"use client";

import { Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { BackButton, ConfigNotice, ConfigToggle, HeaderCard, HowItWorksCard, PlanRequiredNotice, SaveButton } from "./FeatureAppDetails";
import type { FeatureScreenProps } from "./store-data";
import VslMultiSelect from "./VslMultiSelect";
import { useIntelligenceControls } from "./use-intelligence-controls";

/**
 * "Alertas de queda" no Marketplace: multi-select de VSLs monitoradas +
 * sensibilidade (threshold %), persistidos nos intelligenceControls
 * existentes (PATCH /api/intelligence/controls).
 */
export default function AlertsConfigScreen({ app, vsls, capabilities, onBack }: FeatureScreenProps) {
  const { controls, setControls, busy, notice, setNotice, saveControls, testWebhook } = useIntelligenceControls();
  const allowed = capabilities.conversion_drop_alerts !== false;
  const disabled = !allowed || busy === "load";

  function save() {
    void saveControls("alerts", {
      conversionAlertsEnabled: controls.conversion_alerts_enabled,
      conversionDropThreshold: controls.conversion_drop_threshold,
      alertWebhookEnabled: controls.alert_webhook_enabled,
      alertWebhookUrl: controls.alert_webhook_url,
      alertVideoIds: controls.alert_video_ids,
    });
  }

  async function test() {
    const message = await testWebhook("alert");
    if (message) setNotice(message);
  }

  return (
    <div className="space-y-5">
      <BackButton onBack={onBack} />
      <HeaderCard app={app} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuração dos alertas</CardTitle>
          <CardDescription>
            A queda compara as últimas 24 horas com as 24 horas anteriores, exigindo pelo menos 10 plays em cada período.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!allowed && <PlanRequiredNotice />}
          <ConfigToggle
            label="Ativar alertas"
            checked={controls.conversion_alerts_enabled}
            onChange={(value) => setControls({ ...controls, conversion_alerts_enabled: value })}
            disabled={disabled}
          />

          <div>
            <p className="mb-1.5 text-[12px] font-semibold themeable-text-ink">VSLs monitoradas</p>
            <VslMultiSelect
              options={vsls}
              selected={controls.alert_video_ids}
              onChange={(ids) => setControls({ ...controls, alert_video_ids: ids })}
              label="VSLs monitoradas"
              placeholder="Todas as VSLs"
              disabled={disabled}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">Sem seleção, todas as VSLs prontas da conta são monitoradas.</p>
          </div>

          <label className="block text-[12px] font-medium themeable-text-ink">
            Alertar quando a conversão cair pelo menos {controls.conversion_drop_threshold}%
            <input
              type="range"
              min="5"
              max="90"
              step="5"
              value={controls.conversion_drop_threshold}
              disabled={disabled}
              onChange={(event) => setControls({ ...controls, conversion_drop_threshold: Number(event.target.value) })}
              className="mt-2 block w-full accent-[#B9FF66]"
            />
            <span className="mt-1 block text-[11px] font-normal text-muted-foreground">Sensibilidade: de 5% a 90%, em passos de 5%.</span>
          </label>

          <ConfigToggle
            label="Enviar também por webhook"
            checked={controls.alert_webhook_enabled}
            onChange={(value) => setControls({ ...controls, alert_webhook_enabled: value })}
            disabled={disabled}
          />
          <label className="block max-w-md text-[12px] font-medium themeable-text-ink">
            Webhook exclusivo do alerta
            <Input
              type="url"
              value={controls.alert_webhook_url ?? ""}
              onChange={(event) => setControls({ ...controls, alert_webhook_url: event.target.value })}
              placeholder="https://discord.com/api/webhooks/… (ou qualquer HTTPS)"
              aria-label="Webhook exclusivo do alerta"
              disabled={disabled}
              className="mt-1.5 h-10 font-mono text-xs"
            />
          </label>

          {notice && <ConfigNotice text={notice} />}
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          <SaveButton busy={busy === "alerts"} onClick={save} disabled={disabled} label="Salvar alertas" />
          <button
            type="button"
            disabled={disabled || busy === "test-alert"}
            onClick={() => void test()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold themeable-text-ink transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer dark:border-zinc-800 dark:bg-card"
          >
            <Send className="size-4" aria-hidden /> Testar alerta
          </button>
        </CardFooter>
      </Card>

      <HowItWorksCard app={app} />
    </div>
  );
}
