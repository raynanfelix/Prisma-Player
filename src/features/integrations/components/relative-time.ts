/**
 * Tempo relativo curto em PT-BR para o badge "Verificada"
 * ("agora", "há 5min", "há 2h", "há 3d", "12/03").
 */
export function shortRelativeTime(iso: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const diffMs = now - time;
  if (diffMs < 60_000) return "agora";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `há ${days}d`;
  return new Date(time).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
