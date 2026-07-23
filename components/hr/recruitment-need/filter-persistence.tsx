'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

/**
 * useFilterPersistence — syncs a filter object to URL search params AND localStorage.
 *
 * Priority on mount: URL params > localStorage > defaults.
 * On change: updates both URL and localStorage.
 *
 * @param key - localStorage namespace key (e.g. "hr-intelligence-recruitment-need-filters")
 * @param defaultFilters - fallback values when neither URL nor localStorage has a value
 */
export function useFilterPersistence<T extends Record<string, string>>(
  key: string,
  defaultFilters: T
): {
  filters: T;
  setFilter: (name: keyof T, value: string) => void;
  resetFilters: () => void;
} {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isInitialMount = useRef(true);

  // Initialise from URL > localStorage > defaults
  const [filters, setFilters] = useState<T>(() => {
    const initial = { ...defaultFilters };

    // Try URL params first
    let hasUrlParam = false;
    for (const k of Object.keys(defaultFilters)) {
      const urlVal = searchParams.get(k);
      if (urlVal !== null) {
        (initial as any)[k] = urlVal;
        hasUrlParam = true;
      }
    }

    // Fall back to localStorage if no URL params
    if (!hasUrlParam && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          for (const k of Object.keys(defaultFilters)) {
            if (parsed[k] !== undefined) {
              (initial as any)[k] = parsed[k];
            }
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    return initial;
  });

  // Persist to URL + localStorage on changes (skip initial mount to avoid no-op replace)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;

      // Still persist initial restored state to URL if it came from localStorage
      const params = new URLSearchParams(searchParams.toString());
      let changed = false;
      for (const [k, v] of Object.entries(filters)) {
        if (v && v !== defaultFilters[k as keyof T]) {
          if (params.get(k) !== v) {
            params.set(k, v);
            changed = true;
          }
        }
      }
      if (changed) {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
      return;
    }

    // Write to URL
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(filters)) {
      if (v && v !== defaultFilters[k as keyof T]) {
        params.set(k, v);
      } else {
        params.delete(k);
      }
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });

    // Write to localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(key, JSON.stringify(filters));
      } catch {
        // quota exceeded etc.
      }
    }
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = useCallback((name: keyof T, value: string) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ ...defaultFilters });
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(key); } catch {}
    }
  }, [defaultFilters, key]);

  return { filters, setFilter, resetFilters };
}
