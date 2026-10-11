"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, BellRing, Check, FileClock, LoaderCircle, Radio, Send, Users, Webhook, X } from "lucide-react";

type Capabilities = Record<string, boolean>;
type VideoOption = { id: string; title: string };
type GlobalBenchmark = { qualified: boolean; sampleVideos: number; samplePlays: number; playRate: number; completion: number; conversion: number };
type BenchmarkData = { leader: { title: string; completion: number; conversion: number; playRate: number } | null; average: { completion: number; conversion: number; playRate: number }; videoCount: number; global: GlobalBenchmark };
type Controls = {
  automatic_reports_enabled: boolean; report_frequency: string; report_email: string | null;
  audience_sync_enabled: boolean; audience_retention_threshold: number;
  outgoing_webhooks_enabled: boolean; webhook_url: string | null; webhook_events: string[];
  conversion_alerts_enabled: boolean; conversion_drop_threshold: number;
  alert_webhook_enabled: boolean; alert_webhook_url: string | null;
};

const empty: Controls = { automatic_reports_enabled: false, report_frequency: "weekly", report_email: null, audience_sync_enabled: false, audience_retention_threshold: 75, outgoing_webhooks_enabled: false, webhook_url: null, webhook_events: ["play", "cta_click", "conversion"], conversion_alerts_enabled: false, conversion_drop_threshold: 20, alert_webhook_enabled: false, alert_webhook_url: null };
const tools = [
  { id: "reports", icon: FileClock, title: "Relatórios automáticos", description: "Receba um resumo periódico com plays, conversões e desempenho da operação.", capability: "automatic_reports" },
  { id: "audience", icon: Users, title: "Perfil de público", description: "Transforme os sinais de audiência de cada VSL em um perfil pronto para orientar campanhas.", capability: "audience_sync" },
  { id: "webhooks", icon: Webhook, title: "Webhooks de saída", description: "Eventos em tempo real para Discord ou qualquer endpoint HTTPS compatível.", capability: "outgoing_webhooks" },
  { id: "benchmark", icon: BarChart3, title: "Benchmarks", description: "Compare sua operação com uma média global agregada e anônima.", capability: "private_benchmark" },
  { id: "alerts", icon: BellRing, title: "Alertas de queda", description: "Compara as últimas 24h com as 24h anteriores e avisa somente quando há queda real.", capability: "conversion_drop_alerts" },
];

