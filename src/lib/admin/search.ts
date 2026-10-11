import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type SearchResult =
  | { kind: "account"; id: string; title: string; subtitle: string }
  | { kind: "video"; id: string; title: string; subtitle: string }
  | { kind: "checkout"; id: string; title: string; subtitle: string };

/**
 * Busca global do admin: contas (nome/email/uuid), vídeos (título) e
 * checkouts (external_id). Sem PII além do necessário à função; teto baixo.
 */
export async function adminSearch(query: string): Promise<SearchResult[]> {
  const term = query.trim().slice(0, 80);
  if (term.length < 2) return [];
  const admin = createAdminClient();
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const [profiles, videos, checkouts] = await Promise.all([
    admin.from("profiles").select("id,email,full_name").or(`email.ilike.${like},full_name.ilike.${like}`).limit(8),
    admin.from("videos").select("id,title,user_id").ilike("title", like).order("created_at", { ascending: false }).limit(8),
    admin.from("billing_checkouts").select("id,external_id,amount_cents,status").ilike("external_id", like).order("created_at", { ascending: false }).limit(5),
  ]);
  const out: SearchResult[] = [];
  for (const profile of profiles.data ?? []) {
    out.push({ kind: "account", id: profile.id, title: profile.full_name || profile.email, subtitle: profile.email });
  }
  if (/^[0-9a-f-]{8,}$/i.test(term)) {
    const { data: byId } = await admin.from("profiles").select("id,email,full_name").eq("id", term).maybeSingle();
    if (byId && !out.some((item) => item.id === byId.id)) {
      out.unshift({ kind: "account", id: byId.id, title: byId.full_name || byId.email, subtitle: byId.email });
    }
  }
  for (const video of videos.data ?? []) {
    out.push({ kind: "video", id: video.id, title: video.title, subtitle: `VSL · ${video.user_id.slice(0, 8)}…` });
  }
  for (const checkout of checkouts.data ?? []) {
    out.push({ kind: "checkout", id: checkout.id, title: `${(checkout.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · ${checkout.status}`, subtitle: checkout.external_id });
  }
  return out.slice(0, 20);
}
