import "server-only";
import { createHash } from "node:crypto";

/**
 * Chave server-side do teto de streams simultâneos (M9): hash de (vídeo, IP).
 *
 * O viewerId declarado pelo player é rotável pelo cliente e zerava o contador
 * a cada troca de identidade. A chave derivada no servidor torna a rotação
 * inócua: o campo viewer_id de video_live_sessions passa a guardar essa chave
 * (sem migration: nenhum leitor de analytics seleciona viewer_id). Embeds
 * legítimos atrás do mesmo NAT compartilham o teto do vídeo, que continua
 * configurado pelo dono do player.
 *
 * A derivação do IP usa o MESMO par de headers confiáveis da ingestão
 * (x-vercel-forwarded-for | x-real-ip, sobrescritos pela plataforma) para que
 * o embed e os heartbeats gravem a MESMA chave para a mesma sessão. Sem IP
 * legível a chave volta vazia e o chamador degrada para o viewer declarado.
 */
export function streamIpFromHeaders(headers: Headers): string {
  const chain = headers.get("x-vercel-forwarded-for") ?? "";
  const first = chain.split(",")[0]?.trim() ?? "";
  if (first) return first;
  return headers.get("x-real-ip")?.trim() ?? "";
}

export function streamKeyForIp(videoId: string, ip: string): string {
  const normalized = ip.trim();
  if (!normalized) return "";
  return createHash("sha256").update(`${videoId}:${normalized}`).digest("hex").slice(0, 32);
}

export function streamKeyFromHeaders(videoId: string, headers: Headers): string {
  return streamKeyForIp(videoId, streamIpFromHeaders(headers));
}
