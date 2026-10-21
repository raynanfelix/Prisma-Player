"use client";

import AdminSelect from "@/components/ui/custom/AdminSelect";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { BackButton, ConfigNotice, ConfigToggle, HeaderCard, HowItWorksCard, PlanRequiredNotice, SaveButton } from "./FeatureAppDetails";
import type { FeatureScreenProps } from "./store-data";
import VslMultiSelect from "./VslMultiSelect";
import { useIntelligenceControls } from "./use-intelligence-controls";

/**
 * "Relatórios automáticos" no Marketplace: multi-select de VSLs + frequência,
 * persistido nos intelligenceControls existentes (PATCH /api/intelligence/controls).
 */
export default function ReportsConfigScreen({ app, vsls, capabilities, onBack }: FeatureScreenProps) {
  const { controls, setControls, busy, notice, saveControls } = useIntelligenceControls();
  const allowed = capabilities.automatic_reports !== false;
  const disabled = !allowed || busy === "load";

  function save() {
    void saveControls("reports", {
      automaticReportsEnabled: controls.automatic_reports_enabled,
      reportFrequency: controls.report_frequency,
      reportEmail: controls.report_email,
      reportVideoIds: controls.report_video_ids,
    });
  }

  return (
    <div className="space-y-5">
      <BackButton onBack={onBack} />
      <HeaderCard app={app} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuração do resumo periódico</CardTitle>
          <CardDescription>Plays, conversões e taxa de conversão do período - a frequência e as VSLs ficam a seu critério.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!allowed && <PlanRequiredNotice />}
          <ConfigToggle
            label="Ativar relatórios"
            checked={controls.automatic_reports_enabled}
            onChange={(value) => setControls({ ...controls, automatic_reports_enabled: value })}
            disabled={disabled}
          />

          <div>
            <p className="mb-1.5 text-[12px] font-semibold themeable-text-ink">VSLs do resumo</p>
            <VslMultiSelect
              options={vsls}
              selected={controls.report_video_ids}
              onChange={(ids) => setControls({ ...controls, report_video_ids: ids })}
              label="VSLs do resumo"
              placeholder="Todas as VSLs"
              disabled={disabled}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">Sem seleção, o resumo cobre todas as VSLs prontas da conta.</p>
          </div>

          <div className="max-w-xs">
            <p className="mb-1.5 text-[12px] font-semibold themeable-text-ink">Frequência</p>
            <AdminSelect
              label="Frequência do relatório"
              value={controls.report_frequency}
              onChange={(value) => setControls({ ...controls, report_frequency: value })}
              options={[
                { value: "daily", label: "Todos os dias" },
                { value: "weekly", label: "Toda semana" },
                { value: "monthly", label: "Todo mês" },
              ]}
              disabled={disabled}
            />
          </div>

          <label className="block max-w-md text-[12px] font-medium themeable-text-ink">
            E-mail para receber o resumo
            <Input
              type="email"
              value={controls.report_email ?? ""}
              onChange={(event) => setControls({ ...controls, report_email: event.target.value })}
              placeholder="voce@empresa.com"
              aria-label="E-mail para receber o resumo"
              disabled={disabled}
              className="mt-1.5 h-10 text-xs"
            />
            <span className="mt-1.5 block text-[11px] font-normal text-muted-foreground">
              O resumo periódico só é gerado com um e-mail cadastrado - ele também chega ao seu Inbox da Prisma.
            </span>
          </label>

          {notice && <ConfigNotice text={notice} />}
        </CardContent>
        <CardFooter>
          <SaveButton busy={busy === "reports"} onClick={save} disabled={disabled} label="Salvar relatórios" />
        </CardFooter>
      </Card>

      <HowItWorksCard app={app} />
    </div>
  );
}
