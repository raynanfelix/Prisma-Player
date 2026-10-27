import "server-only";

import { getMonthPlaysUsed } from "@/lib/access/service";

/**
 * Cache de plays do mês para o INGEST de analytics (P0-2 da auditoria de
 * escala 2026-10-26, docs/reports/API_AUDIT_SCALE_2026-10-26.md).
 *
 * O COUNT(DISTINCT session_id) de getMonthPlaysUsed varre o índice de TODOS
 * os eventos play do mês do titular. O ingest rodava essa contagem em CADA
 * lote de heartbeat (a cada 75s por sessão ativa): no patamar de milhões de
 * plays/dia, com dezenas de milhares de sessões simultâneas, isso é a query
 * mais cara do sistema - e ela fica mais cara a cada dia do mês que passa.
 *
 * O valor alimenta APENAS os headers de observabilidade de overage
 * (x-plays-used / x-plays-limit / x-plays-overage) devolvidos no 204 do
 * ingest. Nenhum evento legítimo é negado por ele, então 60 segundos de
 * staleness são imateriais. O dashboard da conta (/api/account/overview)
 * continua lendo o valor fresco pela rota própria, sem este cache.
 *
 * Padrão do access-cache.ts (LRU por ordem de inserção do Map), mesmo
 * trade-off aprovado pelo dono para o paywall (30s lá, 60s aqui).
 */
const TTL_MS = 60_000;
const MAX_ENTRIES = 5_000;

type CacheEntry = { value: number; expiresAt: number };

const cache = new Map<string, CacheEntry>();

function touch(key: string, entry: CacheEntry): void {
  // Map preserva ordem de inserção: delete + re-set move a chave para o
  // fim, tornando a chave mais antiga (início do Map) a vítima de eviction.
  cache.delete(key);
  cache.set(key, entry);
}

export async function getMonthPlaysUsedCached(userId: string): Promise<number> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    touch(userId, cached);
    return cached.value;
  }
  if (cached) cache.delete(userId);

  const value = await getMonthPlaysUsed(userId);
  touch(userId, { value, expiresAt: Date.now() + TTL_MS });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return value;
}

/**
 * @internal - isolamento entre casos de teste (mesmo contrato do
 * resetAccessCacheForTests). Em produção não há chamador.
 */
export function resetQuotaCacheForTests(): void {
  cache.clear();
}
