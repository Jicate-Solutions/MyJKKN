'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Hydration-safe wrapper for Zustand stores with localStorage persistence.
 *
 * Problem this solves:
 * Zustand's `persist` middleware reads localStorage on mount. On the server
 * (SSR/SSG) there is no localStorage, so the store returns the default value.
 * On the client, the persisted value loads asynchronously. If we render the
 * persisted value immediately, React throws a hydration mismatch.
 *
 * Old approach (BROKEN): initialized useState as `undefined`, then set it in
 * useEffect. This caused ALL children to unmount (via `if (!sidebar) return null`)
 * and remount, destroying form state on every navigation.
 *
 * New approach: Track hydration with a ref. Return the store's default on first
 * render (matches SSR), then switch to the live store value after hydration.
 * The store value is always returned — never `undefined` — so children never
 * unmount due to a null guard.
 */
export const useStore = <T, F>(
  store: (callback: (state: T) => unknown) => unknown,
  callback: (state: T) => F
) => {
  const result = store(callback) as F;
  const [data, setData] = useState<F>(result);
  const hydrated = useRef(false);

  useEffect(() => {
    // After hydration, sync with the live store value
    if (!hydrated.current) {
      hydrated.current = true;
    }
    setData(result);
  }, [result]);

  return data;
};
