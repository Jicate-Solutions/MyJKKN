'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Returns a counter that bumps every time a TanStack Query whose key starts
 * with `queryKeyPrefix` is invalidated. Pass the counter to
 * `<DataTable refetchKey={refetchKey} />` so tables that fetch via
 * `fetchDataFn` (i.e. NOT through React Query) re-fetch after mutations.
 *
 * Why this exists: the generic DataTable can run either through React Query
 * (queryHook mode) or via a plain `fetchDataFn`. Most BoS list tables use the
 * second mode for pagination/sort/search ergonomics. That mode is invisible
 * to `queryClient.invalidateQueries`, so create/update/delete mutations
 * elsewhere in the app left these tables showing stale rows until a manual
 * page refresh.
 */
export function useDataTableRefreshOnInvalidate(
  queryKeyPrefix: readonly unknown[],
): number {
  const queryClient = useQueryClient();
  const [refetchKey, setRefetchKey] = useState(0);

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      if (event.type !== 'updated') return;
      const actionType = (event.action as { type?: string }).type;
      if (actionType !== 'invalidate') return;
      const key = event.query.queryKey;
      if (!Array.isArray(key)) return;
      for (let i = 0; i < queryKeyPrefix.length; i++) {
        if (key[i] !== queryKeyPrefix[i]) return;
      }
      setRefetchKey((k) => k + 1);
    });
    return unsubscribe;
    // queryKeyPrefix is a stable tuple at call sites; spreading it into deps
    // keeps the effect honest if a caller varies it.
  }, [queryClient, ...queryKeyPrefix]);

  return refetchKey;
}
