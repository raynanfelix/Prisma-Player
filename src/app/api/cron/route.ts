import { NextResponse } from "next/server";
import { runCronMaintenance, verifyCronAuthorization } from "@/lib/cron-tasks/tasks";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authorization = verifyCronAuthorization(request);
  if (!authorization.ok) {
    return authorization.reason === "missing_secret"
      ? NextResponse.json({ error: "cron_secret_not_configured" }, { status: 503 })
      : NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const outcome = await runCronMaintenance();
  if (outcome.kind === "controls_unavailable") {
    return NextResponse.json({ error: "controls_unavailable" }, { status: 503 });
  }
  return NextResponse.json({
    success: outcome.result.errors.length === 0 && !outcome.result.timedOut,
    result: outcome.result,
  });
}
