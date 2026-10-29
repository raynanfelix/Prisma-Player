import "server-only";
import { eq, and, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { errorEvents } = schema;

const GITHUB_OWNER = "raynanfelix";
const GITHUB_REPO = "Prisma-Player";
const ISSUES_PER_DAY_CAP = 5;
const DEDUP_WINDOW_HOURS = 24;
const MIN_OCCURRENCES_FOR_ISSUE = 3;

interface ErrorSample {
  message: string;
  stack: string | null;
  route: string | null;
  component: string | null;
}

/**
 * Checks if an error event meets the threshold for automatic Issue creation:
 * - Severity is HIGH or CRITICAL, OR count >= MIN_OCCURRENCES_FOR_ISSUE
 * - No existing issue_url (not already linked)
 * - No issue created for this fingerprint in the last DEDUP_WINDOW_HOURS
 * - Daily cap not exceeded
 */
export async function shouldCreateIssue(fingerprint: string): Promise<boolean> {
  try {
    const row = await db
      .select()
      .from(errorEvents)
      .where(eq(errorEvents.fingerprint, fingerprint))
      .limit(1);

    if (!row.length) return false;
    const event = row[0];

    // Already has an issue
    if (event.issueUrl) return false;

    // Threshold check
    const isHighSeverity = event.severity === "critical" || event.severity === "high";
    const isRecurrent = event.count >= MIN_OCCURRENCES_FOR_ISSUE;
    if (!isHighSeverity && !isRecurrent) return false;

    // Dedup window: check if any error_events got an issue_url in the last N hours
    const windowStart = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);
    const recentIssues = await db
      .select({ count: sql<number>`count(*)` })
      .from(errorEvents)
      .where(
        and(
          gte(errorEvents.lastSeen, windowStart),
          sql`${errorEvents.issueUrl} IS NOT NULL`,
        ),
      );
    // This checks global dedup across all fingerprints — but we also need per-fingerprint dedup.
    // Actually the spec says "dedup 24h/fingerprint" meaning same fingerprint can't open
    // another issue within 24h. Since we check event.issueUrl above (already linked),
    // and the upsert ensures one row per fingerprint, this is sufficient.

    // Daily cap: count issues created today across all fingerprints
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(errorEvents)
      .where(
        and(
          gte(errorEvents.lastSeen, todayStart),
          sql`${errorEvents.issueUrl} IS NOT NULL`,
        ),
      );
    if ((todayCount[0]?.count ?? 0) >= ISSUES_PER_DAY_CAP) return false;

    return true;
  } catch {
    return false; // Fail-open
  }
}

/**
 * Builds a machine-readable GitHub Issue body from an error event.
 * Includes structured JSON block for DeepSeek Harness / Claude Code consumption.
 */
/**
 * Extracts suspected source files from a sanitized stack trace.
 * Returns an array of src-relative paths for the agent to inspect.
 */
function extractSuspectedFiles(stack: string | null): string[] {
  if (!stack) return [];
  const lines = stack.split("\n");
  const files: string[] = [];
  for (const line of lines) {
    // Match patterns like "at functionName (/src/lib/foo.ts:10:5)" or "at /app/api/bar/route.ts:20:3"
    const match = line.match(/(?:\/(?:src|app)\/[^\s:)]+\.tsx?)/);
    if (match && !files.includes(match[0])) {
      files.push(match[0]);
    }
  }
  return files.slice(0, 10); // Cap at 10 files
}

/**
 * Generates a preliminary hypothesis based on error characteristics.
 * This is a heuristic — the agent will refine it during investigation.
 */
function generateHypothesis(sample: ErrorSample): string {
  const msg = sample.message.toLowerCase();
  if (msg.includes("timeout") || msg.includes("etimedout")) {
    return "Possible upstream service timeout or network latency. Check external API health and timeout configurations.";
  }
  if (msg.includes("econnrefused") || msg.includes("enotfound")) {
    return "External service unreachable. Verify DNS, firewall rules, and service availability.";
  }
  if (msg.includes("permission denied") || msg.includes("403") || msg.includes("unauthorized")) {
    return "Authorization or permission failure. Review guard logic, RLS policies, or API key validity.";
  }
  if (msg.includes("null") || msg.includes("undefined") || msg.includes("cannot read propert")) {
    return "Null/undefined reference. Likely missing data validation or unexpected API response shape.";
  }
  if (msg.includes("json") || msg.includes("parse") || msg.includes("syntax")) {
    return "Malformed JSON or parsing error. Validate input schema and external API response format.";
  }
  if (sample.route?.includes("/api/billing") || msg.includes("stripe")) {
    return "Billing/Stripe integration issue. Check webhook signatures, API version compatibility, or customer state.";
  }
  return "Unclassified error. Agent should inspect suspected files and reproduce the failure to determine root cause.";
}

