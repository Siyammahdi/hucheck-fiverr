"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const EVENT = "fmc:storage";

/**
 * Browser-only persistence built on useSyncExternalStore, so it is hydration
 * safe and stays in sync across tabs. Pass a stable `initial` value.
 */
export function useLocalStorage<T>(key: string, initial: T) {
  const subscribe = useCallback(
    (cb: () => void) => {
      window.addEventListener("storage", cb);
      window.addEventListener(EVENT, cb);
      return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener(EVENT, cb);
      };
    },
    []
  );

  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);

  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const value = useMemo<T>(() => {
    if (raw === null) return initial;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  }, [raw, initial]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      try {
        const current = localStorage.getItem(key);
        const prev = current === null ? initial : (JSON.parse(current) as T);
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        localStorage.setItem(key, JSON.stringify(resolved));
        window.dispatchEvent(new Event(EVENT));
      } catch {
        /* storage blocked or full */
      }
    },
    [key, initial]
  );

  return [value, set] as const;
}
