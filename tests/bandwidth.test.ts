import { describe, expect, it } from "vitest";
import {
  aggregateWatchedBySession,
  bandwidthCostCents,
  estimateEgressBytes,
  estimateEgressFromSessions,
  summarizeBandwidthByDay,
  summarizeSessionsByDay,
  trendPercentage,
} from "@/lib/analytics/bandwidth";

describe("estimateEgressBytes", () => {
  it("computes plays x size x watched fraction", () => {
    expect(estimateEgressBytes({ plays: 10, sizeBytes: 1000, watchedSeconds: 5, durationSeconds: 10 })).toBe(5000);
  });

  it("clamps fraction at 1 when watched exceeds duration", () => {
    expect(estimateEgressBytes({ plays: 10, sizeBytes: 1000, watchedSeconds: 20, durationSeconds: 10 })).toBe(10000);
  });

  it("clamps negative watchedSeconds to 0", () => {
    expect(estimateEgressBytes({ plays: 10, sizeBytes: 1000, watchedSeconds: -5, durationSeconds: 10 })).toBe(0);
  });

  it("falls back to full fraction when duration is 0", () => {
    expect(estimateEgressBytes({ plays: 10, sizeBytes: 1000, watchedSeconds: 3, durationSeconds: 0 })).toBe(10000);
  });

  it("returns 0 when there are no plays", () => {
    expect(estimateEgressBytes({ plays: 0, sizeBytes: 1000, watchedSeconds: 5, durationSeconds: 10 })).toBe(0);
  });
});

describe("aggregateWatchedBySession", () => {
  it("keeps the max watched_seconds per (video, session) across event types", () => {
    const result = aggregateWatchedBySession([
      { videoId: "v1", sessionId: "s1", eventType: "play", watchedSeconds: 0, createdAt: "2026-08-01T10:00:00.000Z" },
      { videoId: "v1", sessionId: "s1", eventType: "progress", watchedSeconds: 40, createdAt: "2026-08-02T10:00:00.000Z" },
      { videoId: "v1", sessionId: "s1", eventType: "complete", watchedSeconds: 120, createdAt: "2026-08-03T10:00:00.000Z" },
    ]);
    expect(result).toEqual([{ videoId: "v1", sessionId: "s1", watchedSeconds: 120, date: "2026-08-03" }]);
  });

  it("keeps the date of the event carrying the max watched_seconds", () => {
    const result = aggregateWatchedBySession([
      { videoId: "v1", sessionId: "s1", eventType: "play", watchedSeconds: 0, createdAt: "2026-08-01T10:00:00.000Z" },
      { videoId: "v1", sessionId: "s1", eventType: "progress", watchedSeconds: 90, createdAt: "2026-08-02T10:00:00.000Z" },
    ]);
    expect(result[0]?.date).toBe("2026-08-02");
  });

  it("keeps the first occurrence when a later event ties the max", () => {
    const result = aggregateWatchedBySession([
      { videoId: "v1", sessionId: "s1", eventType: "progress", watchedSeconds: 90, createdAt: "2026-08-02T10:00:00.000Z" },
      { videoId: "v1", sessionId: "s1", eventType: "progress", watchedSeconds: 90, createdAt: "2026-08-05T10:00:00.000Z" },
    ]);
    expect(result[0]?.date).toBe("2026-08-02");
  });

  it("separates distinct sessions of the same video", () => {
    const result = aggregateWatchedBySession([
      { videoId: "v1", sessionId: "s1", eventType: "progress", watchedSeconds: 40, createdAt: "2026-08-02T10:00:00.000Z" },
      { videoId: "v1", sessionId: "s2", eventType: "progress", watchedSeconds: 60, createdAt: "2026-08-03T10:00:00.000Z" },
    ]);
    expect(result).toEqual([
      { videoId: "v1", sessionId: "s1", watchedSeconds: 40, date: "2026-08-02" },
      { videoId: "v1", sessionId: "s2", watchedSeconds: 60, date: "2026-08-03" },
    ]);
  });

  it("clamps negative watchedSeconds to 0", () => {
    const result = aggregateWatchedBySession([
      { videoId: "v1", sessionId: "s1", eventType: "play", watchedSeconds: -10, createdAt: "2026-08-01T10:00:00.000Z" },
    ]);
    expect(result[0]?.watchedSeconds).toBe(0);
  });

  it("returns an empty list for no events", () => {
    expect(aggregateWatchedBySession([])).toEqual([]);
  });
});

describe("estimateEgressFromSessions", () => {
  const videos = [{ id: "v1", sizeBytes: 1000, durationSeconds: 100 }];

  it("estimates egress per session from the max watched fraction", () => {
    expect(
      estimateEgressFromSessions({
        sessions: [{ videoId: "v1", sessionId: "s1", watchedSeconds: 50, date: "2026-08-02" }],
        videos,
      }),
    ).toBe(500);
  });

  it("sums egress across sessions of the same video", () => {
    expect(
      estimateEgressFromSessions({
        sessions: [
          { videoId: "v1", sessionId: "s1", watchedSeconds: 50, date: "2026-08-02" },
          { videoId: "v1", sessionId: "s2", watchedSeconds: 100, date: "2026-08-03" },
        ],
        videos,
      }),
    ).toBe(1500);
  });

  it("skips sessions whose video is not in the library", () => {
    expect(
      estimateEgressFromSessions({
        sessions: [{ videoId: "missing", sessionId: "s1", watchedSeconds: 50, date: "2026-08-02" }],
        videos,
      }),
    ).toBe(0);
  });

  it("returns 0 for no sessions", () => {
    expect(estimateEgressFromSessions({ sessions: [], videos })).toBe(0);
  });
});

