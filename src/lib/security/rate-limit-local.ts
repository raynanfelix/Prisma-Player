import "server-only";

import { clientIpFromRequest, limitedResponse } from "@/lib/security/rate-limit-shared";

/**
 * Rate limit por INSTÂNCIA (memória do processo) para os escopos PÚBLICOS de
 * embed: config, session-mint, stream e ingest de analytics (P0-1 da
 * auditoria de escala 2026-10-26).
 *
 * Por que existe: o limitador de banco (rate-limit.ts) grava UMA linha de
 * `rate_limits` a cada check. No hot path do embed isso multiplica pelos
 * range requests do `<video>` (8-12 por play) e pelos heartbeats - no
 * patamar de milhões de plays/dia eram dezenas de milhões de writes/dia
 * só para contar limites: o mecanismo anti-abuso era o maior gerador de
 * carga do banco.
 *
 * TRADE-OFF DELIBERADO (security skill: in-memory counters become
 * max × instances on serverless): o teto real em multi-instância é
 * aproximadamente `max × N instâncias`. Aceito APENAS aqui porque:
 * 1. Estes escopos já têm defesa em camadas independente do contador
 *    (originToken assinado + cookie de render + UA + sessionToken +
 *    eventToken amarrado à sessão) - o limitador é anti-rajada, não a
 *    barreira principal;
 * 2. O limitador de banco é fail-OPEN: exatamente sob ataque (banco
 *    estressado) ele parava de contar de qualquer forma;
 * 3. Os tetos são generosos (300/min por IP+player; 600/min/IP no
 *    agregado M5) - legítimos ficam ordens de magnitude abaixo.
 *
 * Rotas autenticadas (guard, login, checkout, admin) continuam no
 * limitador de banco, onde o volume é 1000× menor e a precisão importa.
 *
 * ALVO EVOLUTIVO: shared store (Upstash Redis, skill `upstash`) quando o
 * dono provisionar as envs - a troca é uma linha por call site.
 */

type LocalRateLimitOptions = { max: number; windowMs: number; identifier?: string };

const MAX_ENTRIES = 50_000;

type Bucket = { count: number; expiresAt: number };

const buckets = new Map<string, Bucket>();

function prune(): void {
  if (buckets.size <= MAX_ENTRIES) return;
  const now = Date.now();
  // Primeiro vencidos (limpeza barata e completa), depois os mais antigos
  // pela ordem de inserção do Map (mesma vítima LRU do access-cache).
  for (const [key, bucket] of buckets) {
    if (bucket.expiresAt <= now) buckets.delete(key);
  }
  while (buckets.size > MAX_ENTRIES) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) return;
    buckets.delete(oldest);
  }
}

/**
 * Mesma semântica de janela fixa do limitador de banco: o primeiro hit abre
 * a janela, os seguintes incrementam até ela expirar. Nunca lança (memória
 * não fica "indisponível"), por isso não existe caminho fail-closed.
 */
export async function localRateLimit(request: Request, scope: string, options: LocalRateLimitOptions): Promise<Response | null> {
  const windowMs = Number.isFinite(options.windowMs) && options.windowMs > 0 ? Math.round(options.windowMs) : 60_000;
  const key = `${scope}:${options.identifier ?? clientIpFromRequest(request)}`;
  const now = Date.now();

  const bucket = buckets.get(key);
  if (!bucket || bucket.expiresAt <= now) {
    buckets.set(key, { count: 1, expiresAt: now + windowMs });
    prune();
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= options.max) return null;

  const resetEpochSeconds = Math.ceil(bucket.expiresAt / 1000);
  const retryAfter = Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000));
  return limitedResponse(options.max, retryAfter, resetEpochSeconds);
}

/**
 * @internal - isolamento entre casos de teste (mesmo contrato do
 * resetAccessCacheForTests). Em produção não há chamador.
 */
export function resetLocalRateLimitForTests(): void {
  buckets.clear();
}
