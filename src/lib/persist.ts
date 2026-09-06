/**
 * Generic browser-local persistence primitive.
 *
 * Every intelligence store in this application is built on this helper. Until a
 * database is connected, records live in this browser only — the UI states this
 * explicitly as LOCAL STORE / WAITING FOR SUPABASE. Nothing here invents data:
 * a store only ever contains records the running system actually produced.
 */

export type Store<T> = {
  key: string;
  get: () => T;
  set: (value: T) => void;
  update: (fn: (current: T) => T) => T;
  subscribe: (fn: () => void) => () => void;
  clear: () => void;
};

const listeners = new Map<string, Set<() => void>>();

export function createStore<T>(key: string, fallback: T): Store<T> {
  const notify = () => listeners.get(key)?.forEach((l) => l());

  const get = (): T => {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };

  const set = (value: T) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — records simply are not retained */
    }
    notify();
  };

  return {
    key,
    get,
    set,
    update: (fn) => {
      const next = fn(get());
      set(next);
      return next;
    },
    subscribe: (fn) => {
      const set_ = listeners.get(key) ?? new Set<() => void>();
      set_.add(fn);
      listeners.set(key, set_);
      return () => {
        set_.delete(fn);
      };
    },
    clear: () => set(fallback),
  };
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Storage footprint of the local intelligence stores, in bytes actually used. */
export function storeFootprint(): { key: string; bytes: number }[] {
  if (typeof window === "undefined") return [];
  const out: { key: string; bytes: number }[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith("dmi.")) continue;
      out.push({ key: k, bytes: (window.localStorage.getItem(k) ?? "").length });
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => b.bytes - a.bytes);
}
