import "server-only";

import { desc, eq, ilike, or } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { formatBrlFromCents } from "@/lib/format/money";

const { billingCheckouts, profiles, videos } = schema;

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
  // Remove wildcards LIKE para evitar expansões inesperadas e vírgulas que
  // antes quebravam o filtro .or() do PostgREST (mantido por higiene de termo).
  const cleanTerm = term.replace(/[%_]/g, "").replace(/,/g, " ");
  const like = `%${cleanTerm}%`;
  const [profilesRows, videosRows, checkoutRows] = await Promise.all([
    db.select({ id: profiles.id, email: profiles.email, fullName: profiles.fullName })
      .from(profiles)
      .where(or(ilike(profiles.email, like), ilike(profiles.fullName, like)))
      .limit(8),
    db.select({ id: videos.id, title: videos.title, userId: videos.userId })
      .from(videos)
      .where(ilike(videos.title, like))
      .orderBy(desc(videos.createdAt))
      .limit(8),
    db.select({ id: billingCheckouts.id, externalId: billingCheckouts.externalId, amountCents: billingCheckouts.amountCents, status: billingCheckouts.status })
      .from(billingCheckouts)
      .where(ilike(billingCheckouts.externalId, like))
      .orderBy(desc(billingCheckouts.createdAt))
      .limit(5),
  ]);
  const out: SearchResult[] = [];
  for (const profile of profilesRows) {
    out.push({ kind: "account", id: profile.id, title: profile.fullName || profile.email, subtitle: profile.email });
  }
  if (/^[0-9a-f-]{8,}$/i.test(term)) {
    const [byId] = await db.select({ id: profiles.id, email: profiles.email, fullName: profiles.fullName }).from(profiles).where(eq(profiles.id, term)).limit(1);
    if (byId && !out.some((item) => item.id === byId.id)) {
      out.unshift({ kind: "account", id: byId.id, title: byId.fullName || byId.email, subtitle: byId.email });
    }
  }
  for (const video of videosRows) {
    out.push({ kind: "video", id: video.id, title: video.title, subtitle: `VSL · ${video.userId.slice(0, 8)}…` });
  }
  for (const checkout of checkoutRows) {
    out.push({ kind: "checkout", id: checkout.id, title: `${formatBrlFromCents(checkout.amountCents)} · ${checkout.status}`, subtitle: checkout.externalId });
  }
  return out.slice(0, 20);
}