export default function IntelligenceControls({ capabilities, benchmarkData, videos }: { capabilities: Capabilities; videoCount: number; benchmarkData: BenchmarkData; videos: VideoOption[] }) {
  const [controls, setControls] = useState<Controls>(empty);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>("load");
  const [notice, setNotice] = useState("");
  const [videoId, setVideoId] = useState(videos[0]?.id ?? "");
  const [segment, setSegment] = useState("engagers_75");

  useEffect(() => { fetch("/api/intelligence/controls", { cache: "no-store" }).then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(); setControls({ ...empty, ...payload.controls }); }).catch(() => setNotice("Não foi possível carregar as configurações.")).finally(() => setBusy(null)); }, []);

  useEffect(() => {
    if (!active) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setActive(null); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [active]);

  async function save(section: string, payload: Record<string, unknown>) {
    setBusy(section); setNotice("");
    const response = await fetch("/api/intelligence/controls", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(null);
    if (!response.ok) return setNotice("Não foi possível salvar. Verifique os campos e tente novamente.");
    setNotice("Configuração salva com sucesso.");
  }

  async function testWebhook(target: "generic" | "alert") {
    setBusy(`test-${target}`); setNotice("");
    const response = await fetch("/api/intelligence/controls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "test_webhook", target }) });
    const result = await response.json().catch(() => ({})); setBusy(null);
    setNotice(response.ok ? `Mensagem de teste enviada${result.provider === "discord" ? " ao Discord" : ""}. Confira o destino configurado.` : "Não foi possível entregar a mensagem. Confira o endereço e tente novamente.");
  }

  async function exportAudience() {
    if (!videoId) return setNotice("Escolha uma VSL.");
    setBusy("audience"); setNotice("");
    const response = await fetch("/api/intelligence/audience-exports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ videoId, segment }) });
    if (!response.ok) { await response.json().catch(() => ({})); setBusy(null); return setNotice("Ainda não há informações suficientes para montar este perfil. Escolha outro segmento ou aguarde novos acessos."); }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "perfil-audiencia.txt"; anchor.click(); URL.revokeObjectURL(url); setBusy(null); setNotice("Perfil de público preparado. O download começou automaticamente.");
  }

  return <><section className="mt-6"><div className="mb-4"><h2 className="text-xl font-semibold themeable-text-ink">Motor de inteligência</h2><p className="mt-1 text-sm themeable-text-ink-muted-48">Configurações operacionais com dados reais, organizadas em um único lugar.</p></div>
    {notice && <Notice text={notice} />}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{tools.map((tool) => { const Icon = tool.icon; const allowed = capabilities[tool.capability] !== false; return <button key={tool.id} disabled={!allowed || busy === "load"} onClick={() => setActive(tool.id)} className="group min-h-44 rounded-[22px] border bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-prisma-blue disabled:opacity-50 themeable-border-hairline dark:bg-card"><div className="flex items-start justify-between"><span className="grid size-11 place-items-center rounded-2xl bg-prisma-blue/10 text-prisma-blue"><Icon size={21} /></span><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">{allowed ? "Disponível" : "Plano superior"}</span></div><h3 className="mt-6 font-semibold themeable-text-ink">{tool.title}</h3><p className="mt-1 text-xs leading-5 themeable-text-ink-muted-48">{tool.description}</p></button>; })}</div>
  </section>
    {active && <div className="fixed inset-0 z-[80] flex justify-end bg-black/25 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setActive(null); }}>
      <aside role="dialog" aria-modal="true" aria-label="Configuração de inteligência" className="flex h-dvh w-full flex-col border-l bg-white shadow-2xl themeable-border-hairline dark:bg-card sm:max-w-[620px]">
        <header className="flex min-h-16 items-center justify-between border-b px-5 themeable-border-hairline sm:px-7"><div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-prisma-blue">Inteligência</p><p className="text-sm font-medium themeable-text-ink">Configure sem sair do contexto da operação</p></div><button type="button" onClick={() => { setActive(null); setNotice(""); }} aria-label="Fechar painel" className="grid size-10 place-items-center rounded-full transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-prisma-blue dark:hover:bg-transparent"><X size={19} /></button></header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-7">
          {active === "reports" && <Reports controls={controls} setControls={setControls} save={save} busy={busy} />}
          {active === "audience" && <Audience videos={videos} videoId={videoId} setVideoId={setVideoId} segment={segment} setSegment={setSegment} exportAudience={exportAudience} busy={busy} />}
          {active === "webhooks" && <Webhooks controls={controls} setControls={setControls} save={save} test={() => testWebhook("generic")} busy={busy} />}
          {active === "benchmark" && <Benchmark data={benchmarkData} />}
          {active === "alerts" && <Alerts controls={controls} setControls={setControls} save={save} test={() => testWebhook("alert")} busy={busy} />}
          {notice && <Notice text={notice} />}
        </div>
      </aside>
    </div>}
  </>;
}

function Header({ icon: Icon, title, text }: { icon: typeof Radio; title: string; text: string }) { return <div className="mb-6 flex gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-prisma-blue/10 text-prisma-blue"><Icon size={21} /></span><div><h2 className="text-xl font-semibold themeable-text-ink">{title}</h2><p className="mt-1 text-sm themeable-text-ink-muted-48">{text}</p></div></div>; }
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className="h-11 w-full rounded-xl border bg-transparent px-3 text-sm outline-none focus:border-prisma-blue themeable-border-hairline themeable-text-ink" />; }
function SaveButton({ busy, onClick, label = "Salvar" }: { busy: boolean; onClick: () => void; label?: string }) { return <button onClick={onClick} disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-full bg-prisma-blue px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />}{label}</button>; }
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) { return <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-3 themeable-border-hairline"><span className="text-sm font-medium themeable-text-ink">{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-[#0066cc]" /></label>; }
function Notice({ text }: { text: string }) { return <p className="my-4 rounded-xl bg-prisma-blue/10 px-4 py-3 text-sm text-prisma-blue">{text}</p>; }

function Reports({ controls, setControls, save, busy }: PanelProps) { return <><Header icon={FileClock} title="Relatórios automáticos" text="Escolha quando e onde deseja receber o resumo da sua operação." /><div className="grid max-w-2xl gap-4"><Toggle label="Ativar relatórios" checked={controls.automatic_reports_enabled} onChange={(value) => setControls({ ...controls, automatic_reports_enabled: value })} /><select aria-label="Frequência do relatório" value={controls.report_frequency} onChange={(event) => setControls({ ...controls, report_frequency: event.target.value })} className="h-11 rounded-xl border bg-transparent px-3 themeable-border-hairline themeable-text-ink"><option value="daily">Todos os dias</option><option value="weekly">Toda semana</option><option value="monthly">Todo mês</option></select><Input aria-label="E-mail para receber o relatório" type="email" value={controls.report_email ?? ""} onChange={(event) => setControls({ ...controls, report_email: event.target.value })} placeholder="voce@empresa.com" /><SaveButton busy={busy === "reports"} onClick={() => save("reports", { automaticReportsEnabled: controls.automatic_reports_enabled, reportFrequency: controls.report_frequency, reportEmail: controls.report_email })} /></div></>; }
function Audience({ videos, videoId, setVideoId, segment, setSegment, exportAudience, busy }: { videos: VideoOption[]; videoId: string; setVideoId: (id: string) => void; segment: string; setSegment: (value: string) => void; exportAudience: () => void; busy: string | null }) { return <><Header icon={Users} title="Perfil de público" text="Escolha uma VSL e um grupo de espectadores para preparar o perfil da audiência." /><div className="grid max-w-2xl gap-4"><select aria-label="VSL analisada" value={videoId} onChange={(event) => setVideoId(event.target.value)} className="h-11 rounded-xl border bg-transparent px-3 themeable-border-hairline themeable-text-ink"><option value="">Selecione uma VSL</option>{videos.map((video) => <option key={video.id} value={video.id}>{video.title}</option>)}</select><select aria-label="Segmento da audiência" value={segment} onChange={(event) => setSegment(event.target.value)} className="h-11 rounded-xl border bg-transparent px-3 themeable-border-hairline themeable-text-ink"><option value="engagers_75">Assistiram 75% ou mais</option><option value="buyers">Compradores e conversões</option><option value="completers">Concluíram o vídeo</option><option value="cta_clickers">Clicaram no botão de ação</option><option value="all">Toda a audiência</option></select><p className="rounded-xl bg-prisma-blue/10 p-4 text-xs leading-5 text-prisma-blue">O arquivo reúne localização, dispositivo, sistema, navegador, origem e campanhas para ajudar você a planejar públicos mais precisos.</p><SaveButton busy={busy === "audience"} onClick={exportAudience} label="Baixar perfil em TXT" /></div></>; }
function Webhooks({ controls, setControls, save, test, busy }: PanelProps & { test: () => void }) { const events = [{ id: "impression", label: "Player carregado" }, { id: "play", label: "Play iniciado" }, { id: "progress", label: "Progresso do vídeo" }, { id: "cta_click", label: "Clique no botão" }, { id: "conversion", label: "Conversão" }, { id: "complete", label: "Vídeo concluído" }]; return <><Header icon={Webhook} title="Notificações por webhook" text="Envie atividades importantes para o Discord ou para outra ferramenta da sua operação." /><div className="grid max-w-2xl gap-4"><Toggle label="Ativar notificações" checked={controls.outgoing_webhooks_enabled} onChange={(value) => setControls({ ...controls, outgoing_webhooks_enabled: value })} /><Input aria-label="Endereço do webhook" value={controls.webhook_url ?? ""} onChange={(event) => setControls({ ...controls, webhook_url: event.target.value })} placeholder="Cole aqui o endereço do webhook" /><div><p className="mb-2 text-xs font-semibold themeable-text-ink">Atividades enviadas</p><div className="flex flex-wrap gap-2">{events.map((event) => <label key={event.id} className="rounded-full border px-3 py-2 text-xs themeable-border-hairline themeable-text-ink"><input type="checkbox" className="mr-2 accent-[#0066cc]" checked={controls.webhook_events.includes(event.id)} onChange={(input) => setControls({ ...controls, webhook_events: input.target.checked ? [...controls.webhook_events, event.id] : controls.webhook_events.filter((item) => item !== event.id) })} />{event.label}</label>)}</div></div><div className="flex flex-wrap gap-2"><SaveButton busy={busy === "webhooks"} onClick={() => save("webhooks", { outgoingWebhooksEnabled: controls.outgoing_webhooks_enabled, webhookUrl: controls.webhook_url, webhookEvents: controls.webhook_events })} /><button onClick={test} className="inline-flex h-11 items-center gap-2 rounded-full border px-5 text-sm font-semibold themeable-border-hairline themeable-text-ink"><Send size={16} /> Enviar mensagem de teste</button></div></div></>; }
function Alerts({ controls, setControls, save, test, busy }: PanelProps & { test: () => void }) { return <><Header icon={AlertTriangle} title="Alertas de queda" text="A queda percentual compara as últimas 24 horas com as 24 horas anteriores, exigindo pelo menos 10 plays em cada período." /><div className="grid max-w-2xl gap-4"><Toggle label="Ativar alertas" checked={controls.conversion_alerts_enabled} onChange={(value) => setControls({ ...controls, conversion_alerts_enabled: value })} /><label className="text-sm themeable-text-ink">Alertar quando cair pelo menos {controls.conversion_drop_threshold}%<input type="range" min="5" max="90" step="5" value={controls.conversion_drop_threshold} onChange={(event) => setControls({ ...controls, conversion_drop_threshold: Number(event.target.value) })} className="mt-2 block w-full" /></label><Toggle label="Enviar também por webhook" checked={controls.alert_webhook_enabled} onChange={(value) => setControls({ ...controls, alert_webhook_enabled: value })} /><Input value={controls.alert_webhook_url ?? ""} onChange={(event) => setControls({ ...controls, alert_webhook_url: event.target.value })} placeholder="Webhook exclusivo do alerta (Discord ou HTTPS)" /><div className="flex gap-2"><SaveButton busy={busy === "alerts"} onClick={() => save("alerts", { conversionAlertsEnabled: controls.conversion_alerts_enabled, conversionDropThreshold: controls.conversion_drop_threshold, alertWebhookEnabled: controls.alert_webhook_enabled, alertWebhookUrl: controls.alert_webhook_url })} /><button onClick={test} className="inline-flex h-11 items-center gap-2 rounded-full border px-5 text-sm font-semibold themeable-border-hairline themeable-text-ink"><Send size={16} /> Testar alerta</button></div></div></>; }
function Benchmark({ data }: { data: BenchmarkData }) { const rows = [["Play rate", data.average.playRate, data.global.playRate], ["Retenção final", data.average.completion, data.global.completion], ["Conversão", data.average.conversion, data.global.conversion]] as const; return <><Header icon={BarChart3} title="Benchmark privado e global" text="Compare o desempenho da sua operação com referências agregadas, preservando a privacidade de todas as contas." />{data.global.qualified ? <div className="max-w-3xl overflow-hidden rounded-xl border themeable-border-hairline"><table className="w-full text-sm"><thead className="bg-black/[.03]"><tr><th className="p-3 text-left">Métrica</th><th className="p-3 text-right">Sua operação</th><th className="p-3 text-right">Benchmark global</th></tr></thead><tbody>{rows.map(([label, own, global]) => <tr key={label} className="border-t themeable-border-hairline"><td className="p-3 themeable-text-ink">{label}</td><td className="p-3 text-right font-semibold text-prisma-blue">{own}%</td><td className="p-3 text-right themeable-text-ink">{global}%</td></tr>)}</tbody></table><p className="p-3 text-xs themeable-text-ink-muted-48">Referência atualizada com {data.global.sampleVideos} VSLs e {data.global.samplePlays} plays recentes.</p></div> : <p className="max-w-2xl rounded-xl bg-prisma-blue/10 p-4 text-sm leading-6 text-prisma-blue">O benchmark global será liberado quando houver uma base comparável mais consistente. Enquanto isso, acompanhe o benchmark privado da sua própria operação.</p>}</>; }
type PanelProps = { controls: Controls; setControls: React.Dispatch<React.SetStateAction<Controls>>; save: (section: string, payload: Record<string, unknown>) => Promise<void>; busy: string | null };
