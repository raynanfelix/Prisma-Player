import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";

/**
 * Esta rota usava o cliente com RLS (`auth.uid()`), diferente de todo o resto do
 * sistema, que resolve o titular da conta. O efeito era que membros de equipe
 * viam a lista de testes A/B sempre vazia. Agora segue o mesmo padrão: admin
 * client + filtro explícito por `accountOwnerId`.
 */
export async function GET(request: Request) {
  const gate = await guard(request, { paid: true });
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;

  const supabase = createAdminClient();
  const [{ data: tests, error }, { data: folders }] = await Promise.all([
    supabase.from("ab_tests").select("id,name,status,folder_id,created_at,ab_test_variants(id,video_id,weight,videos(title))").eq("user_id", ownerId).order("created_at", { ascending: false }).limit(100),
    supabase.from("ab_test_folders").select("id,name,created_at").eq("user_id", ownerId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (error) return NextResponse.json({ error: "tests_load_failed" }, { status: 500 });

  const variantIds = (tests ?? []).flatMap((test) => test.ab_test_variants.map((variant) => variant.id));
  // Antes: SELECT de `player_events` sem filtro nem limite, trazendo o histórico
  // inteiro da conta a cada abertura da tela.
  const { data: events } = variantIds.length
    ? await supabase.from("player_events").select("variant_id,session_id,event_type,progress_percent").in("variant_id", variantIds).limit(100_000)
    : { data: [] as Array<{ variant_id: string; session_id: string; event_type: string; progress_percent: number }> };

  const byVariant = new Map<string, { impressions: Set<string>; plays: Set<string>; completed: Set<string>; reached75: Set<string> }>();
  for (const variantId of variantIds) byVariant.set(variantId, { impressions: new Set(), plays: new Set(), completed: new Set(), reached75: new Set() });
  for (const event of events ?? []) {
    const bucket = byVariant.get(event.variant_id);
    if (!bucket) continue;
    if (event.event_type === "impression") bucket.impressions.add(event.session_id);
    else if (event.event_type === "play") bucket.plays.add(event.session_id);
    else if (event.event_type === "complete") { bucket.completed.add(event.session_id); bucket.reached75.add(event.session_id); }
    else if (event.event_type === "progress" && event.progress_percent >= 75) bucket.reached75.add(event.session_id);
  }

  const enriched = (tests ?? []).map((test) => ({
    ...test,
    ab_test_variants: test.ab_test_variants.map((variant) => {
      const bucket = byVariant.get(variant.id)!;
      const impressions = bucket.impressions.size, plays = bucket.plays.size, completed = bucket.completed.size, reached75 = bucket.reached75.size;
      return {
        ...variant,
        metrics: {
          impressions, plays, completed, reached75,
          playRate: impressions ? plays / impressions * 100 : 0,
          completionRate: plays ? completed / plays * 100 : 0,
          retention75: plays ? reached75 / plays * 100 : 0,
        },
      };
    }),
  }));
  return NextResponse.json({ tests: enriched, folders: folders ?? [] }, { headers: { "cache-control": "private, no-store" } });
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

  const supabase = createAdminClient();
  if (body?.type !== "folder") {
    const videoIds = Array.isArray(body?.videoIds) ? [...new Set(body.videoIds.filter((id): id is string => typeof id === "string"))].slice(0, 10) : [];
    if (videoIds.length < 2) return NextResponse.json({ error: "two_videos_required" }, { status: 400 });
    const { data: owned } = await supabase.from("videos").select("id").eq("user_id", ownerId).in("id", videoIds);
    if (owned?.length !== videoIds.length) return NextResponse.json({ error: "invalid_videos" }, { status: 400 });

    const folderId = typeof body?.folderId === "string" ? body.folderId : null;
    if (folderId) {
      const { data: folder } = await supabase.from("ab_test_folders").select("id").eq("id", folderId).eq("user_id", ownerId).maybeSingle();
      if (!folder) return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
    }

    const { data: test, error: testError } = await supabase.from("ab_tests").insert({ user_id: ownerId, name: name.slice(0, 150), folder_id: folderId, status: "active" }).select().single();
    if (testError || !test) return NextResponse.json({ error: "create_failed" }, { status: 400 });
    const baseWeight = Math.floor(100 / videoIds.length);
    const { error: variantsError } = await supabase.from("ab_test_variants").insert(videoIds.map((videoId, index) => ({ user_id: ownerId, test_id: test.id, video_id: videoId, weight: index === videoIds.length - 1 ? 100 - baseWeight * index : baseWeight })));
    if (variantsError) { await supabase.from("ab_tests").delete().eq("id", test.id).eq("user_id", ownerId); return NextResponse.json({ error: "variants_create_failed" }, { status: 400 }); }
    return NextResponse.json({ item: test }, { status: 201 });
  }
  const { data, error } = await supabase.from("ab_test_folders").insert({ user_id: ownerId, name: name.slice(0, 100) }).select().single();
  return error ? NextResponse.json({ error: "create_failed" }, { status: 400 }) : NextResponse.json({ item: data }, { status: 201 });
}
