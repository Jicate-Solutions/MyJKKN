import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import {
  BosMemberTypeRecord,
  CreateBosMemberTypeDto,
  UpdateBosMemberTypeDto,
} from '@/types/bos';
import { QUERY_CONFIG } from '@/lib/config/query-config';

export const bosMemberTypeKeys = {
  all: ['bos-member-types'] as const,
  byInstitutions: (csv: string) =>
    [...bosMemberTypeKeys.all, 'institutions', csv] as const,
};

async function parseError(res: Response, fallback: string): Promise<never> {
  const json = await res.json().catch(() => null);
  throw new Error(json?.error ?? fallback);
}

// ── Cache reconciliation ──────────────────────────────────────────────────────
// Server-authoritative rows are written straight into every cached list — no
// invalidateQueries. Same rationale as use-bos-committees: a follow-up GET
// right after a write has been observed to return a stale snapshot missing
// the new row.

const memberTypeSort = (a: BosMemberTypeRecord, b: BosMemberTypeRecord) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name);

/** Does the row belong in the list cached under this query key? */
function rowMatchesListKey(key: readonly unknown[], row: BosMemberTypeRecord): boolean {
  // Key shape: ['bos-member-types', 'institutions', <csv>, <isActive|'all'>]
  const csv = key[2];
  const isActive = key[3];
  if (typeof csv === 'string' && csv !== '' && !csv.split(',').includes(row.institutions_id)) {
    return false;
  }
  if (typeof isActive === 'boolean' && isActive !== row.is_active) {
    return false;
  }
  return true;
}

function upsertMemberTypeInCaches(queryClient: QueryClient, row: BosMemberTypeRecord) {
  const entries = queryClient.getQueriesData<BosMemberTypeRecord[]>({
    queryKey: bosMemberTypeKeys.all,
  });
  for (const [key, data] of entries) {
    if (!data) continue;
    const without = data.filter((t) => t.id !== row.id);
    const next = rowMatchesListKey(key, row) ? [...without, row].sort(memberTypeSort) : without;
    queryClient.setQueryData(key, next);
  }
}

function removeMemberTypeFromCaches(queryClient: QueryClient, id: string) {
  const entries = queryClient.getQueriesData<BosMemberTypeRecord[]>({
    queryKey: bosMemberTypeKeys.all,
  });
  for (const [key, data] of entries) {
    if (!data) continue;
    queryClient.setQueryData(key, data.filter((t) => t.id !== id));
  }
}

/**
 * Member types for one logical institution. Pass the CAS-expanded csv from
 * useBosInstitutionScope (or null/undefined while it resolves — the query
 * stays disabled). Super-admins may pass '' to list across all institutions.
 */
export function useBosMemberTypes(
  institutionsIdsCsv: string | null | undefined,
  options?: { isActive?: boolean; enabled?: boolean }
) {
  return useQuery<BosMemberTypeRecord[], Error>({
    queryKey: [
      ...bosMemberTypeKeys.byInstitutions(institutionsIdsCsv ?? ''),
      options?.isActive ?? 'all',
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (institutionsIdsCsv) params.set('institutionsIds', institutionsIdsCsv);
      if (options?.isActive !== undefined) params.set('isActive', String(options.isActive));
      const res = await fetch(`/api/bos/member-types?${params.toString()}`);
      if (!res.ok) await parseError(res, 'Failed to fetch member types');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: options?.enabled ?? institutionsIdsCsv != null,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useCreateBosMemberType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateBosMemberTypeDto): Promise<BosMemberTypeRecord> => {
      const res = await fetch('/api/bos/member-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) await parseError(res, 'Failed to create member type');
      return res.json();
    },
    onSuccess: (created: BosMemberTypeRecord) => {
      upsertMemberTypeInCaches(queryClient, created);
    },
  });
}

export function useUpdateBosMemberType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateBosMemberTypeDto;
    }): Promise<BosMemberTypeRecord> => {
      const res = await fetch(`/api/bos/member-types/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) await parseError(res, 'Failed to update member type');
      return res.json();
    },
    onSuccess: (updated: BosMemberTypeRecord) => {
      upsertMemberTypeInCaches(queryClient, updated);
    },
  });
}

export function useDeleteBosMemberType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/bos/member-types/${id}`, { method: 'DELETE' });
      if (!res.ok) await parseError(res, 'Failed to delete member type');
      return res.json();
    },
    onSuccess: (_data, id) => {
      removeMemberTypeFromCaches(queryClient, id);
    },
  });
}
