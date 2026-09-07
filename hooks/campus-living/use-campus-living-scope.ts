'use client';

import { usePermissions } from '@/hooks/use-permissions';

/**
 * Resolve the viewer's data scope BEFORE any campus-living query runs, and put
 * the RESOLVED scope in the query key. Two bugs live in the shape this replaces
 * (BUG-005831):
 *
 *  1. While usePermissions loads, isSuperAdmin is still false, so a super
 *     admin's first fetch ran scoped to their own profile institution — for
 *     director@ that is the blockless JKKN Testing Institution, which renders
 *     an all-zero dashboard under a working Allocations page.
 *  2. The query key carried only institutionId, so when isSuperAdmin resolved
 *     to true the key did not change and React Query re-served the cached
 *     scoped answer instead of refetching cluster-wide.
 *
 * The race is deterministic, not intermittent: usePermissions is a SECOND query
 * gated on the profile (`enabled: !!userProfile`), so isSuperAdmin can only ever
 * arrive after institution_id. Every cold load of a page using the old shape
 * fetched with the wrong scope; only warm client-side navigation looked correct.
 *
 * Same class as the Allocations "0 Allocated" bug (#2453): asking before you
 * know who is asking, then caching the wrong answer under a key that can never
 * notice. `ready` waits for permissions, and `scopeKey` is the resolved scope,
 * so neither half can recur.
 *
 * `enabled` alone is not a fix. It answers "may I ask?" — it does not answer
 * "do I know who is asking?". Both halves are required.
 */
export function useCampusLivingScope(institutionId: string | undefined) {
  const { isSuperAdmin, isLoading: permsLoading } = usePermissions();

  // Call sites pass `profile?.institution_id ?? ''`. Normalise the empty string
  // to undefined here so it can never reach a service as a literal filter value
  // and match zero rows (the `institutionId || ''` antipattern in CLAUDE.md).
  const own = institutionId || undefined;

  return {
    /**
     * Goes in the query key. A string rather than the raw flag so a cache entry
     * is self-describing in Devtools: 'all' | '<institution uuid>' | 'none'.
     * 'resolving' is never fetched under — `ready` is false while it is set —
     * so no placeholder answer is ever cached.
     */
    scopeKey: permsLoading ? 'resolving' : isSuperAdmin ? 'all' : own ?? 'none',
    /** Passed to the service. undefined = unscoped; RLS still gates the rows. */
    serviceArg: isSuperAdmin ? undefined : own,
    /** Gate for `enabled`: permissions have resolved AND there is a scope to use. */
    ready: !permsLoading && (isSuperAdmin || !!own),
  };
}
