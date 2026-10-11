import { describe, expect, it, vi } from "vitest";
import { createAnalyticsBatcher } from "@/lib/player/analytics-batcher";

describe("analytics event batcher", () => {
  it("flushes events when the queued batch reaches maxEvents", async () => {
    const flush = vi.fn(async () => true);
    const batcher = createAnalyticsBatcher({ maxEvents: 3, flushIntervalMs: 60_000, flush });
    batcher.enqueue({ videoId: "a" });
    batcher.enqueue({ videoId: "b" });
    expect(flush).not.toHaveBeenCalled();
    batcher.enqueue({ videoId: "c" });
    await Promise.resolve();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith([{ videoId: "a" }, { videoId: "b" }, { videoId: "c" }]);
  });

  it("flushes pending events when the interval elapses", async () => {
    vi.useFakeTimers();
    try {
      const flush = vi.fn(async () => true);
      const batcher = createAnalyticsBatcher({ maxEvents: 10, flushIntervalMs: 5_000, flush });
      batcher.enqueue({ videoId: "a" });
      expect(flush).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(flush).toHaveBeenCalledTimes(1);
      expect(flush).toHaveBeenCalledWith([{ videoId: "a" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not start a second flush while a flush is in flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const flush = vi.fn(async () => { await gate; return true; });
    const batcher = createAnalyticsBatcher({ maxEvents: 1, flushIntervalMs: 60_000, flush });
    batcher.enqueue({ videoId: "a" });
    batcher.enqueue({ videoId: "b" });
    batcher.enqueue({ videoId: "c" });
await Promise.resolve();
    expect(flush).toHaveBeenCalledTimes(1);
    release();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("keeps events queued when a flush fails and retries them later", async () => {
    const flush = vi.fn(async () => false).mockResolvedValueOnce(false).mockResolvedValue(true);
    const batcher = createAnalyticsBatcher({ maxEvents: 10, flushIntervalMs: 5_000, flush });
    batcher.enqueue({ videoId: "a" });
    await batcher.flushNow();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith([{ videoId: "a" }]);
    await batcher.flushNow();
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("flushNow drains the queue immediately", async () => {
    const flush = vi.fn(async () => true);
    const batcher = createAnalyticsBatcher({ maxEvents: 10, flushIntervalMs: 60_000, flush });
    batcher.enqueue({ videoId: "a" });
    batcher.enqueue({ videoId: "b" });
    const result = await batcher.flushNow();
    expect(result).toBe(true);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith([{ videoId: "a" }, { videoId: "b" }]);
  });

  it("stops the interval timer on destroy", async () => {
    vi.useFakeTimers();
    try {
      const flush = vi.fn(async () => true);
      const batcher = createAnalyticsBatcher({ maxEvents: 10, flushIntervalMs: 5_000, flush });
      batcher.destroy();
      batcher.enqueue({ videoId: "a" });
      await vi.advanceTimersByTimeAsync(15_000);
      expect(flush).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
