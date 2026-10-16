import "server-only";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

export interface WebhookEvent {
  id: string;
  event: string;
  timestamp: string;
  data: Record<string, string | number | boolean | null>;
}
export function blockedIp(address: string) {
  const raw = address.toLowerCase().trim().replace(/^\[|\]$/g, "").split("%")[0];
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) roteia para IPv4 — valida como IPv4.
  const mapped = raw.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  if (isIP(raw) === 6) return isBlockedIpv6(raw);
  if (isIP(raw) === 4) return isBlockedIpv4(raw);
  return false;
}

function isBlockedIpv4(ip: string): boolean {
  if (!ip.includes(".")) return false;
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && b >= 18 && b <= 31) || (a === 198 && b === 51) || (a === 203 && b === 0);
}

function isBlockedIpv6(ip: string): boolean {
  if (ip === "::1" || ip === "::") return true;
  const first = ip.split(":")[0] ?? "";
  const head = first.padStart(4, "0").toLowerCase();
  // Multicast ff00::/8
  if (head.startsWith("ff")) return true;
  // Link-local fe80::/10 → fe80..febf
  if (/^fe[89ab][0-9a-f]/i.test(head)) return true;
  // Unique-local fc00::/7 → fc..fd
  if (head.startsWith("fc") || head.startsWith("fd")) return true;
  // Documentação, benchmarking, NAT64, discard — nunca destino legítimo de webhook.
  if (head === "2001" && (ip.startsWith("2001:db8") || ip.startsWith("2001:db8:"))) return true;
  if (ip.startsWith("64:ff9b")) return true;
  if (ip === "100::" || ip.startsWith("100::")) return true;
  return false;
}

export async function validateWebhookUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("invalid_webhook_url"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("invalid_webhook_url");
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => blockedIp(address))) throw new Error("private_webhook_target");
  return url;
}

async function resolveSafeTarget(value: string) {
  const url = await validateWebhookUrl(value);
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname, family: isIP(url.hostname) }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  const target = addresses[0];
  if (!target || blockedIp(target.address)) throw new Error("private_webhook_target");
  return { url, address: target.address, family: target.family as 4 | 6 };
}

/**
 * Envia para o mesmo IP que acabou de ser validado. `fetch()` resolveria o DNS
 * novamente e abriria uma janela para DNS rebinding contra a rede privada.
 */
function postPinnedJson(target: Awaited<ReturnType<typeof resolveSafeTarget>>, body: string) {
  return new Promise<number>((resolve, reject) => {
    const request = httpsRequest({
      protocol: "https:",
      hostname: target.url.hostname,
      servername: target.url.hostname,
      port: 443,
      path: `${target.url.pathname}${target.url.search}`,
      method: "POST",
      headers: {
        host: target.url.host,
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "user-agent": "Prisma-Player-Webhooks/2.0",
      },
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
      timeout: 8000,
    }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode ?? 0));
    });
    request.once("timeout", () => request.destroy(new Error("webhook_timeout")));
    request.once("error", reject);
    request.end(body);
  });
}

const eventLabels: Record<string, { title: string; description: string; color: number }> = {
  "prisma.webhook.test": { title: "Conexão confirmada", description: "A Prisma conseguiu enviar notificações para este canal. Está tudo pronto para acompanhar sua operação por aqui.", color: 0x22c55e },
  conversion_drop: { title: "A conversão desta VSL caiu", description: "A Prisma comparou os dois últimos períodos e encontrou uma mudança que merece sua atenção.", color: 0xef4444 },
  impression: { title: "Nova visualização", description: "Uma pessoa encontrou sua VSL e carregou o player.", color: 0x3b82f6 },
  play: { title: "Novo play", description: "Uma pessoa começou a assistir à sua VSL.", color: 0x0066cc },
  progress: { title: "Atenção avançando", description: "Uma pessoa alcançou um novo ponto importante do vídeo.", color: 0x8b5cf6 },
  complete: { title: "VSL concluída", description: "Uma pessoa chegou ao final do vídeo.", color: 0x14b8a6 },
  cta_click: { title: "Clique no botão de ação", description: "Uma pessoa assistiu à oferta e clicou no seu CTA.", color: 0xf59e0b },
  conversion: { title: "Nova conversão", description: "Uma conversão foi atribuída a esta VSL.", color: 0x22c55e },
};

function text(value: unknown, fallback = "Não informado") {
  const result = String(value ?? "").trim();
  return (result || fallback).slice(0, 1024);
}

function percent(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "Não informado";
}

function deviceLabel(value: unknown) {
  const normalized = String(value ?? "").toLowerCase();
  return ({ mobile: "Celular", desktop: "Computador", tablet: "Tablet", other: "Outro" } as Record<string, string>)[normalized] ?? text(value);
}

function discordPayload(event: WebhookEvent) {
  const eventName = event.event.replace(/^vsl\./, "");
  const presentation = eventLabels[eventName] ?? { title: "Nova atividade na sua VSL", description: "A Prisma registrou uma nova interação no player.", color: 0x0066cc };
  const data = event.data;
  const fields = eventName === "conversion_drop"
    ? [
        { name: "VSL", value: text(data.video_title, "VSL sem título"), inline: false },
        { name: "Taxa anterior", value: percent(data.previous_rate), inline: true },
        { name: "Taxa atual", value: percent(data.current_rate), inline: true },
        { name: "Queda identificada", value: percent(data.drop_percent), inline: true },
        ...(data.previous_plays != null || data.current_plays != null ? [{ name: "Plays comparados", value: `${text(data.previous_plays, "0")} antes → ${text(data.current_plays, "0")} agora`, inline: false }] : []),
        { name: "Próximo passo", value: "Abra o Analytics da VSL, confira onde a retenção mudou e evite alterar várias coisas ao mesmo tempo.", inline: false },
      ]
    : [
        ...(data.video_title ? [{ name: "VSL", value: text(data.video_title), inline: false }] : []),
        ...(data.progress_percent != null ? [{ name: "Ponto alcançado", value: percent(data.progress_percent), inline: true }] : []),
        ...(data.country_code ? [{ name: "Localização", value: text(data.country_code), inline: true }] : []),
        ...(data.device_type ? [{ name: "Dispositivo", value: deviceLabel(data.device_type), inline: true }] : []),
        ...(eventName === "prisma.webhook.test" ? [{ name: "O que acontece agora", value: "Quando uma atividade selecionada ocorrer, você receberá uma mensagem clara como esta.", inline: false }] : []),
      ];
  return {
    username: "Prisma Player",
    allowed_mentions: { parse: [] },
    embeds: [{
      author: { name: "Prisma Player · Inteligência" },
      title: presentation.title,
      description: presentation.description,
      color: presentation.color,
      fields,
      footer: { text: eventName === "prisma.webhook.test" ? "Mensagem de teste" : "Atualização automática da sua operação" },
      timestamp: event.timestamp,
    }],
  };
}

export async function deliverWebhook(value: string, event: WebhookEvent) {
  const target = await resolveSafeTarget(value);
  const { url } = target;
  const isDiscord = /(^|\.)discord(app)?\.com$/i.test(url.hostname) && url.pathname.includes("/api/webhooks/");
  const status = await postPinnedJson(target, JSON.stringify(isDiscord ? discordPayload(event) : event));
  if (status < 200 || status >= 300) throw new Error(`webhook_http_${status}`);
  return { status, provider: isDiscord ? "discord" : "generic" };
}
