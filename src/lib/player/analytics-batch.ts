const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set(["heartbeat", "impression", "play", "progress", "complete", "cta_click", "conversion"]);
const MILESTONES = new Set([0, 10, 25, 50, 75, 90, 100]);
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MAX_BATCHED_EVENTS = 100;

function asEventRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? input as Record<string, unknown> : {};
}

export interface NormalizedAnalyticsEvent {
  eventType: string;
  progressPercent: number;
  watchedSeconds: number;
  transactionId: string | null;
  value: number | null;
  currency: string | null;
  advertisingConsent: boolean;
}

export interface NormalizedAnalyticsBatch {
  videoId: string;
  sessionId: string;
  events: NormalizedAnalyticsEvent[];
}

export type NormalizeResult =
  | { ok: true; batch: NormalizedAnalyticsBatch }
  | { ok: false; code: string; status: number };

function eventError(input: Record<string, unknown>): { code: string; status: number } | null {
  const eventType = String(input?.eventType ?? "");
  const progressPercent = Math.round(Number(input?.progressPercent ?? 0));
  const transactionId = typeof input?.transactionId === "string" ? input.transactionId.trim().slice(0, 120) : "";
  const value = Number(input?.value);
  const currency = typeof input?.currency === "string" ? input.currency.toUpperCase() : "";
  if (!EVENT_TYPES.has(eventType) || (eventType !== "heartbeat" && !MILESTONES.has(progressPercent)) || progressPercent < 0 || progressPercent > 100) return { code: "invalid_event", status: 400 };
  if (eventType === "conversion" && (!transactionId || !Number.isFinite(value) || value < 0 || value > 1_000_000_000 || !CURRENCY_PATTERN.test(currency))) return { code: "invalid_conversion", status: 400 };
  return null;
}

export function normalizeAnalyticsBatch(input: unknown): NormalizeResult {
  const body = asEventRecord(input);
  const videoId = String(body?.videoId ?? "");
  const sessionId = String(body?.sessionId ?? "");
  if (!UUID_PATTERN.test(videoId) || !UUID_PATTERN.test(sessionId)) return { ok: false, code: "invalid_event", status: 400 };

  const rawEvents = Array.isArray(body.events) ? body.events : [body];
  if (rawEvents.length === 0 || rawEvents.length > MAX_BATCHED_EVENTS) return { ok: false, code: "invalid_event", status: 400 };
  for (const event of rawEvents) {
    const error = eventError(asEventRecord(event));
    if (error) return { ok: false, ...error };
  }

  const events: NormalizedAnalyticsEvent[] = rawEvents.map((event) => {
    const source = asEventRecord(event);
    const eventType = String(source.eventType);
    const progressPercent = Math.round(Number(source.progressPercent ?? 0));
    const watchedSeconds = Math.max(0, Math.min(Number(source.watchedSeconds ?? 0) || 0, 86400));
    const transactionId = typeof source.transactionId === "string" ? source.transactionId.trim().slice(0, 120) : "";
    const value = Number(source.value);
    const currency = typeof source.currency === "string" ? source.currency.toUpperCase() : "";
    return {
      eventType,
      progressPercent,
      watchedSeconds,
      transactionId: eventType === "conversion" ? transactionId : null,
      value: eventType === "conversion" ? (Number.isFinite(value) ? value : null) : null,
      currency: eventType === "conversion" ? currency : null,
      advertisingConsent: source.advertisingConsent === true,
    };
  });

  return { ok: true, batch: { videoId, sessionId, events } };
}