describe("summarizeSessionsByDay", () => {
  const videos = [{ id: "v1", sizeBytes: 1000, durationSeconds: 100 }];

  it("groups session egress by the day of its max-watched event", () => {
    const result = summarizeSessionsByDay({
      sessions: [
        { videoId: "v1", sessionId: "s1", watchedSeconds: 50, date: "2026-08-02" },
        { videoId: "v1", sessionId: "s2", watchedSeconds: 100, date: "2026-08-02" },
        { videoId: "v1", sessionId: "s3", watchedSeconds: 25, date: "2026-08-03" },
      ],
      videos,
    });
    expect(result).toEqual([
      { date: "2026-08-02", egressBytes: 1500 },
      { date: "2026-08-03", egressBytes: 250 },
    ]);
  });

  it("backfills zero days across the requested calendar window", () => {
    const result = summarizeSessionsByDay({
      sessions: [{ videoId: "v1", sessionId: "s1", watchedSeconds: 50, date: "2026-08-02" }],
      videos,
      fromDate: "2026-08-01",
      toDate: "2026-08-04",
    });
    expect(result).toEqual([
      { date: "2026-08-01", egressBytes: 0 },
      { date: "2026-08-02", egressBytes: 500 },
      { date: "2026-08-03", egressBytes: 0 },
      { date: "2026-08-04", egressBytes: 0 },
    ]);
  });

  it("skips sessions whose video is not in the library", () => {
    const result = summarizeSessionsByDay({
      sessions: [{ videoId: "missing", sessionId: "s1", watchedSeconds: 50, date: "2026-08-02" }],
      videos,
    });
    expect(result).toEqual([]);
  });

  it("returns an empty series for no sessions", () => {
    expect(summarizeSessionsByDay({ sessions: [], videos })).toEqual([]);
  });
});

describe("summarizeBandwidthByDay", () => {
  it("groups events by ISO date and sums egress", () => {
    const result = summarizeBandwidthByDay([
      { created_at: "2026-08-01T10:00:00.000Z", egressBytes: 100 },
      { created_at: "2026-08-01T15:30:00.000Z", egressBytes: 50 },
      { created_at: "2026-08-02T09:00:00.000Z", egressBytes: 75 },
    ]);
    expect(result).toEqual([
      { date: "2026-08-01", egressBytes: 150 },
      { date: "2026-08-02", egressBytes: 75 },
    ]);
  });

  it("backfills zero days when a calendar window is given", () => {
    const result = summarizeBandwidthByDay(
      [
        { created_at: "2026-08-02T10:00:00.000Z", egressBytes: 75 },
        { created_at: "2026-08-05T10:00:00.000Z", egressBytes: 100 },
      ],
      { fromDate: "2026-08-01", toDate: "2026-08-05" },
    );
    expect(result).toEqual([
      { date: "2026-08-01", egressBytes: 0 },
      { date: "2026-08-02", egressBytes: 75 },
      { date: "2026-08-03", egressBytes: 0 },
      { date: "2026-08-04", egressBytes: 0 },
      { date: "2026-08-05", egressBytes: 100 },
    ]);
  });

  it("returns an empty series for no events", () => {
    expect(summarizeBandwidthByDay([])).toEqual([]);
  });
});

describe("bandwidthCostCents", () => {
  it("rounds up 1 GB to the configured per-GB cost", () => {
    expect(bandwidthCostCents(1024 ** 3, 15)).toBe(15);
  });

  it("ceils fractional GB costs", () => {
    expect(bandwidthCostCents(1.5 * 1024 ** 3, 15)).toBe(23);
  });

  it("returns 0 for zero bytes", () => {
    expect(bandwidthCostCents(0, 15)).toBe(0);
  });
});

describe("trendPercentage", () => {
  it("returns null for a series shorter than 14 days", () => {
    expect(trendPercentage([{ date: "2026-08-01", egressBytes: 100 }])).toBeNull();
  });

  it("returns null when the previous window has no egress", () => {
    const flat = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      egressBytes: i < 7 ? 0 : 100,
    }));
    expect(trendPercentage(flat)).toBeNull();
  });

  it("reports a positive trend across the last 7 days", () => {
    const flat = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      egressBytes: i < 7 ? 100 : 200,
    }));
    expect(trendPercentage(flat)).toBe(100);
  });

  it("reports a negative trend across the last 7 days", () => {
    const flat = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      egressBytes: i < 7 ? 200 : 100,
    }));
    expect(trendPercentage(flat)).toBe(-50);
  });

  it("respects a custom window size", () => {
    const flat = [
      { date: "2026-08-01", egressBytes: 100 },
      { date: "2026-08-02", egressBytes: 100 },
      { date: "2026-08-03", egressBytes: 100 },
      { date: "2026-08-04", egressBytes: 300 },
    ];
    expect(trendPercentage(flat, 2)).toBe(100);
  });

  it("works on a calendar series with backfilled zero days", () => {
    const series = [
      { date: "2026-08-01", egressBytes: 0 },
      { date: "2026-08-02", egressBytes: 0 },
      { date: "2026-08-03", egressBytes: 0 },
      { date: "2026-08-04", egressBytes: 0 },
      { date: "2026-08-05", egressBytes: 0 },
      { date: "2026-08-06", egressBytes: 0 },
      { date: "2026-08-07", egressBytes: 100 },
      { date: "2026-08-08", egressBytes: 0 },
      { date: "2026-08-09", egressBytes: 0 },
      { date: "2026-08-10", egressBytes: 0 },
      { date: "2026-08-11", egressBytes: 0 },
      { date: "2026-08-12", egressBytes: 0 },
      { date: "2026-08-13", egressBytes: 0 },
      { date: "2026-08-14", egressBytes: 200 },
    ];
    expect(trendPercentage(series)).toBe(100);
  });
});