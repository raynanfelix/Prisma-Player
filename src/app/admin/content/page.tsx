import { HardDrive, PlayCircle, Radio, Video } from "lucide-react";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { AdminHeader, AdminMetric, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import { db, schema } from "@/lib/db";

const { playerConfigs, profiles, videoEvents, videos } = schema;

export const dynamic = "force-dynamic";
const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB` : `${(value / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
export default async function AdminContentPage() {
  const countExpr = { count: sql<number>`count(*)::int` };
  const [videoRows, publishedRows, eventsRows] = await Promise.all([
    db.select({ id: videos.id, title: videos.title, status: videos.status, sizeBytes: videos.sizeBytes, createdAt: videos.createdAt, userId: videos.userId })
      .from(videos).orderBy(desc(videos.createdAt)).limit(200),
    db.select(countExpr).from(playerConfigs).where(eq(playerConfigs.published, true)),
    db.select(countExpr).from(videoEvents),
  ]);
  const totalBytes = videoRows.reduce((sum, item) => sum + Number(item.sizeBytes), 0);
  const ownerIds = [...new Set(videoRows.map((item) => item.userId))];
  const owners = ownerIds.length ? await db.select({ id: profiles.id, email: profiles.email }).from(profiles).where(inArray(profiles.id, ownerIds)) : [];
  const ownerEmail = new Map(owners.map((item) => [item.id, item.email]));
  const publishedCount = publishedRows[0]?.count ?? 0;
  const eventsCount = eventsRows[0]?.count ?? 0;
  return <div><AdminHeader title="Vídeos e storage" description="Visibilidade operacional sobre uploads, players publicados e volume armazenado." />
    <section className="mb-6 grid gap-4 sm:grid-cols-3"><AdminMetric label="Vídeos recentes" value={videoRows.length.toLocaleString("pt-BR")} detail="na janela de 200 itens" icon={Video} /><AdminMetric label="Players publicados" value={publishedCount.toLocaleString("pt-BR")} detail="embeds ativos" icon={PlayCircle} tone="green" /><AdminMetric label="Eventos de reprodução" value={eventsCount.toLocaleString("pt-BR")} detail="telemetria registrada" icon={Radio} /></section>
    <AdminPanel title="Biblioteca recente" description={`Volume da amostra: ${bytes(totalBytes)}.`}><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">VSL</th><th className="px-5 py-3 font-medium">Dono</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Tamanho</th><th className="px-5 py-3 font-medium">Criada em</th></tr></thead><tbody>{videoRows.map((video) => <tr key={video.id} className="border-t themeable-border-hairline"><td className="max-w-[460px] truncate px-5 py-4 font-semibold themeable-text-ink">{video.title}</td><td className="max-w-[220px] truncate px-5 py-4 themeable-text-ink-muted-48">{ownerEmail.get(video.userId) ?? "—"}</td><td className="px-5 py-4"><StatusPill value={video.status} /></td><td className="px-5 py-4 themeable-text-ink"><span className="inline-flex items-center gap-2"><HardDrive size={14} />{bytes(Number(video.sizeBytes))}</span></td><td className="px-5 py-4 themeable-text-ink-muted-48">{video.createdAt.toLocaleString("pt-BR")}</td></tr>)}</tbody></table></div></AdminPanel>
  </div>;
}
