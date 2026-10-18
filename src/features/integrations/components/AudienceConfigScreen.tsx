"use client";

import { useState } from "react";

import AdminSelect from "@/components/ui/custom/AdminSelect";
import { LoaderCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

import { BackButton, ConfigNotice, HeaderCard, HowItWorksCard, PlanRequiredNotice } from "./FeatureAppDetails";
import type { FeatureScreenProps } from "./store-data";
import { useIntelligenceControls } from "./use-intelligence-controls";

const SEGMENTS = [
  { value: "engagers_75", label: "Assistiram 75% ou mais" },
  { value: "completers", label: "Concluíram o vídeo" },
  { value: "cta_clickers", label: "Clicaram no botão de ação" },
  { value: "buyers", label: "Compradores e conversões" },
  { value: "all", label: "Toda a audiência" },
];

/**
 * "Perfil de público" no Marketplace: UMA VSL + segmento + "Gerar perfil",
 * chamando o export existente da inteligência (POST /api/intelligence/
 * audience-exports) e baixando o TXT agregado.
 */
export default function AudienceConfigScreen({ app, vsls, capabilities, onBack }: FeatureScreenProps) {
  const { busy } = useIntelligenceControls();
  const [videoId, setVideoId] = useState(vsls[0]?.id ?? "");
  const [segment, setSegment] = useState("engagers_75");
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState("");
  const allowed = capabilities.audience_sync !== false;
  const disabled = !allowed || busy === "load";

  async function generateProfile() {
    if (!videoId) {
      setNotice("Escolha uma VSL para gerar o perfil.");
      return;
    }
    setDownloading(true);
    setNotice("");
    try {
      const response = await fetch("/api/intelligence/audience-exports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId, segment }),
      });
      if (!response.ok) {
        await response.json().catch(() => ({}));
        setNotice("Ainda não há informações suficientes para montar este perfil. Escolha outro segmento ou aguarde novos acessos.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "perfil-audiencia.txt";
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice("Perfil de público preparado. O download começou automaticamente.");
    } catch {
      setNotice("Não foi possível gerar o perfil agora. Tente novamente.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-5">
      <BackButton onBack={onBack} />
      <HeaderCard app={app} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gerar perfil de audiência</CardTitle>
          <CardDescription>Escolha a VSL e o grupo de espectadores — o perfil é montado na hora com os sinais reais do player.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!allowed && <PlanRequiredNotice />}

          {vsls.length === 0 ? (
            <p className="text-xs text-muted-foreground">Crie uma VSL primeiro em Meus vídeos para usar este app.</p>
          ) : (
            <>
              <div className="max-w-xs">
                <p className="mb-1.5 text-[12px] font-semibold themeable-text-ink">VSL analisada</p>
                <AdminSelect
                  label="VSL analisada"
                  value={videoId}
                  onChange={setVideoId}
                  options={vsls.map((vsl) => ({ value: vsl.id, label: vsl.title }))}
                  disabled={disabled}
                />
              </div>

              <div className="max-w-xs">
                <p className="mb-1.5 text-[12px] font-semibold themeable-text-ink">Segmento da audiência</p>
                <AdminSelect label="Segmento da audiência" value={segment} onChange={setSegment} options={SEGMENTS} disabled={disabled} />
              </div>

              <p className="rounded-xl bg-muted/60 p-4 text-xs leading-5 text-muted-foreground">
                O arquivo reúne localização, dispositivo, sistema, navegador, origem e campanhas para ajudar você a planejar públicos mais precisos.
              </p>
            </>
          )}

          {notice && <ConfigNotice text={notice} />}
        </CardContent>
        <CardFooter>
          <button
            type="button"
            disabled={disabled || downloading || vsls.length === 0}
            onClick={() => void generateProfile()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#B9FF66] px-5 text-sm font-bold text-[#191A23] transition hover:bg-[#a8f052] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {downloading ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden /> Gerando perfil…
              </>
            ) : (
              "Gerar perfil"
            )}
          </button>
        </CardFooter>
      </Card>

      <HowItWorksCard app={app} />
    </div>
  );
}
