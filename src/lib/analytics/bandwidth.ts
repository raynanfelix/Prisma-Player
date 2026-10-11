import { BANDWIDTH } from "@/lib/constants";

export type BandwidthEvent = { created_at: string; egressBytes: number };
export type BandwidthSeries = Array<{ date: string; egressBytes: number }>;

export type BandwidthRawEvent = {
  videoId: string;
  sessionId: string;
  eventType: string;
  watchedSeconds: number;
  createdAt: string;
};

export type BandwidthSession = {
  videoId: string;
  sessionId: string;
  watchedSeconds: number;
  date: string;
};

export type BandwidthVideoMeta = {
  id: string;
  sizeBytes: number;
  durationSeconds: number;
};

function safeWatchedSeconds(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function estimateEgressBytes(input: {
  plays: number;
  sizeBytes: number;
  watchedSeconds: number;
  durationSeconds: number;
}): number {
  const watchedSeconds = safeWatchedSeconds(input.watchedSeconds);
  const fraction = input.durationSeconds > 0 ? Math.min(1, watchedSeconds / input.durationSeconds) : 1;
  return input.plays * input.sizeBytes * fraction;
}

export function aggregateWatchedBySession(events: BandwidthRawEvent[]): BandwidthSession[] {
  const byKey = new Map<string, BandwidthSession>();
  for (const event of events) {
    const key = `${event.videoId}\u0000${event.sessionId}`;
    const watchedSeconds = safeWatchedSeconds(event.watchedSeconds);
    const current = byKey.get(key);
    const date = event.createdAt.slice(0, 10);
    if (current && watchedSeconds > current.watchedSeconds) {
      current.watchedSeconds = watchedSeconds;
      current.date = date;
    } else if (!current) {
      byKey.set(key, { videoId: event.videoId, sessionId: event.sessionId, watchedSeconds, date });
    }
  }
  return [...byKey.values()];
}

export function estimateEgressFromSessions(input: {
  sessions: BandwidthSession[];
  videos: BandwidthVideoMeta[];
}): number {
  const byId = new Map<string, BandwidthVideoMeta>();
  for (const video of input.videos) byId.set(video.id, video);
  let total = 0;
  for (const session of input.sessions) {
    const video = byId.get(session.videoId);
    if (!video) continue;
    total += estimateEgressBytes({
      plays: 1,
      sizeBytes: video.sizeBytes,
      watchedSeconds: session.watchedSeconds,
      durationSeconds: video.durationSeconds,
    });
  }
  return total;
}

export function summarizeSessionsByDay(input: {
  sessions: BandwidthSession[];
  videos: BandwidthVideoMeta[];
  fromDate?: string;
  toDate?: string;
}): BandwidthSeries {
  const byId = new Map<string, BandwidthVideoMeta>();
  for (const video of input.videos) byId.set(video.id, video);
  const egressByDay = new Map<string, number>();
  for (const session of input.sessions) {
    if (!session.date) continue;
    const video = byId.get(session.videoId);
    if (!video) continue;
    const egressBytes = estimateEgressBytes({
      plays: 1,
      sizeBytes: video.sizeBytes,
      watchedSeconds: session.watchedSeconds,
      durationSeconds: video.durationSeconds,
    });
    if (egressBytes > 0) egressByDay.set(session.date, (egressByDay.get(session.date) ?? 0) + egressBytes);
  }
  return toSeries(egressByDay, input.fromDate, input.toDate);
}

export function summarizeBandwidthByDay(events: BandwidthEvent[], options?: { fromDate?: string; toDate?: string }): BandwidthSeries {
  const egressByDay = new Map<string, number>();
  for (const event of events) {
    const day = event.created_at.slice(0, 10);
    egressByDay.set(day, (egressByDay.get(day) ?? 0) + event.egressBytes);
  }
  return toSeries(egressByDay, options?.fromDate, options?.toDate);
}

function toSeries(egressByDay: Map<string, number>, fromDate?: string, toDate?: string): BandwidthSeries {
  const days = [...egressByDay.entries()]
    .map(([date, egressBytes]) => ({ date, egressBytes }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!fromDate || !toDate || fromDate > toDate) return days;
  const start = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return days;
  const byDay = new Map(days.map((day) => [day.date, day.egressBytes]));
  const series: BandwidthSeries = [];
  const cursor = new Date(start);
  while (cursor <= end && series.length <= BANDWIDTH.MAX_SERIES_DAYS) {
    const date = cursor.toISOString().slice(0, 10);
    series.push({ date, egressBytes: byDay.get(date) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return series;
}

export function bandwidthCostCents(egressBytes: number, centsPerGb: number, bytesPerGb: number = BANDWIDTH.BYTES_PER_GB): number {
  return Math.ceil((egressBytes / bytesPerGb) * centsPerGb);
}

export function trendPercentage(series: BandwidthSeries, windowDays: number = BANDWIDTH.TREND_WINDOW_DAYS): number | null {
  if (!Number.isInteger(windowDays) || windowDays < 1 || series.length < windowDays * 2) return null;
  const sorted = [...series].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const window = sorted.slice(-windowDays * 2);
  const previous = window.slice(0, windowDays).reduce((total, item) => total + item.egressBytes, 0);
  const current = window.slice(windowDays).reduce((total, item) => total + item.egressBytes, 0);
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}