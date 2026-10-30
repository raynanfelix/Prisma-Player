import "server-only";

import { db, schema } from "@/lib/db";
import { captureServerError } from "@/lib/errors/capture-server";

const { adminAuditLog } = schema;

export const CASE_STATUSES = ["aberto", "em_andamento", "aguardando_cliente", "resolvido"] as const;
export const CASE_PRIORITIES = ["baixa", "normal", "alta", "urgente"] as const;
export const CASE_CATEGORIES = ["geral", "cobranca", "tecnico", "conta", "reembolso", "outro"] as const;

export type SupportCaseInput = { userId?: string | null; subject: string; category: string; priority: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validação pura (testável) - o banco reforça com checks. */
export function validateCaseInput(input: SupportCaseInput): string | null {
  const subject = input.subject.trim().replace(/\s+/g, " ");
  if (subject.length < 3 || subject.length > 140) return "invalid_subject";
  if (!CASE_CATEGORIES.includes(input.category as (typeof CASE_CATEGORIES)[number])) return "invalid_category";
  if (!CASE_PRIORITIES.includes(input.priority as (typeof CASE_PRIORITIES)[number])) return "invalid_priority";
  if (input.userId != null && input.userId !== "" && !uuid.test(input.userId)) return "invalid_user";
  return null;
}

export function validateNoteBody(body: string): string | null {
  const text = body.trim();
  if (text.length < 1 || text.length > 2000) return "invalid_note";
  return null;
}

/**
 * Auditoria admin: telemetria best-effort, NUNCA derruba a mutação que já
 * commitou. O CHECK `admin_audit_log_action_check` (migration 0000, estendido
 * em 0007) rejeita actions não catalogadas e o insert lança — sem este
 * fail-open, o audit quebrado devolvia 400/500 para mutações JÁ aplicadas no
 * banco (bug real do roadmap: task movida com sucesso, resposta 400).
 */
export async function audit(adminId: string, action: string, targetUserId: string | null, details: Record<string, unknown> = {}) {
  try {
    await db.insert(adminAuditLog).values({ adminUserId: adminId, action, targetUserId, details });
  } catch (error) {
    console.error("admin_audit_failed", {
      action,
      adminId,
      reason: error instanceof Error ? error.message : "unknown",
    });
    // Alimenta o próprio sistema de captura de erros (dogfooding).
    await captureServerError({ error, component: "admin/audit", severity: "medium" }).catch(() => undefined);
  }
}
