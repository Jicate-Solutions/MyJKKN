'use client';

/**
 * useSidebarCollapsedSections — persists per-user sidebar section collapse
 * state to `localStorage` under the key `myjkkn.sidebar.collapsed-sections`
 * per spec D5 + R4 (`specs/mobile-sidebar-bottomnav-spec.md`).
 *
 * Wave 2b PR-S2 (2026-04-24). Section = sidebar `groupLabel` (e.g.
 * "Academic Management", "Accounts"). Collapsed sections hide their module
 * rows; expanded sections show them. Default = ALL expanded on first load.
 *
 * Storage shape: JSON array of section labels currently collapsed, e.g.
 * `["Accounts", "Application Management"]`.
 *
 * Hydration-safe: returns an empty array on the server + first client
 * render, then populates from localStorage in `useEffect`. This avoids
 * SSR/CSR markup divergence (Next.js strict hydration).
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'myjkkn.sidebar.collapsed-sections';

function readStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    // Malformed JSON or localStorage blocked — default to all-expanded.
    return [];
  }
}

function writeStorage(sections: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sections));
  } catch {
    // Storage quota exceeded or blocked — swallow. UI still works in-memory.
  }
}

export interface UseSidebarCollapsedSectionsResult {
  /** Is this section currently collapsed? */
  isCollapsed: (section: string) => boolean;
  /** Toggle a section's collapsed state. Persists to localStorage. */
  toggle: (section: string) => void;
  /** True once the client-side hydration from localStorage has run. */
  hydrated: boolean;
}

export function useSidebarCollapsedSections(): UseSidebarCollapsedSectionsResult {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage once on the client. Keeps SSR output stable
  // (all-expanded) and defers persistence to post-hydration.
  useEffect(() => {
    setCollapsed(readStorage());
    setHydrated(true);
  }, []);

  const isCollapsed = useCallback(
    (section: string) => collapsed.includes(section),
    [collapsed]
  );

  const toggle = useCallback((section: string) => {
    setCollapsed((prev) => {
      const next = prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section];
      writeStorage(next);
      return next;
    });
  }, []);

  return { isCollapsed, toggle, hydrated };
}
