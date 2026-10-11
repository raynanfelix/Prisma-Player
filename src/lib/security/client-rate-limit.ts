"use client";

type ClientLimitOptions = {
  key: string;
  maxAttempts: number;
  windowMs: number;
};

type StoredClientLimit = {
  count: number;
  resetAt: number;
};

function readLimit(storageKey: string): StoredClientLimit | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredClientLimit>;
    if (typeof parsed.count !== "number" || typeof parsed.resetAt !== "number") return null;
    return { count: parsed.count, resetAt: parsed.resetAt };
  } catch {
    return null;
  }
}

export function consumeClientAttempt(options: ClientLimitOptions) {
  const now = Date.now();
  const storageKey = `prisma-rate:${options.key}`;
  const current = readLimit(storageKey);

  if (!current || current.resetAt <= now) {
    window.localStorage.setItem(storageKey, JSON.stringify({ count: 1, resetAt: now + options.windowMs }));
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count < options.maxAttempts) {
    window.localStorage.setItem(storageKey, JSON.stringify({ ...current, count: current.count + 1 }));
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
}

export function clientRateMessage(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Muitas tentativas em pouco tempo. Aguarde cerca de ${minutes} minuto${minutes > 1 ? "s" : ""} e tente novamente.`;
}
