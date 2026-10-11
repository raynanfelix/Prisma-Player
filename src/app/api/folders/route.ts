import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";

export async function GET(request: Request) {
  const gate = await guard(request);
  if (!gate.ok) return gate.response;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("video_folders").select("id,name,created_at").eq("user_id", gate.account.accountOwnerId).order("created_at", { ascending: false }).limit(200);
  return error ? NextResponse.json({ error: "folders_load_failed" }, { status: 500 }) : NextResponse.json({ folders: data });
}

export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `folders-create:${gate.account.accountOwnerId}`, { max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonBody<{ name?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const name = typeof parsed.body?.name === "string" ? parsed.body.name.trim().slice(0, 100) : "";
  if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("video_folders").insert({ user_id: gate.account.accountOwnerId, name }).select().single();
  return error ? NextResponse.json({ error: "folder_create_failed" }, { status: 400 }) : NextResponse.json({ folder: data }, { status: 201 });
}
