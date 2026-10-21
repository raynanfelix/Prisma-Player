import { and, eq, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { db, schema } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";

const { videos } = schema;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const segments = new Set(["all", "buyers", "completers", "engagers_75", "cta_clickers"]);

/**
 * DECISÃO DE SEMÂNTICA - o cap de 50 mil eventos morreu por AGREGAÇÃO, não
 * por paginação. Este "export" nunca foi uma lista de sessões: o arquivo é um
 * perfil agregado (totais + distribuições top-12), então todos os números
 * dele são computáveis no Postgres. O caminho antigo baixava até
 * ANALYTICS.MAX_EVENTS_PER_ANALYSIS linhas (risk < 70, ordem desc) e dobrava
 * em JS - em vídeo viral o cap silencioso CORTAVA sessões no meio (eventos
 * fora da janela mudavam maxProgress/flags das sessões de borda e o próprio
 * total): o relatório já era inexato antes de ser formatado.
 *
 * A mesma matemática do fold original, agora no banco:
 * - atributos por sessão = os do evento MAIS RECENTE (created_at desc, id
 *   desc) - o fold processava as linhas nessa ordem e mantinha os atributos
 *   do primeiro evento visto de cada sessão;
 * - maxProgress = max(progress_percent) (nulo → 0, como antes);
 * - conversion/complete/cta = bool_or por sessão;
 * - filtro risk_score < 70 idêntico; segmento filtra SESSÕES, não eventos;
 * - distribuições: sessões por valor, top-12 por contagem, empates por
 *   last_seen desc - antes o empate seguia a ordem de inserção do Map (um
 *   artefato da iteração desc); é a mesma ordem, agora explícita.
 */

/** `db.execute` devolve `{ rows }` (pg) ou array (outros drivers) - normaliza. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

/** Agregados vêm como int (cast no SQL); qualquer shape degrada para 0, nunca NaN. */
function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

type SegmentSqlRow = {
  dimension?: string | null;
  name?: string | null;
  session_count?: unknown;
  buyers?: unknown;
};

/** Condição de segmento sobre a CTE de sessões - fragmento estático (nenhum dado do usuário entra no texto). */
const segmentConditions: Record<string, SQL> = {
  all: sql`true`,
  buyers: sql`conversion`,
  completers: sql`complete`,
  engagers_75: sql`max_progress >= 75`,
  cta_clickers: sql`cta`,
};

/**
 * Mesma formatação da distribution() original: `nome: N (P%)` por valor,
 * ordenado por contagem (o SQL já entrega session_count desc, last_seen
 * desc), cortado em 12 e com percentual sobre o total do segmento.
 */
function distributionOf(rows: SegmentSqlRow[], column: string, totalSessions: number): string {
  return rows
    .filter((row) => row.dimension === column)
    .slice(0, 12)
    .map((row) => `${String(row.name ?? "Não informado")}: ${num(row.session_count)} (${(num(row.session_count) / Math.max(totalSessions, 1) * 100).toFixed(1)}%)`)
    .join("\n");
}

export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true, role: "read", paid: true });
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;
  // Exportar público exige `audience_sync`, um recurso de plano superior.
  if (!gate.plan.capabilities.audience_sync) {
    return NextResponse.json({ error: "plan_upgrade_required", capability: "audience_sync", message: "A exportação de público faz parte de um plano superior." }, { status: 402 });
  }
  const limited = await rateLimit(request, `audience-export:${ownerId}`, { max: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const parsed = await readJsonBody<{ videoId?: string; segment?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const videoId = parsed.body?.videoId ?? "", segment = parsed.body?.segment ?? "engagers_75";
  if (!uuid.test(videoId) || !segments.has(segment)) return NextResponse.json({ error: "invalid_export_request" }, { status: 400 });

  let video: { title: string } | undefined;
  let rows: SegmentSqlRow[] = [];
  try {
    [video] = await db.select({ id: videos.id, title: videos.title }).from(videos).where(and(eq(videos.id, videoId), eq(videos.userId, ownerId), eq(videos.status, "ready"))).limit(1);
    if (!video) return NextResponse.json({ error: "video_not_found" }, { status: 404 });
    // Uma única query faz o fold por sessão (CTE) e as distribuições
    // (GROUPING SETS com uma linha de total): nenhum evento cruza a rede e
    // não existe mais teto - os números são exatos em qualquer volume.
    const result = await db.execute(sql`
      with sessions as (
        select
          session_id,
          coalesce((array_agg(country_code order by created_at desc, id desc))[1], 'XX') as country,
          coalesce((array_agg(device_type order by created_at desc, id desc))[1], 'other') as device,
          coalesce((array_agg(os_name order by created_at desc, id desc))[1], 'Other') as os,
          coalesce((array_agg(browser_name order by created_at desc, id desc))[1], 'Other') as browser,
          coalesce((array_agg(traffic_source order by created_at desc, id desc))[1], 'Direto') as source,
          coalesce((array_agg(coalesce(utm_campaign, campaign_id) order by created_at desc, id desc))[1], 'Não informado') as campaign,
          max(progress_percent) as max_progress,
          bool_or(event_type = 'conversion') as conversion,
          bool_or(event_type = 'complete') as complete,
          bool_or(event_type = 'cta_click') as cta,
          max(created_at) as last_seen
        from video_events
        where video_id = ${videoId} and user_id = ${ownerId} and risk_score < 70
        group by session_id
      )
      select
        case
          when grouping(country) = 0 then 'country'
          when grouping(device) = 0 then 'device'
          when grouping(os) = 0 then 'os'
          when grouping(browser) = 0 then 'browser'
          when grouping(source) = 0 then 'source'
          when grouping(campaign) = 0 then 'campaign'
          else 'total'
        end as dimension,
        case
          when grouping(country) = 0 then coalesce(nullif(country, ''), 'Não informado')
          when grouping(device) = 0 then coalesce(nullif(device, ''), 'Não informado')
          when grouping(os) = 0 then coalesce(nullif(os, ''), 'Não informado')
          when grouping(browser) = 0 then coalesce(nullif(browser, ''), 'Não informado')
          when grouping(source) = 0 then coalesce(nullif(source, ''), 'Não informado')
          when grouping(campaign) = 0 then coalesce(nullif(campaign, ''), 'Não informado')
          else null
        end as name,
        count(*)::int as session_count,
        (count(*) filter (where conversion))::int as buyers,
        max(last_seen) as last_seen
      from sessions
      where ${segmentConditions[segment]}
      group by grouping sets ((country), (device), (os), (browser), (source), (campaign), ())
      order by dimension asc, session_count desc, last_seen desc
    `);
    rows = rowsOf<SegmentSqlRow>(result);
  } catch {
    return NextResponse.json({ error: "audience_unavailable" }, { status: 503 });
  }

  // A linha de total sempre existe (GROUPING SETS com o conjunto vazio):
  // zero sessões no segmento é o mesmo 422 do original.
  const total = rows.find((row) => row.dimension === "total");
  const totalSessions = num(total?.session_count);
  const buyers = num(total?.buyers);
  if (!totalSessions) return NextResponse.json({ error: "segment_without_data", message: "Esta VSL ainda não possui pessoas no segmento escolhido." }, { status: 422 });

  const content = `PRISMA PLAYER - PERFIL REAL DE PÚBLICO\nVSL: ${video.title}\nSegmento: ${segment}\nGerado em: ${new Date().toLocaleString("pt-BR")}\n\nAMOSTRA E SINAIS\nSessões no segmento: ${totalSessions}\nCompradores/conversões identificadas: ${buyers}\nTaxa de conversão do segmento: ${(buyers / totalSessions * 100).toFixed(1)}%\n\nPAÍSES\n${distributionOf(rows, "country", totalSessions)}\n\nDISPOSITIVOS\n${distributionOf(rows, "device", totalSessions)}\n\nSISTEMAS OPERACIONAIS\n${distributionOf(rows, "os", totalSessions)}\n\nNAVEGADORES\n${distributionOf(rows, "browser", totalSessions)}\n\nORIGENS DE TRÁFEGO\n${distributionOf(rows, "source", totalSessions)}\n\nCAMPANHAS\n${distributionOf(rows, "campaign", totalSessions)}\n\nCOMO USAR EM ADS\n1. Priorize os países, dispositivos e origens com maior presença entre compradores e espectadores qualificados.\n2. Cruze este perfil com os relatórios do seu checkout antes de alterar orçamento.\n3. Use UTMs consistentes para separar campanha, conjunto e criativo.\n4. Não trate amostra pequena como conclusão estatística.\n\nLIMITAÇÕES IMPORTANTES\nIdade e gênero não são coletados pelo player e não foram inferidos ou inventados. Esses atributos exigem dados consentidos do checkout, CRM ou relatórios agregados da plataforma de anúncios. O arquivo não contém e-mail, telefone, IP nem identificadores pessoais; ele serve como orientação real de segmentação, não como lista de Customer Match.\n`;
  const filename = video.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "vsl";
  return new NextResponse(`\uFEFF${content}`, { headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="audiencia-${filename}.txt"`, "cache-control": "no-store" } });
}
