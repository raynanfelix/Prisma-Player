import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { db, schema } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { AB } from "@/lib/constants";

const { abTests, abTestFolders, abTestVariants, playerEvents, videos } = schema;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type VariantMetrics = { id: string; video_id: string; weight: number; videos: { title: string | null }; metrics: { impressions: number; plays: number; completed: number; reached75: number; playRate: number; completionRate: number; retention75: number } };

/**
 * Esta rota já segue o padrão do sistema (admin + filtro explícito por
 * `accountOwnerId`) - o comentário histórico sobre RLS permanece como
 * advertência: nunca voltar ao cliente com `auth.uid()`, que escondia a lista
 * de membros de equipe.
 */
export async function GET(request: Request) {
  const gate = await guard(request, { paid: true });
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;

  type TestRow = { id: string; name: string; status: string; folderId: string | null; createdAt: Date };
  type FolderRow = { id: string; name: string; createdAt: Date };
  type VariantRow = { id: string; testId: string; videoId: string; weight: number; title: string | null };
  type EventRow = { variantId: string; sessionId: string; eventType: string; progressPercent: number };
  let tests: TestRow[] = [], folders: FolderRow[] = [], variants: VariantRow[] = [], events: EventRow[] = [];
  try {
    [tests, folders] = await Promise.all([
      db.select({ id: abTests.id, name: abTests.name, status: abTests.status, folderId: abTests.folderId, createdAt: abTests.createdAt }).from(abTests).where(eq(abTests.userId, ownerId)).orderBy(desc(abTests.createdAt)).limit(100),
      db.select({ id: abTestFolders.id, name: abTestFolders.name, createdAt: abTestFolders.createdAt }).from(abTestFolders).where(eq(abTestFolders.userId, ownerId)).orderBy(desc(abTestFolders.createdAt)).limit(100),
    ]);
    const testIds = tests.map((test) => test.id);
    variants = testIds.length
      ? await db.select({ id: abTestVariants.id, testId: abTestVariants.testId, videoId: abTestVariants.videoId, weight: abTestVariants.weight, title: videos.title }).from(abTestVariants).innerJoin(videos, eq(videos.id, abTestVariants.videoId)).where(inArray(abTestVariants.testId, testIds))
      : [];
    // Antes: SELECT de `player_events` sem filtro nem limite, trazendo o histórico
    // inteiro da conta a cada abertura da tela.
    const variantIdList = variants.map((variant) => variant.id);
    events = variantIdList.length
      ? await db.select({ variantId: playerEvents.variantId, sessionId: playerEvents.sessionId, eventType: playerEvents.eventType, progressPercent: playerEvents.progressPercent }).from(playerEvents).where(inArray(playerEvents.variantId, variantIdList)).limit(AB.MAX_EVENTS_PER_TEST_READ)
      : [];
  } catch {
    return NextResponse.json({ error: "tests_load_failed" }, { status: 500 });
  }

  const byVariant = new Map<string, { impressions: Set<string>; plays: Set<string>; completed: Set<string>; reached75: Set<string> }>();
  for (const variant of variants) byVariant.set(variant.id, { impressions: new Set(), plays: new Set(), completed: new Set(), reached75: new Set() });
  for (const event of events) {
    const bucket = byVariant.get(event.variantId);
    if (!bucket) continue;
    if (event.eventType === "impression") bucket.impressions.add(event.sessionId);
    else if (event.eventType === "play") bucket.plays.add(event.sessionId);
    else if (event.eventType === "complete") { bucket.completed.add(event.sessionId); bucket.reached75.add(event.sessionId); }
    else if (event.eventType === "progress" && event.progressPercent >= 75) bucket.reached75.add(event.sessionId);
  }

  // Contrato preservado: chaves snake_case (folder_id, ab_test_variants,
  // created_at) e o embed `videos: { title }` do PostgREST.
  const enriched = tests.map((test) => ({
    id: test.id,
    name: test.name,
    status: test.status,
    folder_id: test.folderId,
    created_at: test.createdAt.toISOString(),
    ab_test_variants: variants
      .filter((variant) => variant.testId === test.id)
      .map((variant): VariantMetrics => {
        const bucket = byVariant.get(variant.id)!;
        const impressions = bucket.impressions.size, plays = bucket.plays.size, completed = bucket.completed.size, reached75 = bucket.reached75.size;
        return {
          id: variant.id,
          video_id: variant.videoId,
          weight: variant.weight,
          videos: { title: variant.title },
          metrics: {
            impressions, plays, completed, reached75,
            playRate: impressions ? plays / impressions * 100 : 0,
            completionRate: plays ? completed / plays * 100 : 0,
            retention75: plays ? reached75 / plays * 100 : 0,
          },
        };
      }),
  }));
  return NextResponse.json({ tests: enriched, folders: folders.map((folder) => ({ id: folder.id, name: folder.name, created_at: folder.createdAt.toISOString() })) }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;

  const limited = await rateLimit(request, `ab-tests-create:${ownerId}`, { max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonBody<{ type?: unknown; name?: unknown; folderId?: unknown; videoIds?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });

  try {
    if (body?.type !== "folder") {
      const videoIds = Array.isArray(body?.videoIds) ? [...new Set(body.videoIds.filter((id): id is string => typeof id === "string"))].slice(0, 10) : [];
      if (videoIds.length < 2) return NextResponse.json({ error: "two_videos_required" }, { status: 400 });
      // UUID inválido nunca pertence à conta (mesmo resultado do PostgREST,
      // que falhava a query inteira e devolvia lista vazia).
      const validVideoIds = videoIds.filter((id) => uuid.test(id));
      const owned = validVideoIds.length ? await db.select({ id: videos.id }).from(videos).where(and(eq(videos.userId, ownerId), inArray(videos.id, validVideoIds))) : [];
      if (owned.length !== videoIds.length) return NextResponse.json({ error: "invalid_videos" }, { status: 400 });

      const folderId = typeof body?.folderId === "string" ? body.folderId : null;
      if (folderId) {
        if (!uuid.test(folderId)) return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
        const [folder] = await db.select({ id: abTestFolders.id }).from(abTestFolders).where(and(eq(abTestFolders.id, folderId), eq(abTestFolders.userId, ownerId))).limit(1);
        if (!folder) return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
      }

      const [test] = await db.insert(abTests).values({ userId: ownerId, name: name.slice(0, 150), folderId, status: "active" }).returning();
      if (!test) return NextResponse.json({ error: "create_failed" }, { status: 400 });
      const baseWeight = Math.floor(100 / videoIds.length);
      try {
        await db.insert(abTestVariants).values(videoIds.map((videoId, index) => ({ userId: ownerId, testId: test.id, videoId, weight: index === videoIds.length - 1 ? 100 - baseWeight * index : baseWeight })));
      } catch {
        // Rollback manual do teste órfão (equivalente ao delete compensatório).
        await db.delete(abTests).where(and(eq(abTests.id, test.id), eq(abTests.userId, ownerId)));
        return NextResponse.json({ error: "variants_create_failed" }, { status: 400 });
      }
      return NextResponse.json({ item: { id: test.id, user_id: test.userId, name: test.name, status: test.status, folder_id: test.folderId, created_at: test.createdAt.toISOString(), updated_at: test.updatedAt.toISOString() } }, { status: 201 });
    }
    const [folder] = await db.insert(abTestFolders).values({ userId: ownerId, name: name.slice(0, 100) }).returning();
    return folder
      ? NextResponse.json({ item: { id: folder.id, user_id: folder.userId, name: folder.name, created_at: folder.createdAt.toISOString() } }, { status: 201 })
      : NextResponse.json({ error: "create_failed" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "create_failed" }, { status: 400 });
  }
}