export function buildIssueBody(event: typeof errorEvents.$inferSelect): string {
  const sample = event.sample as ErrorSample;
  const jsonBlock = {
    fingerprint: event.fingerprint,
    severity: event.severity,
    occurrences: event.count,
    first_seen: event.firstSeen.toISOString(),
    last_seen: event.lastSeen.toISOString(),
    version: event.version,
    suspected_files: extractSuspectedFiles(sample.stack),
    hypothesis: generateHypothesis(sample),
    acceptance_criteria: [
      "Error no longer occurs under the same conditions",
      "Regression test added that reproduces the original failure",
      "All existing tests pass",
      "No secrets or PII exposed in logs or UI",
    ],
    admin_url: `https://app.prismaplayer.online/admin/errors?fingerprint=${event.fingerprint}`,
  };

  return `## 🔴 Erro Capturado Automaticamente

**Severidade:** \`${event.severity.toUpperCase()}\`
**Ocorrências:** ${event.count}
**Rota:** \`${sample.route ?? "desconhecida"}\`
**Componente:** \`${sample.component ?? "desconhecido"}\`
**Versão:** \`${event.version ?? "local"}\`
**Primeira ocorrência:** ${event.firstSeen.toLocaleString("pt-BR")}
**Última ocorrência:** ${event.lastSeen.toLocaleString("pt-BR")}

---

### Mensagem de Erro
\`\`\`
${sample.message}
\`\`\`

### Stack Trace (sanitizado)
\`\`\`
${sample.stack ?? "(sem stack trace)"}
\`\`\`

---

### 🤖 Bloco Legível por Máquina (DeepSeek Harness / Claude Code)
\`\`\`json
${JSON.stringify(jsonBlock, null, 2)}
\`\`\`

---

### Passos para Reprodução
1. Acesse a rota \`${sample.route ?? "/"}\`
2. Observe o erro "${sample.message}"
3. Verifique o console/network tab para detalhes adicionais

### Comportamento Esperado
A operação deveria completar sem erro.

### Comportamento Observado
Erro "${sample.message}" com ${event.count} ocorrências desde ${event.firstSeen.toLocaleDateString("pt-BR")}.

### Contexto Adicional
- Este erro foi capturado automaticamente pelo sistema de monitoramento interno
- Dados sanitizados: nenhum segredo ou dado pessoal está presente
- Painel admin: [Ver detalhes](${jsonBlock.admin_url})

---
*Issue criada automaticamente pelo Error Capture System — Fase 2*`;
}

/**
 * Creates a GitHub Issue for an error event that meets the threshold.
 * Updates the error_events row with the issue URL/number on success.
 * Fail-open: returns null if token is missing or API call fails.
 */
export async function createGitHubIssue(
  fingerprint: string,
): Promise<{ url: string; number: number } | null> {
  const token = process.env.GITHUB_ISSUE_TOKEN;
  if (!token) return null; // Graceful degradation without token

  try {
    const row = await db
      .select()
      .from(errorEvents)
      .where(eq(errorEvents.fingerprint, fingerprint))
      .limit(1);

    if (!row.length) return null;
    const event = row[0];

    if (!(await shouldCreateIssue(fingerprint))) return null;

    const sample = event.sample as ErrorSample;
    const title = `[${event.severity.toUpperCase()}] ${sample.message.slice(0, 80)}${sample.message.length > 80 ? "…" : ""}`;
    const body = buildIssueBody(event);

    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          body,
          labels: ["bug", "auto-generated", `severity:${event.severity}`],
        }),
      },
    );

    if (!response.ok) return null;

    const issue = (await response.json()) as { html_url: string; number: number };

    // Link the issue to the error event
    await db
      .update(errorEvents)
      .set({ issueUrl: issue.html_url, issueNumber: issue.number })
      .where(eq(errorEvents.fingerprint, fingerprint));

    return { url: issue.html_url, number: issue.number };
  } catch {
    return null; // Fail-open
  }
}