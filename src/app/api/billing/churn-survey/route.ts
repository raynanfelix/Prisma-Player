import { NextResponse } from "next/server";

import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { alertOperations } from "@/lib/security/alert-webhook";
import { db, schema } from "@/lib/db";
import { safeLog } from "@/lib/utils/log";

const { billingChurnSurveys } = schema;

const NO_STORE = { "cache-control": "no-store" } as const;

const SURVEY_REASONS = new Set(["preco", "nao_uso", "problemas_tecnicos", "migrei_ferramenta", "outro"]);
const TEXT_LIMIT = 500;

function readTextField(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, TEXT_LIMIT) : "";
}

/**
 * POST /api/billing/churn-survey — registra o motivo do cancelamento na
 * tabela `billing_churn_surveys` (spec Billing Completo, item 4, skill
 * churn-prevention: 1 pergunta, resposta opcional, zero atrito).
 *
 * Contrato de transparência: a pesquisa NUNCA bloqueia o cancelamento —
 * este endpoint só registra; o cancelamento de verdade acontece no
 * Customer Portal do Stripe (POST /api/billing/portal). Erro aqui segue
 * como falha honesta (o client avisa e libera o portal do mesmo jeito).
 *
 * `feedback` guarda o detalhe do motivo + a sugestão de melhoria com
 * label quando ambas vêm preenchidas (cada campo ≤ 500 chars; a checagem
 * do banco aceita o combinado ≤ 1100).
 */
export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true, role: "manage" });
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;

  const limited = await rateLimit(request, `billing-churn-survey:${ownerId}`, { max: 10, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ reason?: unknown; feedback?: unknown; improvement?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const reason = typeof parsed.body.reason === "string" ? parsed.body.reason.trim() : "";
  if (!SURVEY_REASONS.has(reason)) {
    return NextResponse.json({ error: "invalid_reason" }, { status: 400, headers: NO_STORE });
  }

  const detail = readTextField(parsed.body.feedback);
  const improvement = readTextField(parsed.body.improvement);
  const feedback = [detail, improvement ? `Melhoria: ${improvement}` : ""]
    .filter(Boolean)
    .join("\n\n");

  try {
    await db.insert(billingChurnSurveys).values({
      userId: ownerId,
      reason,
      ...(feedback ? { feedback } : {}),
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    // Registro de churn perdido é sinal para o dono (não é crítico para o
    // cliente — o fluxo de cancelamento segue no portal de qualquer forma).
    await alertOperations({
      title: "Pesquisa de churn falhou",
      detail: `owner ${ownerId} — motivo: ${error instanceof Error ? error.message : "unknown"}`,
      kind: "billing_churn_survey_failed",
    });
    safeLog("billing_churn_survey_failed", { reason: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json(
      {
        error: "survey_failed",
        message: "Não foi possível registrar sua resposta — você pode continuar com o cancelamento.",
      },
      { status: 500, headers: NO_STORE },
    );
  }
}
