import { AdminHeader, AdminMetric, AdminPanel } from "@/components/admin/AdminUi";
import { SeoCheckForm, SeoTargetForm } from "@/components/admin/SeoForms";
import { CheckCircle2, Globe, Search, XCircle } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { MARKETING_URL } from "@/lib/site";

const { seoTargets, visibilityChecks } = schema;

export const dynamic = "force-dynamic";

async function probe(url: string, match?: RegExp): Promise<{ ok: boolean; detail: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
    if (!match) return { ok: true, detail: `HTTP 200` };
    const text = await response.text();
    return match.test(text) ? { ok: true, detail: "padrão encontrado" } : { ok: false, detail: "padrão ausente" };
  } catch {
    return { ok: false, detail: "inalcançável" };
  }
}

/**
 * SEO e IA: verificações automáticas da base técnica (robots, sitemap,
 * llms.txt, pricing legível) + metas de busca com taxa de citação registrada
 * manualmente (3-5 execuções por plataforma, conforme skill ai-seo).
 */
export default async function AdminSeoPage() {
  const base = MARKETING_URL;
  const [robots, sitemap, llms, pricing, targetRows, checkRows] = await Promise.all([
    probe(`${base}/robots.txt`, /GPTBot|PerplexityBot|ClaudeBot|Google-Extended/i),
    probe(`${base}/sitemap.xml`, /<loc>/),
    probe(`${base}/llms.txt`, /prisma/i),
    probe(`${base}/pricing`, /R\$/),
    db.select({ id: seoTargets.id, keyword: seoTargets.keyword, locale: seoTargets.locale, notes: seoTargets.notes, isActive: seoTargets.isActive, createdAt: seoTargets.createdAt })
      .from(seoTargets).where(eq(seoTargets.isActive, true)).orderBy(desc(seoTargets.createdAt)).limit(60),
    db.select({ targetId: visibilityChecks.targetId, platform: visibilityChecks.platform, cited: visibilityChecks.cited, runs: visibilityChecks.runs, checkedAt: visibilityChecks.checkedAt })
      .from(visibilityChecks).orderBy(desc(visibilityChecks.checkedAt)).limit(500),
  ]);

  const autoChecks = [
    { label: "robots.txt cita bots de IA", ...robots },
    { label: "sitemap.xml com URLs", ...sitemap },
    { label: "llms.txt legível por IAs", ...llms },
    { label: "pricing com valores em R$", ...pricing },
  ];
  const healthy = autoChecks.filter((item) => item.ok).length;

  const byTarget = new Map<string, { total: number; cited: number; last: Date }>();
  for (const check of checkRows) {
    const row = byTarget.get(check.targetId) ?? { total: 0, cited: 0, last: check.checkedAt };
    row.total += check.runs;
    if (check.cited) row.cited += check.runs;
    if (check.checkedAt > row.last) row.last = check.checkedAt;
    byTarget.set(check.targetId, row);
  }

  return <div>
    <AdminHeader title="SEO e IA" description="Base técnica automática + taxa de citação registrada por palavra-chave." />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {autoChecks.map((item) => <AdminMetric key={item.label} label={item.label} value={item.ok ? "OK" : "Falha"} detail={item.detail} icon={item.ok ? CheckCircle2 : XCircle} tone={item.ok ? "green" : "red"} />)}
    </section>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_1.4fr]">
      <div><AdminPanel title="Nova meta de busca" description="Palavra-chave que importa para o negócio."><SeoTargetForm /></AdminPanel>
        <div className="mt-5"><AdminPanel title="Como medir" description="Rode cada busca 3-5x por plataforma e registre quantas citaram a Prisma."><div className="space-y-2 p-5 text-[12px] themeable-text-ink-muted-48"><p className="flex gap-2"><Globe size={14} /> Consultas: “melhor player de VSL”, “player de VSL preço”, “Prisma Player vs concorrente”.</p><p className="flex gap-2"><Search size={14} /> Base automática: {healthy}/{autoChecks.length} passando. JSON-LD e metadados: ver layout e pricing no código.</p></div></AdminPanel></div></div>
      <AdminPanel title="Metas e taxa de citação" description="Citados ÷ execuções somadas (todas as plataformas)."><div className="space-y-4 p-5">{targetRows.map((target) => { const stat = byTarget.get(target.id); const rate = stat && stat.total ? Math.round((stat.cited / stat.total) * 100) : null; return <div key={target.id} className="rounded-[14px] border p-4 themeable-border-hairline"><div className="flex items-center justify-between gap-2"><p className="text-[13px] font-semibold themeable-text-ink">{target.keyword}</p><span className="text-[12px] font-bold themeable-text-ink">{rate === null ? "sem dados" : `${rate}%`}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-card"><div className="h-full rounded-full bg-selected" style={{ width: `${rate ?? 0}%` }} /></div><div className="mt-3"><SeoCheckForm targetId={target.id} /></div></div>; })}{targetRows.length === 0 && <p className="text-[12px] themeable-text-ink-muted-48">Nenhuma meta ainda. Adicione a primeira ao lado.</p>}</div></AdminPanel>
    </div>
  </div>;
}
