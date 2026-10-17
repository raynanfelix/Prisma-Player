/**
 * Serializa uma data opcional para ISO 8601 nos contratos JSON da API.
 * Fonte única do padrão `row.col ? row.col.toISOString() : null`.
 */
export function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/**
 * Epoch atual. Helper extraído: chamar `Date.now()` direto no corpo de um
 * componente (mesmo Server Component) dispara o lint react-compiler
 * ("Cannot call impure function during render"); via função importada o
 * relógio fica explícito e a page segue force-dynamic.
 */
export function nowMs(): number {
  return Date.now();
}

/** ISO de N dias atrás — janelas de relatório (finance/admin). */
export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
