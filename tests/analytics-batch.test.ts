import { describe, expect, it } from "vitest";
import { normalizeAnalyticsBatch } from "@/lib/player/analytics-batch";

function single(videoId = "11111111-1111-4111-8111-111111111111") {
  return { videoId, sessionId: "22222222-2222-4222-8222-222222222222", eventToken: "token", eventType: "play", progressPercent: 0 };
}

describe("normalizeAnalyticsBatch", () => {
  it("normalizes a valid batch sharing one video and session", () => {
    const result = normalizeAnalyticsBatch({
      videoId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      eventToken: "token",
      events: [
        { eventType: "play", progressPercent: 0, watchedSeconds: 2 },
        { eventType: "progress", progressPercent: 25, watchedSeconds: 17 },
        { eventType: "heartbeat", progressPercent: 37, watchedSeconds: 41 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batch.videoId).toBe("11111111-1111-4111-8111-111111111111");
    expect(result.batch.sessionId).toBe("22222222-2222-4222-8222-222222222222");
    expect(result.batch.events).toHaveLength(3);
    expect(result.batch.events[1]).toMatchObject({ eventType: "progress", progressPercent: 25, watchedSeconds: 17 });
  });

  it("accepts a single event with no events array (backward compatible)", () => {
    const result = normalizeAnalyticsBatch(single());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batch.events).toHaveLength(1);
    expect(result.batch.events[0].eventType).toBe("play");
  });

  it("rejects a batch with an invalid videoId", () => {
    const result = normalizeAnalyticsBatch({ ...single("not-a-uuid"), events: [{ eventType: "play", progressPercent: 0 }] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_event");
    expect(result.status).toBe(400);
  });

  it("rejects an unknown eventType", () => {
    const result = normalizeAnalyticsBatch({ ...single(), events: [{ eventType: "evil", progressPercent: 0 }] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_event");
  });

  it("rejects a non-milestone progress for non-heartbeat events", () => {
    const result = normalizeAnalyticsBatch({ ...single(), events: [{ eventType: "progress", progressPercent: 37, watchedSeconds: 10 }] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_event");
  });

  it("accepts any progress for a heartbeat", () => {
    const result = normalizeAnalyticsBatch({ ...single(), events: [{ eventType: "heartbeat", progressPercent: 37, watchedSeconds: 41 }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batch.events[0].progressPercent).toBe(37);
  });

  it("rejects a conversion without transactionId", () => {
    const result = normalizeAnalyticsBatch({ ...single(), events: [{ eventType: "conversion", progressPercent: 100, value: 99, currency: "BRL" }] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_conversion");
  });

  it("accepts a valid conversion", () => {
    const result = normalizeAnalyticsBatch({ ...single(), events: [{ eventType: "conversion", progressPercent: 100, value: 99, currency: "BRL", transactionId: "tx_123" }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batch.events[0]).toMatchObject({ eventType: "conversion", value: 99, currency: "BRL", transactionId: "tx_123" });
  });

  it("clamps watchedSeconds to a sane maximum", () => {
    const result = normalizeAnalyticsBatch({ ...single(), events: [{ eventType: "play", progressPercent: 0, watchedSeconds: 9_999_999 }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batch.events[0].watchedSeconds).toBe(86400);
  });

  it("rejects an empty events array", () => {
    const result = normalizeAnalyticsBatch({ ...single(), events: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects more than the allowed batch size", () => {
    const events = Array.from({ length: 101 }, (_, i) => ({ eventType: "progress" as const, progressPercent: 25, watchedSeconds: i }));
    const result = normalizeAnalyticsBatch({ ...single(), events });
    expect(result.ok).toBe(false);
  });

  it("fails the whole batch when any event is malformed", () => {
    const result = normalizeAnalyticsBatch({
      ...single(),
      events: [
        { eventType: "play", progressPercent: 0 },
        { nope: true },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_event");
  });
});