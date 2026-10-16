/**
 * Serializa uma data opcional para ISO 8601 nos contratos JSON da API.
 * Fonte única do padrão `row.col ? row.col.toISOString() : null`.
 */
export function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
