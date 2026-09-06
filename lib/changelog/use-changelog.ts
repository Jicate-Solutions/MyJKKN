'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import type { ChangelogEntry, ChangelogMeta, ChangelogModule } from './types';

/**
 * Is this module's news relevant to the viewer?
 *
 * A module is shown when the viewer holds ANY live permission inside its
 * namespace. Testing a namespace rather than one key matters: Billing has ~20
 * sub-permissions and no `billing.view`, so gating on a single key would hide
 * Billing news from the people who actually work in Billing. It also means a
 * permission added later is picked up with no change here.
 */
export function canSeeModule(
  mod: ChangelogModule | undefined,
  permissions: Record<string, boolean>,
  isSuperAdmin: boolean
): boolean {
  if (isSuperAdmin) return true;
  if (!mod) return false;
  if (!mod.perm) return true; // platform-wide: sign-in, navigation, speed
  const prefixes = Array.isArray(mod.perm) ? mod.perm : [mod.perm];
  for (const [key, granted] of Object.entries(permissions)) {
    if (!granted) continue;
    for (const p of prefixes) {
      if (key === p || key.startsWith(`${p}.`)) return true;
    }
  }
  return false;
}

interface State {
  meta: ChangelogMeta | null;
  recent: ChangelogEntry[] | null;
  archive: ChangelogEntry[] | null;
  error: string | null;
}

export function useChangelog() {
  const { permissions, isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const [{ meta, recent, archive, error }, set] = useState<State>({
    meta: null,
    recent: null,
    archive: null,
    error: null,
  });
  const [wantArchive, setWantArchive] = useState(false);
  // A ref, not state: this only guards against a second fetch, and nothing needs
  // to re-render when it flips. Keeping it out of state is also what lets the
  // effect below avoid a synchronous setState in its body (React's
  // react-hooks/set-state-in-effect rule).
  const archiveInFlight = useRef(false);

  // First paint: metadata + the last 90 days only. The full six-month archive
  // is a second file, fetched when the reader asks for it.
  //
  // These come from the authenticated route /api/whats-new, NOT from public/.
  // They used to be public/changelog/*.json, which MyJKKN's proxy waves through
  // as a static asset (any path ending in .json), so the whole changelog was
  // readable on the open internet — see app/api/whats-new/route.ts for the
  // evidence and the fix.
  //
  // `cache: 'no-cache'` is deliberate: the payload is rewritten by `npm run
  // changelog` on every build but keeps the same URL, so nothing about it is
  // content-addressed. 'no-cache' (revalidate every time) rather than 'no-store'
  // (never store): the route can still answer 304 and the browser reuses the
  // ~700 KB body, which matters on a phone. The service worker layers on top —
  // see the NetworkFirst rule in app/sw.ts.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/whats-new?part=meta', { cache: 'no-cache' }).then((r) => r.json()),
      fetch('/api/whats-new?part=recent', { cache: 'no-cache' }).then((r) => r.json()),
    ])
      .then(([m, r]) => {
        if (!cancelled) set((s) => ({ ...s, meta: m, recent: r }));
      })
      .catch(() => {
        if (!cancelled)
          set((s) => ({ ...s, error: "What's New could not be loaded. Please refresh." }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!wantArchive || archive || archiveInFlight.current) return;
    archiveInFlight.current = true;
    fetch('/api/whats-new?part=archive', { cache: 'no-cache' })
      .then((r) => r.json())
      .then((a) => set((s) => ({ ...s, archive: a })))
      .catch(() =>
        set((s) => ({ ...s, error: 'Earlier changes could not be loaded. Please refresh.' }))
      );
  }, [wantArchive, archive]);

  // Derived rather than stored. The reader has asked for the archive and it has
  // not arrived: that IS the loading state, so a separate flag could only ever
  // disagree with it.
  const loadingArchive = wantArchive && !archive && !error;

  /** Module slugs this viewer may read about. */
  const visibleModules = useMemo(() => {
    if (!meta || permsLoading) return null;
    const out = new Set<string>();
    for (const [slug, mod] of Object.entries(meta.modules)) {
      if (canSeeModule(mod, permissions, isSuperAdmin)) out.add(slug);
    }
    return out;
  }, [meta, permissions, isSuperAdmin, permsLoading]);

  const all = useMemo(() => {
    if (!recent) return null;
    return archive ? [...recent, ...archive] : recent;
  }, [recent, archive]);

  const scoped = useMemo(() => {
    if (!all || !visibleModules) return null;
    return all.filter((e) => visibleModules.has(e.m));
  }, [all, visibleModules]);

  return {
    meta,
    /** entries this viewer may see, newest first */
    entries: scoped,
    /** total entries in the loaded window, before role scoping */
    loadedCount: all?.length ?? 0,
    visibleModules,
    isLoading: permsLoading || !recent || !visibleModules,
    error,
    hasArchive: !!meta && meta.archiveCount > 0 && !archive,
    loadingArchive,
    loadArchive: () => setWantArchive(true),
  };
}
