import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import { readJsonBody } from "@/lib/api/request";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { deleteR2Object } from "@/lib/storage/r2";

/**
 * Exclusão de conta e dos dados associados (LGPD, art. 18, VI).
 *
 * O produto não tinha nenhum caminho para isto: nem rota, nem tela. Como a
 * operação é irreversível, exige a senha atual — a mesma barreira usada na
 * troca de senha, para que uma sessão roubada não consiga apagar a conta.
 *
 * As tabelas do schema `public` têm `on delete cascade` em `auth.users`, então
 * apagar o usuário limpa o banco. Os arquivos em storage não são cobertos por
 * cascade e são removidos explicitamente antes.
 */
async function passwordMatches(email: string, password: string) {
  const verifier = createSupabaseClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await verifier.auth.signInWithPassword({ email, password });
  return !error;
}

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = await rateLimit(request, `account-delete:${userId}`, { max: 3, windowMs: 30 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ password?: unknown; confirm?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const password = typeof parsed.body?.password === "string" ? parsed.body.password : "";
  if (parsed.body?.confirm !== "EXCLUIR") return NextResponse.json({ error: "confirmation_required", message: 'Envie confirm: "EXCLUIR" para confirmar a exclusão.' }, { status: 400 });
  if (!password) return NextResponse.json({ error: "password_required" }, { status: 400 });

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData?.user?.email;
  if (userError || !email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await passwordMatches(email, password))) {
    await supabase.from("security_events").insert({ user_id: userId, event_type: "account_delete_denied" });
    return NextResponse.json({ error: "invalid_password" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Um titular com equipe apagaria o workspace inteiro junto: exige esvaziar a
  // equipe antes, para que a decisão seja explícita.
  const { data: team } = await admin.from("account_teams").select("id").eq("owner_id", userId).maybeSingle();
  if (team) {
    const { count } = await admin.from("account_team_members").select("id", { count: "exact", head: true }).eq("team_id", team.id).eq("status", "active").neq("user_id", userId);
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: "team_not_empty", message: "Remova os outros membros da equipe antes de excluir a conta." }, { status: 409 });
    }
  }

  const { data: videos } = await admin.from("videos").select("object_path,storage_provider").eq("user_id", userId).limit(2000);
  const supabaseObjects = (videos ?? []).filter((video) => video.storage_provider !== "r2").map((video) => video.object_path);
  const r2Objects = (videos ?? []).filter((video) => video.storage_provider === "r2").map((video) => video.object_path);

  const storageErrors: string[] = [];
  if (supabaseObjects.length) {
    const { error } = await admin.storage.from("videos").remove(supabaseObjects);
    if (error) storageErrors.push(`videos: ${error.message}`);
  }
  for (const key of r2Objects) {
    await deleteR2Object(key).catch((reason) => storageErrors.push(`r2:${key}: ${reason instanceof Error ? reason.message : "unknown"}`));
  }
  const { data: assetFolders } = await admin.storage.from("player-assets").list(userId);
  if (assetFolders?.length) {
    const paths: string[] = [];
    for (const folder of assetFolders) {
      const { data: files } = await admin.storage.from("player-assets").list(`${userId}/${folder.name}`);
      for (const file of files ?? []) paths.push(`${userId}/${folder.name}/${file.name}`);
    }
    if (paths.length) {
      const { error } = await admin.storage.from("player-assets").remove(paths);
      if (error) storageErrors.push(`player-assets: ${error.message}`);
    }
  }

  // Arquivos órfãos são um problema de custo, não de privacidade do titular:
  // registramos e seguimos com a exclusão, que é o direito exercido.
  if (storageErrors.length) console.error("account_delete_storage_cleanup_failed", { userId, storageErrors });

  const deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error) {
    console.error("account_delete_failed", { userId, message: deleted.error.message });
    return NextResponse.json({ error: "account_delete_failed" }, { status: 500 });
  }

  await supabase.auth.signOut().catch(() => undefined);
  return NextResponse.json({ deleted: true, storageWarnings: storageErrors.length });
}
