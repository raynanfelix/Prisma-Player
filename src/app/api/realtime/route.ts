import { NextResponse } from "next/server";

import { guard } from "@/lib/api/guard";
import { realtime, sealQuery, videoCountersQuery, videoStatsQuery } from "@/lib/realtime/server";

/**
 * Sela live queries do dashboard e devolve para o client assinar via WebSocket.
 * O client NUNCA vê o SQL nem os parâmetros - só o token selado.
 */
export async function GET(request: Request) {
  const gate = await guard(request);
  if (!gate.ok) return gate.response;
  const userId = gate.account.accountOwnerId;

  if (!realtime) {
    return NextResponse.json(
      { error: "realtime_not_configured", hint: "NEON_REALTIME_SECRET ausente" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const type = new URL(request.url).searchParams.get("type") ?? "counters";

  try {
    if (type === "counters") {
      const sealed = await sealQuery(videoCountersQuery(userId));
      return NextResponse.json({ type, sealed }, { headers: { "cache-control": "no-store" } });
    }
    if (type === "stats") {
      const sealed = await sealQuery(videoStatsQuery(userId));
      return NextResponse.json({ type, sealed }, { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "invalid_type" }, { status: 400, headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("realtime_seal_route_failed", { reason: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "realtime_seal_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
