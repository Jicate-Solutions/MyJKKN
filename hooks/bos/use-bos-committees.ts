import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import {
  BosCommittee,
  CreateBosCommitteeDto,
  UpdateBosCommitteeDto,
} from '@/types/bos';
import { QUERY_CONFIG } from '@/lib/config/query-config';

export const bosCommitteeKeys = {
  all: ['bos-committees'] as const,
  byInstitutions: (csv: string) =>
    [...bosCommitteeKeys.all, 'institutions', csv] as const,
  byComposition: (compositionId: string) =>
    [...bosCommitteeKeys.all, 'composition', compositionId] as const,
  // Unassigned "template" committees (composition_id IS NULL) for an institution
  // — the pool the composition detail page's Add Committee picker draws from.
  templates: (csv: string) =>
    [...bosCommitteeKeys.all, 'template', csv] as const,
};

async function parseError(res: Response, fallback: string): Promise<never> {
  const json = await res.json().catch(() => null);
  throw new Error(json?.error ?? fallback);
}

// ── Cache reconciliation ──────────────────────────────────────────────────────
// Mutations write the server-authoritative row straight into every cached
// committee list instead of calling invalidateQueries. A follow-up GET right
// after a write has been observed (in this codebase — see useAddBosMember) to
// return a stale snapshot missing the new row, which would make the just-saved
// committee vanish until a manual refresh. Caches still refresh naturally on
// remount via SEMI_STABLE_DATA's refetch behaviour / staleTime expiry.

const committeeSort = (a: BosCommittee, b: BosCommittee) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name);

/** Does the row belong in the list cached under this query key? */
function rowMatchesListKey(key: readonly unknown[], row: BosCommittee): boolean {
  const scope = key[1]; // 'institutions' | 'composition' | 'template'
  const scopeValue = key[2];
  const isActive = key[3];
  if (typeof isActive === 'boolean' && isActive !== row.is_active) {
    return false;
  }
  if (scope === 'composition') {
    // Key shape: ['bos-committees', 'composition', <compositionId>, <isActive|'all'>]
    return typeof scopeValue !== 'string' || row.composition_id === scopeValue;
  }
  if (scope === 'template') {
    // Key shape: ['bos-committees', 'template', <csv>, <isActive|'all'>]
    // The template pool is UNASSIGNED committees only. Adding a template to a
    // composition COPIES it (a fresh row carrying composition_id), so the
    // master row stays here and remains reusable by every other composition;
    // the copy is rejected from this list by the composition_id check below.
    if (row.composition_id != null) return false;
    if (
      typeof scopeValue === 'string' &&
      scopeValue !== '' &&
      !scopeValue.split(',').includes(row.institutions_id)
    ) {
      return false;
    }
    return true;
  }
  // Key shape: ['bos-committees', 'institutions', <csv>, <isActive|'all'>]
  if (
    typeof scopeValue === 'string' &&
    scopeValue !== '' &&
    !scopeValue.split(',').includes(row.institutions_id)
  ) {
    return false;
  }
  return true;
}

function upsertCommitteeInCaches(queryClient: QueryClient, row: BosCommittee) {
  const entries = queryClient.getQueriesData<BosCommittee[]>({
    queryKey: bosCommitteeKeys.all,
  });
  for (const [key, data] of entries) {
    if (!data) continue;
    const without = data.filter((c) => c.id !== row.id);
    const next = rowMatchesListKey(key, row) ? [...without, row].sort(committeeSort) : without;
    queryClient.setQueryData(key, next);
  }
}

function removeCommitteeFromCaches(queryClient: QueryClient, id: string) {
  const entries = queryClient.getQueriesData<BosCommittee[]>({
    queryKey: bosCommitteeKeys.all,
  });
  for (const [key, data] of entries) {
    if (!data) continue;
    queryClient.setQueryData(key, data.filter((c) => c.id !== id));
  }
}

/**
 * Committees for one logical institution. Pass the CAS-expanded csv from
 * useBosInstitutionScope (or null/undefined while it resolves — the query
 * stays disabled). Super-admins may pass '' to list across all institutions.
 */
