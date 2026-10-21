import "server-only";

export interface OperationalReport {
  to: string;
  frequency: string;
  days: number;
  plays: number;
  conversions: number;
  conversionRate: number;
}

export async function sendOperationalReport(report: OperationalReport) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_EMAIL_FROM;
  if (!apiKey || !from) return { sent: false as const, reason: "email_provider_not_configured" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [report.to],
      subject: `Relatório ${report.frequency} - Prisma Player`,
      text: `Relatório dos últimos ${report.days} dias\n\nPlays: ${report.plays}\nConversões: ${report.conversions}\nTaxa de conversão: ${report.conversionRate.toFixed(1)}%\n\nAcesse o Prisma Player para analisar cada VSL.`,
      html: `<h1>Relatório ${report.frequency}</h1><p>Período: últimos ${report.days} dias.</p><ul><li><strong>Plays:</strong> ${report.plays}</li><li><strong>Conversões:</strong> ${report.conversions}</li><li><strong>Taxa de conversão:</strong> ${report.conversionRate.toFixed(1)}%</li></ul><p>Acesse o Prisma Player para analisar cada VSL.</p>`,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`email_provider_http_${response.status}`);
  return { sent: true as const };
}
