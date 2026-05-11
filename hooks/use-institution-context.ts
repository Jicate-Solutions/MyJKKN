// hooks/use-institution-context.ts
// Shared client hook for BOS and OBE modules.
// Resolves the logged-in user's MyJKKN institution to its full InstitutionContext
// (which includes the COE institution_code / counselling_code needed for proxy calls).

import { useQuery, UseQueryResult } from '@tanstack/react-query';
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

export function useAllInstitutionContexts(): UseQueryResult<InstitutionContext[], Error> {
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
    enabled: !!profile && isSuperAdmin,
    ...QUERY_CONFIG.USER_SESSION_DATA,
  });
}
