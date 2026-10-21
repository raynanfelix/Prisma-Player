import "server-only";

import { getAccountAccess, type AccountAccess } from "@/lib/access/service";

// TRADE-OF APROVADO PELO DONO DO PRODUTO: este cache serve o resultado de
// getAccountAccess por até 30s. Assinatura cancelada (ou trial expirado no
// limite) continua servindo acesso dentro dessa janela - aceito em produto
// porque o webhook de cancelamento não consegue alcançar instâncias
// serverless para invalidar cache em memória, e a janela é curta o bastante
// para não ser um vetor de burla relevante. O cache vale SEMPRE (também fora
// de produção): os testes fazem vi.mock do service, não deste módulo.
const TTL_MS = 30_000;
const MAX_ENTRIES = 10_000;

type CacheEntry = { value: AccountAccess; expiresAt: number };

const cache = new Map<string, CacheEntry>();

function touch(key: string, entry: CacheEntry): void {
  // Map preserva ordem de inserção: delete + re-set move a chave para o fim,
  // tornando a chave mais antiga (início do Map) a vítima de eviction - LRU.
  cache.delete(key);
  cache.set(key, entry);
}

export async function getAccountAccessCached(userId: string): Promise<AccountAccess> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    touch(userId, cached);
    return cached.value;
  }
  if (cached) cache.delete(userId);

  const value = await getAccountAccess(userId);
  touch(userId, { value, expiresAt: Date.now() + TTL_MS });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return value;
}

/**
 * @internal - usado apenas por suítes de teste para isolar o cache entre
 * casos (o mock do service muta o retorno por teste; sem isto, o valor do
 * primeiro caso vaza para os demais dentro da janela de 30s). Em produção
 * não há chamador: o webhook de cancelamento não alcança instâncias
 * serverless, e a janela de 30s é o trade-off aprovado.
 */
export function resetAccessCacheForTests(): void {
  cache.clear();
}
