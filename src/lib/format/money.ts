const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Formata centavos como moeda BRL com 2 decimais (ex.: 19700 → "R$ 197,00").
 * Fonte única do formato monetário do painel; as variantes de plano
 * (millicents com 3 decimais, valor inteiro) ficam em lib/billing/catalog.ts.
 */
export function formatBrlFromCents(cents: number): string {
  return brlFormatter.format(cents / 100);
}