export function useBosCommittees(
  institutionsIdsCsv: string | null | undefined,
  options?: { isActive?: boolean; enabled?: boolean }
) {
  return useQuery<BosCommittee[], Error>({
    queryKey: [
      ...bosCommitteeKeys.byInstitutions(institutionsIdsCsv ?? ''),
      options?.isActive ?? 'all',
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (institutionsIdsCsv) params.set('institutionsIds', institutionsIdsCsv);
      if (options?.isActive !== undefined) params.set('isActive', String(options.isActive));
      const res = await fetch(`/api/bos/committees?${params.toString()}`);
      if (!res.ok) await parseError(res, 'Failed to fetch committees');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: options?.enabled ?? institutionsIdsCsv != null,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Committees owned by one composition (20260706). This is what the composition
 * detail page and Add Member dialog use — each composition has its own set.
 * Pass null/undefined while the id resolves to keep the query disabled.
 */
export function useBosCommitteesByComposition(
  compositionId: string | null | undefined,
  options?: { isActive?: boolean; enabled?: boolean }
) {
  return useQuery<BosCommittee[], Error>({
    queryKey: [
      ...bosCommitteeKeys.byComposition(compositionId ?? ''),
      options?.isActive ?? 'all',
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (compositionId) params.set('compositionId', compositionId);
      if (options?.isActive !== undefined) params.set('isActive', String(options.isActive));
      const res = await fetch(`/api/bos/committees?${params.toString()}`);
      if (!res.ok) await parseError(res, 'Failed to fetch committees');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: options?.enabled ?? (compositionId != null && compositionId !== ''),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Unassigned "template" committees (composition_id IS NULL) for one logical
 * institution — the pool the composition detail page's Add Committee picker
 * offers. Pass the CAS-expanded csv (composition's institution siblings).
 * Defaults to active-only since you rarely attach an inactive committee.
 */
export function useBosCommitteeTemplates(
  institutionsIdsCsv: string | null | undefined,
  options?: { isActive?: boolean; enabled?: boolean }
) {
  const isActive = options?.isActive ?? true;
  return useQuery<BosCommittee[], Error>({
    queryKey: [...bosCommitteeKeys.templates(institutionsIdsCsv ?? ''), isActive],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('scope', 'template');
      if (institutionsIdsCsv) params.set('institutionsIds', institutionsIdsCsv);
      params.set('isActive', String(isActive));
      const res = await fetch(`/api/bos/committees?${params.toString()}`);
      if (!res.ok) await parseError(res, 'Failed to fetch committees');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: options?.enabled ?? (institutionsIdsCsv != null && institutionsIdsCsv !== ''),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Copy a master (template) committee into a composition. The master row is left
 * untouched — a NEW row carrying composition_id is created from its fields — so
 * the same master committee stays reusable across every composition. (This
 * replaces an earlier "attach" flow that re-parented the master row and thereby
 * drained the pool: once used, a committee could never be added again.)
 *
 * Reuses useCreateBosCommittee — POST /api/bos/committees already accepts
 * composition_id, so a copy is just a create seeded from the template.
 */
export function useCopyBosCommitteeToComposition() {
  const create = useCreateBosCommittee();
  return {
    isPending: create.isPending,
    /** Copy `template` into `compositionId`, anchored to `institutionsId`. */
    copy: (
      template: BosCommittee,
      compositionId: string,
      institutionsId: string
    ): Promise<BosCommittee> =>
      create.mutateAsync({
        institutions_id: institutionsId,
        composition_id: compositionId,
        name: template.name,
        short_code: template.short_code ?? null,
        sort_order: template.sort_order,
        is_active: true,
      }),
  };
}

export function useCreateBosCommittee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateBosCommitteeDto): Promise<BosCommittee> => {
      const res = await fetch('/api/bos/committees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) await parseError(res, 'Failed to create committee');
      return res.json();
    },
    onSuccess: (created: BosCommittee) => {
      upsertCommitteeInCaches(queryClient, created);
    },
  });
}

export function useUpdateBosCommittee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateBosCommitteeDto;
    }): Promise<BosCommittee> => {
      const res = await fetch(`/api/bos/committees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) await parseError(res, 'Failed to update committee');
      return res.json();
    },
    onSuccess: (updated: BosCommittee) => {
      upsertCommitteeInCaches(queryClient, updated);
    },
  });
}

export function useDeleteBosCommittee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/bos/committees/${id}`, { method: 'DELETE' });
      if (!res.ok) await parseError(res, 'Failed to delete committee');
      return res.json();
    },
    onSuccess: (_data, id) => {
      removeCommitteeFromCaches(queryClient, id);
    },
  });
}
