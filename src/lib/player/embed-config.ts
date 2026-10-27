import "server-only";
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";

/**
 * Lookup de player publicado e de vídeo pronto, compartilhado pelas 4 portas
 * de embed (config, stream, manifest, capi) e pelo mint de sessão.
 *
 * DEDUP (D3 da revisão): findPublishedPlayerConfig existia em 4 cópias
 * idênticas, cada uma pagando 2 queries por request (busca por id de config E
 * por videoId, em paralelo).
 *
 * CACHE (P1-4 da auditoria de escala 2026-10-26): LRU por instância com TTL
 * de 10s - o stream responde a CADA range request do <video> (8-12 por
 * play) e refazia o lookup em todos. Trade-off deliberado, mesmo padrão do
 * access-cache.ts (paywall, 30s, aprovado pelo dono): publicar/despublicar/
 * editar config propaga para os embeds em no máximo 10s. O cache vale também
 * para o miss (null = player inexistente/não publicado): um 404 de embed
 * recém-publicado dura no máximo 10s. Erro de banco NÃO é cacheado - cada
 * porta mantém seu próprio tratamento (503 na config/stream, fail-open no
 * mint de sessão).
 */

const { playerConfigs, videos } = schema;

export type PlayerConfigRow = {
  id: string;
  videoId: string;
  userId: string;
  config: unknown;
  allowedDomains: string[];
  published: boolean;
};

export type EmbedVideoRow = {
  id: string;
  title: string;
  objectPath: string;
  mimeType: string;
  userId: string;
  status: string;
};

const PLAYER_CONFIG_FIELDS = {
  id: playerConfigs.id,
  videoId: playerConfigs.videoId,
  userId: playerConfigs.userId,
  config: playerConfigs.config,
  allowedDomains: playerConfigs.allowedDomains,
  published: playerConfigs.published,
};

const VIDEO_FIELDS = {
  id: videos.id,
  title: videos.title,
  objectPath: videos.objectPath,
  mimeType: videos.mimeType,
  userId: videos.userId,
  status: videos.status,
};

const TTL_MS = 10_000;
const MAX_ENTRIES = 10_000;

type CacheEntry<T> = { value: T; expiresAt: number };

function makeLru<T>() {
  const cache = new Map<string, CacheEntry<T>>();

  function get(key: string): T | undefined {
    const cached = cache.get(key);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) {
      cache.delete(key);
      return undefined;
    }
    // Map preserva ordem de inserção: delete + re-set move a chave para o
    // fim, tornando a chave mais antiga (início do Map) a vítima de eviction.
    cache.delete(key);
    cache.set(key, cached);
    return cached.value;
  }

  function set(key: string, value: T): void {
    cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
    if (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }

  return { get, set, clear: () => cache.clear() };
}

const configCache = makeLru<PlayerConfigRow | null>();
const videoCache = makeLru<EmbedVideoRow | null>();

/** Player publicado por id de config; cai para o id de vídeo (mesma busca dupla do SDK antigo). */
export async function findPublishedPlayerConfig(id: string): Promise<PlayerConfigRow | null> {
  const [byPlayerId, byVideoId] = await Promise.all([
    db.select(PLAYER_CONFIG_FIELDS).from(playerConfigs).where(and(eq(playerConfigs.id, id), eq(playerConfigs.published, true))).limit(1).then((rows) => rows[0] ?? null),
    db.select(PLAYER_CONFIG_FIELDS).from(playerConfigs).where(and(eq(playerConfigs.videoId, id), eq(playerConfigs.published, true))).limit(1).then((rows) => rows[0] ?? null),
  ]);
  return byPlayerId ?? byVideoId;
}

/** Versão com cache de 10s (TTL documentado acima) - a usada pelas portas de embed. */
export async function findPublishedPlayerConfigCached(id: string): Promise<PlayerConfigRow | null> {
  const cached = configCache.get(id);
  if (cached !== undefined) return cached;
  const value = await findPublishedPlayerConfig(id);
  configCache.set(id, value);
  return value;
}

/** Vídeo pronto (status ready) por id - superset dos campos que config e stream precisam. Erros propagam: cada porta mantém seu próprio tratamento. */
export async function findEmbedVideoCached(videoId: string): Promise<EmbedVideoRow | null> {
  const cached = videoCache.get(videoId);
  if (cached !== undefined) return cached;
  const [row] = await db
    .select(VIDEO_FIELDS)
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.status, "ready")))
    .limit(1);
  const value = row ?? null;
  videoCache.set(videoId, value);
  return value;
}

/**
 * @internal - isolamento entre casos de teste (mesmo contrato do
 * resetAccessCacheForTests). Em produção não há chamador.
 */
export function resetEmbedConfigCacheForTests(): void {
  configCache.clear();
  videoCache.clear();
}
