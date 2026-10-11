export const VIEWER_ID_STORAGE_KEY = "prisma-player:viewer-id:v1";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidViewerId(value: string): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function randomUUID(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readStoredId(storage: Storage): string | null {
  try {
    const stored = storage.getItem(VIEWER_ID_STORAGE_KEY);
    return typeof stored === "string" && isValidViewerId(stored) ? stored : null;
  } catch {
    return null;
  }
}

function writeId(storage: Storage, id: string): void {
  try {
    storage.setItem(VIEWER_ID_STORAGE_KEY, id);
  } catch {
    // Storage bloqueado (ex.: cookies desabilitados): manter o ID em memória.
  }
}

export function getViewerId(storage?: Storage): string | null {
  if (!storage) return null;
  return readStoredId(storage);
}

function resolveDefaultStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getOrCreateViewerId(storage?: Storage): string {
  const store = storage ?? resolveDefaultStorage();
  const existing = store ? readStoredId(store) : null;
  if (existing) return existing;
  const id = randomUUID();
  if (store) writeId(store, id);
  return id;
}
