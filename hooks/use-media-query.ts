"use client";

import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string, serverValue = true) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue
  );
}

const noop = () => () => {};

/** False during SSR and the hydration pass, true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false
  );
}
