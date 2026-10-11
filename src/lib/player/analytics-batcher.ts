export type AnalyticsEvent = Record<string, unknown>;

export type AnalyticsFlushHandler = (events: AnalyticsEvent[]) => Promise<boolean>;

export interface AnalyticsBatcherOptions {
  maxEvents: number;
  flushIntervalMs: number;
  flush: AnalyticsFlushHandler;
}

export interface AnalyticsBatcher {
  enqueue(event: AnalyticsEvent): void;
  flushNow(): Promise<boolean>;
  destroy(): void;
}

export function createAnalyticsBatcher(options: AnalyticsBatcherOptions): AnalyticsBatcher {
  const queue: AnalyticsEvent[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;
  let destroyed = false;

  const stopTimer = () => {
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const flushNow = async () => {
    if (destroyed || queue.length === 0 || inFlight) return true;
    const batch = queue.splice(0);
    inFlight = true;
    let ok = false;
    try {
      ok = await options.flush(batch);
    } catch {
      ok = false;
    } finally {
      inFlight = false;
    }
    if (ok && queue.length > 0) {
      void flushNow();
    } else if (!ok) {
      queue.push(...batch);
    }
    return ok;
  };

  const startTimer = () => {
    if (timer != null) return;
    timer = setInterval(() => { void flushNow(); }, options.flushIntervalMs);
  };

  startTimer();

  return {
    enqueue(event) {
      if (destroyed) return;
      if (timer == null) startTimer();
      queue.push(event);
      if (queue.length >= options.maxEvents) void flushNow();
    },
    flushNow,
    destroy() {
      if (destroyed) return;
      stopTimer();
      void flushNow();
      destroyed = true;
    },
  };
}