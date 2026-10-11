import "server-only";
/**
 * Helper para invalidar o cache de manifest na Cloudflare (borda)
 * quando um player_config é atualizado.
 *
 * Fase 1 do System Design Scale — Seção 6 (tag de cache) do
 * docs/SYSTEM_DESIGN_SCALE.md.
 *
 * Variáveis de ambiente necessárias:
 *   CLOUDFLARE_PURGE_URL          -> ex. https://prisma-embed-cache.<account>.workers.dev/__purge
 *   CLOUDFLARE_PURGE_SECRET       -> mesmo que SHARED_PURGE_SECRET no Worker
 *
 * Se as variáveis não estiverem configuradas, a chamada é no-op (fail-safe):
 * o cache expira naturalmente em 30s. Atualizar a config é raro comparado
 * ao volume de leitura, então o tolerável aceitável é alto.
 */
export async function purgeEmbedManifest(playerId: string): Promise<void> {
  const url = process.env.CLOUDFLARE_PURGE_URL;
  const secret = process.env.CLOUDFLARE_PURGE_SECRET;
  if (!url || !secret) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ playerIds: [playerId] }),
      // No-store evita que a Vercel cacheie a propria chamada de purge.
      cache: "no-store",
    });
  } catch (error) {
    console.error("embed manifest purge failed", { playerId, error: String(error) });
  }
}
