import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `folders-delete:${gate.account.accountOwnerId}`, { max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await context.params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("video_folders").delete().eq("id", id).eq("user_id", gate.account.accountOwnerId);
  return error ? NextResponse.json({ error: "folder_delete_failed" }, { status: 400 }) : NextResponse.json({ ok: true });
}
