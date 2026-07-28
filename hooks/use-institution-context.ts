// hooks/use-institution-context.ts
// Shared client hook for BOS and OBE modules.
// Resolves the logged-in user's MyJKKN institution to its full InstitutionContext
// (which includes the COE institution_code / counselling_code needed for proxy calls).

import { useMemo } from 'react';
import { useQueries, useQuery, UseQueryResult } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type { InstitutionContext } from '@/lib/utils/institutions/institution-resolver';

export type { InstitutionContext };

// ── Query keys ────────────────────────────────────────────────────────────────

export const institutionContextKeys = {
  all: ['institution-context'] as const,
  byId: (id: string) => [...institutionContextKeys.all, 'id', id] as const,
  byCode: (code: string) => [...institutionContextKeys.all, 'code', code] as const,
  list: () => [...institutionContextKeys.all, 'list'] as const,
};

// ── useInstitutionContext ─────────────────────────────────────────────────────
// Primary hook used by BOS/OBE components.
//
// For regular users:  resolves their profile's institution_id automatically.
// For super-admins:   returns { data: undefined } — callers must render a
//                     picker and then call useInstitutionContextByCode().
//
// The result.data.counselling_code is the value to pass to COE proxy API routes.

export function useInstitutionContext(): UseQueryResult<InstitutionContext, Error> {
  const { profile } = useAuth();

  const institutionId = profile?.institution_id ?? null;
  const isSuperAdmin = profile?.is_super_admin === true || profile?.role === 'super_admin';

  // Super-admins have no institution_id — don't fire the query; callers handle
  // the undefined case by presenting an institution picker.
  const enabled = !!institutionId && !isSuperAdmin;

  return useQuery<InstitutionContext, Error>({
    queryKey: institutionContextKeys.byId(institutionId ?? ''),
    queryFn: async () => {
      const res = await fetch(
        `/api/institutions/resolve?institutionId=${institutionId}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to resolve institution context');
      }
      const json = await res.json();
      return json.data as InstitutionContext;
    },
    enabled,
    ...QUERY_CONFIG.USER_SESSION_DATA,
  });
}

// ── useInstitutionContextById ─────────────────────────────────────────────────
// Resolves any MyJKKN institution UUID to its full InstitutionContext
// (counselling_code + all sibling MyJKKN UUIDs for CAS Aided+Self).
// Use this when the institution-of-interest is NOT the logged-in user's own —
// e.g. a super-admin viewing a composition tied to a specific institution,
// or any flow that needs to expand a single institutions_id to its CAS siblings.

export function useInstitutionContextById(
  institutionId: string | undefined | null
): UseQueryResult<InstitutionContext, Error> {
  return useQuery<InstitutionContext, Error>({
    queryKey: institutionContextKeys.byId(institutionId ?? ''),
    queryFn: async () => {
      const res = await fetch(
        `/api/institutions/resolve?institutionId=${institutionId}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to resolve institution context');
      }
      const json = await res.json();
      return json.data as InstitutionContext;
    },
    enabled: !!institutionId,
    ...QUERY_CONFIG.USER_SESSION_DATA,
  });
}

// ── useInstitutionContextsByIds ──────────────────────────────────────────────
// Fans out useInstitutionContextById across a list of MyJKKN ids. Used by
// flows where the user has board membership in multiple institutions and we
// need to render *all* of them as picker options (e.g. /bos/courses/new for
// a faculty serving on boards across institutions). Each id gets its own
// react-query entry so the regular per-id cache still applies.

export function useInstitutionContextsByIds(
  institutionIds: readonly string[] | undefined,
): { data: InstitutionContext[]; isLoading: boolean } {
  const ids = institutionIds ?? [];
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: institutionContextKeys.byId(id),
      queryFn: async () => {
        const res = await fetch(`/api/institutions/resolve?institutionId=${id}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? 'Failed to resolve institution context');
        }
        const json = await res.json();
        return json.data as InstitutionContext;
      },
      enabled: !!id,
      ...QUERY_CONFIG.USER_SESSION_DATA,
    })),
  });

  // Memoise so callers can safely use `data` as a useEffect dependency without
  // each render producing a new array reference (useQueries returns a new
  // array every render). The dependency is the per-query data signature.
  const dataKey = results.map((r) => r.data?.myjkkn_id ?? '').join(',');
  const isLoading = results.some((r) => r.isLoading);
  const data = useMemo(() => {
    return results.map((r) => r.data).filter((d): d is InstitutionContext => !!d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);
  return { data, isLoading };
}

// ── useInstitutionContextByCode ───────────────────────────────────────────────
// Resolves by counselling_code — used after a super-admin picks an institution
// from the picker, or when you already know the code (e.g., from a URL param).

export function useInstitutionContextByCode(
  counsellingCode: string | undefined
): UseQueryResult<InstitutionContext, Error> {
  return useQuery<InstitutionContext, Error>({
    queryKey: institutionContextKeys.byCode(counsellingCode ?? ''),
    queryFn: async () => {
      const res = await fetch(
        `/api/institutions/resolve?counsellingCode=${encodeURIComponent(counsellingCode!)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to resolve institution context');
      }
      const json = await res.json();
      return json.data as InstitutionContext;
    },
    enabled: !!counsellingCode,
    ...QUERY_CONFIG.USER_SESSION_DATA,
  });
}

// ── useAllInstitutionContexts ─────────────────────────────────────────────────
// Returns all institutions for the super-admin institution picker.
// Deduplicates by coe_id (CAS Aided + Self → one row).
//
// `opts.enabled` is an OR-extension for non-super-admins: BoS read-all
// observers (holders of a bos-* view grant) may also fetch the full list —
// the /api/institutions/resolve list mode authorizes them server-side.
// Existing no-arg callers keep the super-admin-only behavior.

export function useAllInstitutionContexts(
  opts?: { enabled?: boolean }
): UseQueryResult<InstitutionContext[], Error> {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.is_super_admin === true || profile?.role === 'super_admin';

  return useQuery<InstitutionContext[], Error>({
    queryKey: institutionContextKeys.list(),
    queryFn: async () => {
      const res = await fetch('/api/institutions/resolve');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to list institution contexts');
      }
      const json = await res.json();
      return json.data as InstitutionContext[];
    },
    enabled: !!profile && (isSuperAdmin || opts?.enabled === true),
    ...QUERY_CONFIG.USER_SESSION_DATA,
  });
}
