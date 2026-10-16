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
    if (destroyed) {
      void queue.splice(0); // clear queue
      return false;
    }
    if (queue.length === 0) return true;
    if (inFlight) {
      // already flushing; skip this round, next interval will try again
      return true;
    }
    const batch = queue.splice(0);
    inFlight = true;
    let ok = false;
    try {
      // O contrato de AnalyticsFlushHandler é Promise<boolean> (o chamador
      // decide o que conta como sucesso, inclusive respostas HTTP 4xx que
      // já foram processadas pelo servidor).
      ok = await options.flush(batch);
    } catch {
      ok = false;
    } finally {
      inFlight = false;
    }
    if (ok && queue.length > 0) {
      void flushNow();
    } else if (!ok) {
      // re-encapsulate for retry on next flush cycle
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