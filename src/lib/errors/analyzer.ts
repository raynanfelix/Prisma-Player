import "server-only";
import { alertOperations } from "@/lib/security/alert-webhook";
import type { SanitizedError } from "./sanitize";

/**
 * ErrorAnalyzer abstraction (Phase 4).
 * 
 * Defines the contract for AI-powered error analysis. The default implementation
 * uses heuristic rules only — no external API calls. When a DeepSeek R1 or other
 * LLM credential is configured, swap the implementation without changing callers.
 * 
 * Architecture: capture → sanitize → analyze → notify are fully decoupled.
 * Each step is fail-open and independently testable.
 */

export interface AnalysisResult {
  /** Confidence score 0-1 for the hypothesis */
  confidence: number;
  /** Root cause hypothesis in Portuguese */
  hypothesis: string;
  /** Suggested fix direction (not code) */
  suggestedFix: string;
  /** Whether this error likely requires immediate human attention */
  requiresImmediateAttention: boolean;
}

export interface ErrorAnalyzer {
  analyze(error: SanitizedError): Promise<AnalysisResult>;
}

/**
 * Heuristic-only analyzer. No external dependencies.
 * Produces deterministic results based on error characteristics.
 */
class HeuristicAnalyzer implements ErrorAnalyzer {
  async analyze(error: SanitizedError): Promise<AnalysisResult> {
    const msg = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() ?? "";

    // Timeout / network errors
    if (msg.includes("timeout") || msg.includes("etimedout") || msg.includes("econnrefused")) {
      return {
        confidence: 0.85,
        hypothesis: "Falha de conectividade com serviço externo ou latência elevada na rede.",
        suggestedFix: "Verificar health check do serviço dependente, aumentar timeout configurado ou adicionar retry com backoff exponencial.",
        requiresImmediateAttention: error.severity === "critical",
      };
    }

    // Auth / permission errors
    if (msg.includes("permission denied") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden")) {
      return {
        confidence: 0.9,
        hypothesis: "Falha de autorização: token expirado, permissão insuficiente ou política RLS bloqueando acesso.",
        suggestedFix: "Validar token/credenciais, verificar políticas RLS da tabela afetada e confirmar escopo do guard na rota.",
        requiresImmediateAttention: true,
      };
    }

    // Null reference / type errors
    if (msg.includes("null") || msg.includes("undefined") || msg.includes("cannot read propert") || msg.includes("is not a function")) {
      return {
        confidence: 0.8,
        hypothesis: "Referência nula ou tipo inesperado: dado ausente em resposta de API, campo opcional não tratado ou shape de dados alterado.",
        suggestedFix: "Adicionar validação de entrada/saída com schema (zod/drizzle), tratar campos opcionais explicitamente e verificar contrato da API externa.",
        requiresImmediateAttention: false,
      };
    }

    // JSON / parsing errors
    if (msg.includes("json") || msg.includes("parse") || msg.includes("syntax") || msg.includes("unexpected token")) {
      return {
        confidence: 0.85,
        hypothesis: "Dados malformados: JSON inválido na requisição/resposta ou formato inesperado de API externa.",
        suggestedFix: "Validar payload com schema antes de processar, adicionar try/catch específico para parse e logar amostra sanitizada do dado recebido.",
        requiresImmediateAttention: false,
      };
    }

    // Database / query errors
    if (msg.includes("relation") || msg.includes("column") || msg.includes("constraint") || msg.includes("deadlock") || stack.includes("drizzle") || stack.includes("pg")) {
      return {
        confidence: 0.75,
        hypothesis: "Erro de banco de dados: schema incompatível, constraint violada, deadlock ou query mal construída.",
        suggestedFix: "Verificar migration pendente, validar tipos Drizzle vs schema real, revisar cláusulas WHERE e adicionar índice se performance for causa.",
        requiresImmediateAttention: error.severity === "critical" || error.severity === "high",
      };
    }

    // Stripe / billing errors
    if (msg.includes("stripe") || msg.includes("billing") || msg.includes("checkout") || msg.includes("payment")) {
      return {
        confidence: 0.8,
        hypothesis: "Falha na integração de pagamentos: webhook não processado, customer state inconsistente ou preço não sincronizado.",
        suggestedFix: "Verificar logs de webhook, reconciliar estado do customer via Stripe Dashboard e confirmar que preços foram seedeados corretamente.",
        requiresImmediateAttention: true,
      };
    }

    // R2 / storage errors
    if (msg.includes("r2") || msg.includes("s3") || msg.includes("upload") || msg.includes("multipart") || msg.includes("bucket")) {
      return {
        confidence: 0.8,
        hypothesis: "Falha no armazenamento de objetos: bucket inacessível, credenciais expiradas ou multipart upload interrompido.",
        suggestedFix: "Verificar credenciais R2, confirmar existência do bucket, revisar lógica de retry para uploads grandes e checar limites de tamanho.",
        requiresImmediateAttention: error.severity === "critical",
      };
    }

    // Fallback
    return {
      confidence: 0.3,
      hypothesis: "Erro não classificado pelos heurísticos atuais. Requer investigação manual do código-fonte e reprodução do cenário.",
      suggestedFix: "Inspecionar arquivos suspeitos listados na Issue, reproduzir o erro localmente e consultar logs sanitizados no painel admin.",
      requiresImmediateAttention: error.severity === "critical",
    };
  }
}

// Singleton instance — swap implementation here when AI credential is available
const analyzer: ErrorAnalyzer = new HeuristicAnalyzer();

export function getAnalyzer(): ErrorAnalyzer {
  return analyzer;
}

/**
 * Notifies about critical errors via Telegram (alertOperations).
 * Fail-open: never throws, never blocks the calling route.
 * Only sends for critical/high severity to avoid notification fatigue.
 */
export async function notifyCriticalError(error: SanitizedError, fingerprint: string): Promise<void> {
  if (error.severity !== "critical" && error.severity !== "high") return;
  
  try {
    const analysis = await analyzer.analyze(error);
    await alertOperations({
      title: `[${error.severity.toUpperCase()}] ${error.message.slice(0, 60)}`,
      detail: `${analysis.hypothesis} | Fingerprint: ${fingerprint} | Rota: ${error.route ?? "desconhecida"} | Ocorrências: ver painel /admin/errors`,
      kind: "error-capture-system",
    });
  } catch {
    // Fail-open: notification failure must never break error capture
  }
}