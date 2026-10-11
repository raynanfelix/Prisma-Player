import "server-only";

/**
 * Lê uma variável de ambiente numérica sem os modos de falha silenciosa do
 * `Number(process.env.X ?? "padrao")`:
 *
 * - `Number("60_000")` é NaN — o separador numérico só existe em literais de
 *   código, não em strings. O valor viajava como `null` até o Postgres e a
 *   janela do rate limit virava 1 segundo em vez de 60.
 * - `Number("")` é 0, o que zeraria um limite em vez de usar o padrão.
 *
 * Underscores são tolerados na entrada porque a documentação antiga do
 * `.env.example` os sugeria e ambientes já provisionados podem tê-los.
 */
export function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim().replace(/_/g, "");
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn("invalid_numeric_env", { name, fallback });
    return fallback;
  }
  return parsed;
}
