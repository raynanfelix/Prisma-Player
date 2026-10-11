function sanitize(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 200) return value.slice(0, 200) + "...";
    return value;
  }
  if (typeof value === "object" && value !== null) {
    if (value instanceof Error) return { name: value.name, message: value.message };
    if (Array.isArray(value)) return value.map(sanitize);
    const sanitized: Record<string, unknown> = {};
    const SENSITIVE_KEYS = /^(key|secret|token|password|authorization|api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key)$/i;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(k)) {
        sanitized[k] = "[redacted]";
      } else {
        sanitized[k] = sanitize(v);
      }
    }
    return sanitized;
  }
  return value;
}

export function safeLog(context: string, data: Record<string, unknown>): void {
  console.error(context, JSON.stringify(sanitize(data)));
}
