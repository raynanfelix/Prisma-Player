import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOrCreateViewerId,
  getViewerId,
  isValidViewerId,
  VIEWER_ID_STORAGE_KEY,
} from "@/lib/player/viewer-id";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const OTHER_UUID = "22222222-2222-4222-8222-222222222222";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key) ?? null : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    },
  };
}

describe("viewer-id", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a viewerId when nothing is stored and persists it", () => {
    const storage = memoryStorage();
    const id = getOrCreateViewerId(storage);
    expect(UUID_PATTERN.test(id)).toBe(true);
    expect(storage.getItem(VIEWER_ID_STORAGE_KEY)).toBe(id);
  });

  it("reuses an existing valid viewerId instead of creating a new one", () => {
    const storage = memoryStorage({ [VIEWER_ID_STORAGE_KEY]: VALID_UUID });
    const spy = vi.spyOn(storage, "setItem");
    expect(getOrCreateViewerId(storage)).toBe(VALID_UUID);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("replaces an invalid stored value with a fresh viewerId", () => {
    const storage = memoryStorage({ [VIEWER_ID_STORAGE_KEY]: "not-a-uuid" });
    const id = getOrCreateViewerId(storage);
    expect(UUID_PATTERN.test(id)).toBe(true);
    expect(id).not.toBe("not-a-uuid");
    expect(storage.getItem(VIEWER_ID_STORAGE_KEY)).toBe(id);
  });

  it("returns a fresh viewerId without crashing when storage throws", () => {
    const throwing: Storage = {
      get length() {
        return 0;
      },
      clear() {
        throw new Error("blocked");
      },
      getItem() {
        throw new Error("blocked");
      },
      key() {
        return null;
      },
      removeItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    expect(() => getOrCreateViewerId(throwing)).not.toThrow();
    const id = getOrCreateViewerId(throwing);
    expect(UUID_PATTERN.test(id)).toBe(true);
  });

  it("keeps creating distinct viewerIds on a fresh storage", () => {
    const storage = memoryStorage();
    const first = getOrCreateViewerId(storage);
    const second = getOrCreateViewerId(memoryStorage());
    expect(first).not.toBe(second);
  });

  it("returns a fresh viewerId without crashing when the window.localStorage accessor throws", () => {
    vi.stubGlobal(
      "window",
      new Proxy(
        {},
        {
          get() {
            throw new Error("SecurityError: The operation is insecure.");
          },
        },
      ),
    );
    expect(() => getOrCreateViewerId()).not.toThrow();
    const id = getOrCreateViewerId();
    expect(UUID_PATTERN.test(id)).toBe(true);
  });

  it("falls back to a plain UUID generator when crypto is unavailable", () => {
    vi.stubGlobal("crypto", undefined);
    const storage = memoryStorage();
    const id = getOrCreateViewerId(storage);
    expect(UUID_PATTERN.test(id)).toBe(true);
    expect(storage.getItem(VIEWER_ID_STORAGE_KEY)).toBe(id);
  });

  it("getViewerId reads without creating or persisting", () => {
    const empty = memoryStorage();
    expect(getViewerId(empty)).toBeNull();
    expect(empty.getItem(VIEWER_ID_STORAGE_KEY)).toBeNull();

    const seeded = memoryStorage({ [VIEWER_ID_STORAGE_KEY]: VALID_UUID });
    const spy = vi.spyOn(seeded, "setItem");
    expect(getViewerId(seeded)).toBe(VALID_UUID);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("getViewerId returns null for an invalid stored value", () => {
    const storage = memoryStorage({ [VIEWER_ID_STORAGE_KEY]: "not-a-uuid" });
    expect(getViewerId(storage)).toBeNull();
  });

  it("isValidViewerId validates UUID shape", () => {
    expect(isValidViewerId(VALID_UUID)).toBe(true);
    expect(isValidViewerId("")).toBe(false);
    expect(isValidViewerId("not-a-uuid")).toBe(false);
    expect(isValidViewerId("11111111-1111-1111-8111-111111111111")).toBe(true);
    expect(isValidViewerId(OTHER_UUID)).toBe(true);
  });
});
