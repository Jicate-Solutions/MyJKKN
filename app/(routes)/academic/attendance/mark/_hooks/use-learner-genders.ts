'use client';

// Added: 2026-10-11 (#4328 review, BUG-006276) - Gender per learner for the
// "Boys, then girls" order on the marking list, kept apart from the page so
// its reset / skip / fallback rules can be tested.
//
// * Keyed by the roster's ids (a string), not the array reference, so a
//   re-created `students` array with the same learners makes no new call.
// * When the roster or institution changes, ids that are no longer on the
//   roster are dropped at once (a different roster starts from an empty map).
//   If every id on the new roster is already known (e.g. a practical batch
//   narrowed the list), no call is made.
// * 'loading' is separate from 'unavailable': while loading, the caller should
//   keep name order rather than sort half-known genders.
// * 'unavailable' = the lookup failed, timed out or returned nothing; the
//   caller falls back to name order and tells the user.

import { useEffect, useRef, useState } from 'react';

export type LearnerGenderStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export type LearnerGenderFetcher = (
  institutionId: string,
  learnerIds: string[]
) => Promise<Map<string, string | null>>;

export function useLearnerGenders(
  enabled: boolean,
  institutionId: string | null | undefined,
  learnerIds: readonly string[],
  fetchGenders: LearnerGenderFetcher
): { genders: Map<string, string | null>; status: LearnerGenderStatus } {
  const [genders, setGenders] = useState<Map<string, string | null>>(() => new Map());
  const [status, setStatus] = useState<LearnerGenderStatus>('idle');

  const knownRef = useRef<Map<string, string | null>>(new Map());
  const institutionRef = useRef<string | null | undefined>(institutionId);
  const fetchRef = useRef(fetchGenders);
  fetchRef.current = fetchGenders;

  const rosterKey = learnerIds.join(',');

  useEffect(() => {
    const ids = rosterKey ? rosterKey.split(',') : [];

    if (institutionRef.current !== institutionId) {
      knownRef.current = new Map();
      institutionRef.current = institutionId;
    }

    // Keep only ids that are on the current roster.
    const current = new Map<string, string | null>();
    for (const id of ids) {
      if (knownRef.current.has(id)) current.set(id, knownRef.current.get(id) ?? null);
    }
    knownRef.current = current;
    setGenders(current);

    if (!enabled || !institutionId || ids.length === 0) {
      setStatus('idle');
      return;
    }

    const missing = ids.filter((id) => !current.has(id));
    if (missing.length === 0) {
      setStatus('ready');
      return;
    }

    setStatus('loading');
    let cancelled = false;
    fetchRef
      .current(institutionId, missing)
      .catch(() => new Map<string, string | null>())
      .then((fetched) => {
        if (cancelled) return;
        if (fetched.size === 0) {
          setStatus('unavailable');
          return;
        }
        const merged = new Map(knownRef.current);
        // An id the lookup did not return is recorded as unknown, so it is not
        // asked for again on every roster change.
        for (const id of missing) merged.set(id, fetched.get(id) ?? null);
        knownRef.current = merged;
        setGenders(merged);
        setStatus('ready');
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, institutionId, rosterKey]);

  return { genders, status };
}
