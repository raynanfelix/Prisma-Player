import "server-only";

/**
 * Alerta operacional (hardening item 5 - fim do A09 silencioso): um único
 * canal dono-privado (Discord/Telegram via relay/qualquer HTTPS que aceita
 * JSON) para as falhas que antes só existiam no log do servidor.
 *
 * Contrato:
 * - `ALERT_WEBHOOK_URL` ausente → inerte (nenhuma chamada, nenhum erro);
 * - fire-and-forget de verdade: erro/timeout NUNCA sobe para a rota -
 *   cada chamador está num caminho de erro crítico (webhook Stripe, billing,
 *   risk) e a resposta original é o que importa;
 * - REDACT: o texto nunca carrega token/segredo - os shapes comuns são
 *   mascarados antes do POST, além de os chamadores só comporem ids/labels.
 */

const ALERT_TIMEOUT_MS = 3_000;
const MAX_FIELD_CHARS = 300;

export type OperationsAlert = {
  title: string;
  detail: string;
  kind?: string;
};

// Shapes de segredo que podem aparecer num reason/texto composto: tokens do
// Meta (EAA…), tokens de bot do Telegram (id:secret), Bearer, chaves Stripe.
const SECRET_SHAPES =
  /(whsec_[A-Za-z0-9]+|sk_(?:live|test)_[A-Za-z0-9]+|rk_(?:live|test)_[A-Za-z0-9]+|Bearer\s+[A-Za-z0-9._-]{8,}|EAA[A-Za-z0-9]{16,}|\d{6,12}:[A-Za-z0-9_-]{30,})/g;

/** REDACT + teto de tamanho: nada sensível (ou gigante) sai no alerta. */
function redact(value: string): string {
  return value.replace(SECRET_SHAPES, "[redacted]").slice(0, MAX_FIELD_CHARS);
}

export async function alertOperations({ title, detail, kind }: OperationsAlert): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL?.trim();
  // Sem webhook configurado (ou URL que não é HTTPS): inerte, sem throw.
  if (!url || !/^https:\/\//i.test(url)) return;
  try {
    const content = `🚨 [Prisma] ${redact(title)} - ${redact(detail)}${kind ? ` (${redact(kind)})` : ""}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
      cache: "no-store",
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });
    // Drena o corpo para liberar o socket (o status do canal não é nossa falha).
    await response.arrayBuffer().catch(() => undefined);
  } catch {
    // Silencioso por contrato: o alerta nunca derruba a resposta da rota.
  }
}
