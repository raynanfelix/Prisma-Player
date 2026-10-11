import "server-only";

/** Tipos de asset que o estúdio sabe enviar e o player sabe exibir. */
export const PLAYER_ASSET_KINDS = ["thumbnailStart", "thumbnailPause", "thumbnailEnd", "headlineDesktop", "headlineMobile", "captions"] as const;

const ALLOWED_KINDS = new Set<string>(PLAYER_ASSET_KINDS);

/**
 * Mantém apenas assets que pertencem de fato ao titular da conta.
 *
 * `player_configs.config` é um jsonb livre gravado pelo próprio usuário. Sem
 * este filtro, bastava apontar `config.assets` para o caminho de outro tenante
 * e abrir o próprio embed para receber uma URL assinada do arquivo alheio — o
 * endpoint de embed assinava qualquer string que encontrasse ali.
 */
export function ownedAssetPaths(rawAssets: unknown, ownerId: string): Record<string, string> {
  if (!rawAssets || typeof rawAssets !== "object" || Array.isArray(rawAssets)) return {};
  const prefix = `${ownerId}/`;
  const result: Record<string, string> = {};
  for (const [kind, value] of Object.entries(rawAssets as Record<string, unknown>)) {
    if (!ALLOWED_KINDS.has(kind)) continue;
    if (typeof value !== "string") continue;
    let path = value.trim();
    if (!path || path.length > 256) continue;
    // Canonicaliza antes de autorizar: %2e%2e, %2f e unicode poderiam passar
    // pelo startsWith e serem resolvidos como traversal no storage.
    try {
      let prev = "";
      let decoded = path;
      for (let i = 0; i < 3 && decoded !== prev; i++) {
        prev = decoded;
        decoded = decodeURIComponent(decoded);
      }
      path = decoded;
    } catch {
      continue;
    }
    path = path.normalize("NFC");
    if (!path || path.length > 256 || path.includes("..") || path.includes("\\") || path.includes("%") || path.includes("\0") || /[\u0000-\u001f\u007f]/.test(path) || !path.startsWith(prefix)) continue;
    if (path !== value.trim()) continue;
    result[kind] = path;
  }
  return result;
}
