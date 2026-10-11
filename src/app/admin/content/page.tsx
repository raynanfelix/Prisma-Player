import { HardDrive, PlayCircle, Radio, Video } from "lucide-react";
import { AdminHeader, AdminMetric, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB` : `${(value / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
export default async function AdminContentPage() {
  const admin = createAdminClient();
  const [videos, published, events] = await Promise.all([
    admin.from("videos").select("id,title,status,size_bytes,created_at,user_id").order("created_at", { ascending: false }).limit(200),
    admin.from("player_configs").select("id", { count: "exact", head: true }).eq("published", true),
    admin.from("video_events").select("id", { count: "exact", head: true }),
  ]);
  const totalBytes = (videos.data ?? []).reduce((sum, item) => sum + Number(item.size_bytes), 0);
  return <div><AdminHeader title="Vídeos e storage" description="Visibilidade operacional sobre uploads, players publicados e volume armazenado." />
    <section className="mb-6 grid gap-4 sm:grid-cols-3"><AdminMetric label="Vídeos recentes" value={(videos.data?.length ?? 0).toLocaleString("pt-BR")} detail="na janela de 200 itens" icon={Video} /><AdminMetric label="Players publicados" value={(published.count ?? 0).toLocaleString("pt-BR")} detail="embeds ativos" icon={PlayCircle} tone="green" /><AdminMetric label="Eventos de reprodução" value={(events.count ?? 0).toLocaleString("pt-BR")} detail="telemetria registrada" icon={Radio} /></section>
    <AdminPanel title="Biblioteca recente" description={`Volume da amostra: ${bytes(totalBytes)}.`}><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">VSL</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Tamanho</th><th className="px-5 py-3 font-medium">Criada em</th></tr></thead><tbody>{(videos.data ?? []).map((video) => <tr key={video.id} className="border-t themeable-border-hairline"><td className="max-w-[460px] truncate px-5 py-4 font-semibold themeable-text-ink">{video.title}</td><td className="px-5 py-4"><StatusPill value={video.status} /></td><td className="px-5 py-4 themeable-text-ink"><span className="inline-flex items-center gap-2"><HardDrive size={14} />{bytes(Number(video.size_bytes))}</span></td><td className="px-5 py-4 themeable-text-ink-muted-48">{new Date(video.created_at).toLocaleString("pt-BR")}</td></tr>)}</tbody></table></div></AdminPanel>
  </div>;
}
