import { BarChart3, MousePointerClick, ShoppingBag, Target } from "lucide-react";
import { and, desc, eq, inArray } from "drizzle-orm";
import PageHeader from "@/components/dashboard/PageHeader";
import { requireUser } from "@/lib/auth/server";
import { db, schema } from "@/lib/db";

const { videoEvents, videos } = schema;

export const dynamic = "force-dynamic";

export default async function ConversionsPage() {
  const userId = await requireUser("/dashboard/conversions");
  const [eventRows, videoRows] = await Promise.all([
    db.select({ videoId: videoEvents.videoId, sessionId: videoEvents.sessionId, eventType: videoEvents.eventType })
      .from(videoEvents)
      .where(and(eq(videoEvents.userId, userId), inArray(videoEvents.eventType, ["play", "cta_click", "conversion"])))
      .orderBy(desc(videoEvents.createdAt))
      .limit(10000),
    db.select({ id: videos.id, title: videos.title }).from(videos).where(eq(videos.userId, userId)),
  ]);
  const titles = new Map(videoRows.map((video) => [video.id, video.title]));
  const rows = [...new Set(eventRows.map((event) => event.videoId))].map((videoId) => {
    const videoEventList = eventRows.filter((event) => event.videoId === videoId);
    const plays = new Set(videoEventList.filter((event) => event.eventType === "play").map((event) => event.sessionId)).size;
    const clicks = new Set(videoEventList.filter((event) => event.eventType === "cta_click").map((event) => event.sessionId)).size;
    const conversions = new Set(videoEventList.filter((event) => event.eventType === "conversion").map((event) => event.sessionId)).size;
    return { videoId, title: titles.get(videoId) ?? "VSL removida", plays, clicks, conversions, rate: plays ? conversions / plays * 100 : 0 };
  }).sort((a, b) => b.conversions - a.conversions || b.clicks - a.clicks);
  const totals = rows.reduce((current, row) => ({ plays: current.plays + row.plays, clicks: current.clicks + row.clicks, conversions: current.conversions + row.conversions }), { plays: 0, clicks: 0, conversions: 0 });

  return (
    <main className="dashboard-content space-y-5">
      <PageHeader
        icon={<ShoppingBag size={20} />}
        title="Conversões & Jornada"
      />

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Plays únicos", value: totals.plays, icon: BarChart3 },
          { label: "Cliques na CTA", value: totals.clicks, icon: MousePointerClick },
          { label: "Compras atribuídas", value: totals.conversions, icon: ShoppingBag },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-5 shadow-xs">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-zinc-400">
                <Icon size={15} className="text-[#191A23] dark:text-[#B9FF66]" />
                {metric.label}
              </span>
              <strong className="mt-2 block text-2xl font-bold tracking-tight text-[#191A23] dark:text-white">
                {metric.value.toLocaleString("pt-BR")}
              </strong>
            </article>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card shadow-xs">
        <div className="border-b border-slate-100 dark:border-zinc-800 px-6 py-4">
          <h2 className="text-base font-bold text-[#191A23] dark:text-white">Desempenho por VSL</h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-zinc-400">
            A conversão aparece somente quando uma integração de compra envia o evento confirmado.
          </p>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs font-medium text-[#191A23] dark:text-zinc-200">
              <thead className="bg-slate-50 dark:bg-card text-xs font-semibold uppercase text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800">
                <tr>
                  <th className="px-6 py-3.5">VSL</th>
                  <th className="px-4 py-3.5">Plays</th>
                  <th className="px-4 py-3.5">Cliques</th>
                  <th className="px-4 py-3.5">Compras</th>
                  <th className="px-6 py-3.5 text-right">Conversão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {rows.map((row) => (
                  <tr key={row.videoId} className="hover:bg-slate-50/50 dark:hover:bg-transparent">
                    <td className="max-w-[360px] truncate px-6 py-3.5 font-semibold text-[#191A23] dark:text-zinc-100">{row.title}</td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-400">{row.plays}</td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-400">{row.clicks}</td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-400">{row.conversions}</td>
                    <td className="px-6 py-3.5 text-right font-bold font-mono">
                      <span className="inline-flex rounded-full bg-[#B9FF66] px-2.5 py-0.5 text-xs text-[#191A23]">
                        {row.rate.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid min-h-72 place-items-center px-6 text-center">
            <div>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#B9FF66] text-[#191A23] shadow-xs">
                <Target size={24} />
              </div>
              <h3 className="mt-4 text-lg font-bold text-[#191A23] dark:text-white">Aguardando os primeiros eventos</h3>
              <p className="mx-auto mt-1 max-w-md text-xs font-medium text-slate-500 dark:text-zinc-400 leading-relaxed">
                Publique uma VSL e conecte o evento de compra para enxergar o caminho completo entre play, CTA e venda.
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
