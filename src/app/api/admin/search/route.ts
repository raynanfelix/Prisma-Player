import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { adminSearch } from "@/lib/admin/search";
import { rateLimit } from "@/lib/security/rate-limit";

/** Busca global do admin (contas, vídeos, checkouts). Leitura; sem PII extra. */
export async function GET(request: Request) {
  const gate = await adminGuard(request);
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `admin-search:${gate.adminId}`, { max: 60, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await adminSearch(query);
  return NextResponse.json({ results }, { headers: { "cache-control": "no-store" } });
}
