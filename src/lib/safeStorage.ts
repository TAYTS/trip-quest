// localStorage that never throws: falls back to memory when storage is blocked
// (private mode, sandboxed previews) or full.
const memory = new Map<string, string>();

export const safeStorage = {
  get(key: string): string | null {
    try {
      const v = window.localStorage.getItem(key);
      if (v !== null) return v;
    } catch {
      /* blocked */
    }
    return memory.get(key) ?? null;
  },
  set(key: string, value: string): boolean {
    memory.set(key, value);
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false; // blocked or quota exceeded — kept in memory only
    }
  },
  remove(key: string) {
    memory.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* blocked */
    }
  },
  getJSON<T>(key: string, fallback: T): T {
    const raw = safeStorage.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  setJSON(key: string, value: unknown): boolean {
    return safeStorage.set(key, JSON.stringify(value));
  },
};
