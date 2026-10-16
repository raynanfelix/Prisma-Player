import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Fronteira arquitetural: módulos privilegiados nunca entram no bundle do
// navegador. `server-only` transforma um import acidental em erro de build.
// Este teste trava a fronteira em CI sem precisar compilar o Next.

const ROOT = join(process.cwd(), "src");

const PRIVILEGED = [
  "lib/access/bootstrap.ts",
  "lib/access/service.ts",
  "lib/access/team-context.ts",
  "lib/account/team.ts",
  "lib/analytics/ingest.ts",
  "lib/auth/server.ts",
  "lib/auth/session.ts",
  "lib/db/index.ts",
  "lib/security/rate-limit.ts",
  "lib/security/self-origins.ts",
  "lib/security/embed-origin.ts",
  "lib/security/auth-events.ts",
  "lib/storage/r2.ts",
  "lib/webhooks/delivery.ts",
  "lib/email/operational-report.ts",
  "lib/cache/embed-purge.ts",
  "lib/posthog-server.ts",
  "lib/billing/service.ts",
  "lib/billing/reconcile.ts",
  "lib/billing/shared-activation.ts",
  "lib/billing/ai-credits.ts",
  "lib/billing/ai-credit-reconcile.ts",
  "lib/billing/abacatepay/client.ts",
  "lib/billing/abacatepay/webhook.ts",
  "lib/billing/provider-payable.ts",
  "lib/billing/webhook-flow.ts",
  "lib/cron-tasks/tasks.ts",
  "lib/ai/nvidia.ts",
  "lib/api/guard.ts",
  "lib/api/admin-guard.ts",
  "lib/admin/support.ts",
  "lib/admin/search.ts",
  "lib/api/request.ts",
  "lib/player/assets.ts",
  "services/ads/server-events.ts",
];

const PRIVILEGED_IMPORT = new RegExp(
  `@/(lib/(db|access/|auth/(server|session|errors)|security/(rate-limit|embed-origin|auth-events|self-origins)|storage/|webhooks|email/|cache/|posthog-server|billing|ai/nvidia|api/(guard|request)|player/assets)|services/ads/server-events)`,
);

function allFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...allFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("fronteira cliente/servidor", () => {
  it("todo módulo privilegiado declara import server-only na primeira linha", () => {
    const missing = PRIVILEGED.filter((rel) => {
      const first = readFileSync(join(ROOT, rel), "utf8").split("\n")[0].trim();
      return first !== 'import "server-only";';
    });
    expect(missing).toEqual([]);
  });

  it("nenhum Client Component importa módulo privilegiado", () => {
    const offenders = allFiles(ROOT).filter((file) => {
      const text = readFileSync(file, "utf8");
      if (!/^"use client";/m.test(text)) return false;
      return PRIVILEGED_IMPORT.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
