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
  /** Fatal: the page has nothing to show. */
  error: string | null;
  /**
   * NOT fatal: the last 90 days are on screen and only the older half failed.
   *
   * Separate from `error` because the view early-returns on `error` — so
   * reusing it for an archive failure threw away a page that had loaded
   * perfectly, to report that a second, optional fetch had not.
   */
  archiveError: string | null;
}

/**
 * Fetch one part, and FAIL on a non-2xx instead of parsing the error body as data.
 *
 * Without the `r.ok` test, a 401 or 500 body — `{ error: '...' }` — was handed
 * back as `meta`. It is an object, so it is truthy, so the `if (!meta)` guard
 * below passed and `Object.entries(meta.modules)` ran on undefined: a TypeError
 * during render, i.e. the app's generic crash page rather than this feature's own
 * "could not be loaded" card. That path is new — the entries used to be a static
 * file, and now they come from a route that can genuinely 500 if the migration
 * has not been applied yet.
 */
async function getPart(part: 'meta' | 'recent' | 'archive', before?: string) {
  const qs = before ? `&before=${encodeURIComponent(before)}` : '';
  const res = await fetch(`/api/whats-new?part=${part}${qs}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`/api/whats-new?part=${part} responded ${res.status}`);
  return res.json();
}

export function useChangelog() {
  const { permissions, isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const [{ meta, recent, archive, error, archiveError }, set] = useState<State>({
    meta: null,
    recent: null,
    archive: null,
    error: null,
    archiveError: null,
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
      getPart('meta'),
      getPart('recent'),
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
    // Pin the boundary to the one `meta` reported. Recomputed server-side it
    // moves at IST midnight, and a reader who opens the page just before and
    // clicks through just after would see one day listed twice.
    getPart('archive', meta?.recentFrom)
      .then((a) => set((s) => ({ ...s, archive: a })))
      .catch(() => {
        // Three things, and each one is the fix for a separate half of the bug.
        //
        // `archiveError` rather than `error`: the view early-returns on `error`,
        // so writing it here replaced a working page — the 90 days already
        // rendered, the filters, the reader's scroll position — with a card
        // saying the OLDER entries had failed. The part that worked was thrown
        // away to report the part that did not.
        //
        // Releasing the in-flight latch and clearing `wantArchive`: without
        // both, a retry was impossible. The latch stayed set forever, and the
        // effect keys on `wantArchive` — leaving it true means a second click
        // changes no dependency and re-runs nothing. The advice was "Please
        // refresh", which re-fetches the half that had already succeeded.
        archiveInFlight.current = false;
        setWantArchive(false);
        set((s) => ({
          ...s,
          archiveError: 'Earlier changes could not be loaded.',
        }));
      });
    // `meta?.recentFrom` is a dependency, not an oversight: the effect reads it.
    // Re-running is harmless — archiveInFlight guards against a second fetch.
  }, [wantArchive, archive, meta?.recentFrom]);

  // Derived rather than stored. The reader has asked for the archive and it has
  // not arrived: that IS the loading state, so a separate flag could only ever
  // disagree with it.
  const loadingArchive = wantArchive && !archive && !error && !archiveError;

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
    /** The older half failed; everything else on the page is still good. */
    archiveError,
    hasArchive: !!meta && meta.archiveCount > 0 && !archive,
    loadingArchive,
    // Clearing archiveError is what makes this a retry rather than a no-op:
    // the catch above set wantArchive back to false, so setting it true here
    // changes the effect's dependency and runs the fetch again.
    loadArchive: () => {
      set((s) => ({ ...s, archiveError: null }));
      setWantArchive(true);
    },
  };
}
