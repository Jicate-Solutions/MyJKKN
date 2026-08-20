'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AllocationAuditService } from '@/lib/services/campus-living/allocation-audit-service';
import { usePermissions } from '@/hooks/use-permissions';
import type { AllocationAuditFilters } from '@/types/campus-living-allocation-audit';

export const allocationAuditKeys = {
  all: ['allocation-audit'] as const,
  list: (f: AllocationAuditFilters) => ['allocation-audit', 'list', f] as const,
};

/**
 * Whole audit set in one call. Deliberately NOT scoped to the viewer's
 * institution: the audit is super-admin-only and its whole point is the
 * cross-institution view.
 *
 * The fetch is held until permissions have loaded — isSuperAdmin is FALSE
 * during that window, and firing early would send an unauthorised request that
 * the RPC answers with 42501, surfacing as a red toast on every cold load.
 */
export function useAllocationAudit(filters: AllocationAuditFilters = {}) {
  const { isSuperAdmin, can, isLoading: permissionsLoading } = usePermissions();
  const allowed = isSuperAdmin || can('campus_living.allocations.audit');

  return useQuery({
    queryKey: allocationAuditKeys.list(filters),
    queryFn: () => AllocationAuditService.getAudit(filters),
    enabled: !permissionsLoading && allowed,
    staleTime: 60_000,
  });
}

/**
 * The audit row for ONE allocation, for the panel on the allocation detail
 * page. That page is reachable by anyone holding
 * `campus_living.allocations.view`, but the audit RPC answers everyone else
 * with 42501 — so `allowed` gates the fetch rather than letting a warden
 * opening a routine allocation collect an error toast. Callers must also hide
 * the panel on `allowed === false`; a disabled query just stays `undefined`.
 *
 * status: 'all' is deliberate — a superseded ('vacated') allocation still has
 * a detail page, and the RPC's 'active' default would return nothing for it.
 */
export function useAllocationAuditRow(allocationId: string | null | undefined) {
  const { isSuperAdmin, can, isLoading: permissionsLoading } = usePermissions();
  const allowed = isSuperAdmin || can('campus_living.allocations.audit');
  const filters: AllocationAuditFilters = { allocationId: allocationId ?? null, status: 'all' };

  const query = useQuery({
    queryKey: allocationAuditKeys.list(filters),
    queryFn: () => AllocationAuditService.getAudit(filters),
    enabled: !permissionsLoading && allowed && !!allocationId,
    staleTime: 60_000,
  });

  return { ...query, row: query.data?.[0] ?? null, allowed };
}

/**
 * Re-run the audit against the CURRENT configuration.
 *
 * fn_hostel_allocation_audit is STABLE and derives everything live — fee bands
 * from hostel_program_eligibility, the gating fee from billing_student_bills,
 * placement legality from hostel_room_eligibility_rules. Nothing is stored, so
 * there is no snapshot to rebuild: re-auditing is purely dropping the cached
 * answer and asking again. Edit a fee band, a room rule or a bill, press this,
 * and the verdicts move.
 *
 * Both caches are invalidated because both read the same configuration:
 * the audit rows, and fn_explain_allocation behind the "Why" drawer and the
 * detail-page panel. Refreshing one and not the other would let the drawer
 * justify a verdict the table no longer shows.
 */
export function useReaudit() {
  const queryClient = useQueryClient();
  const [isReauditing, setIsReauditing] = useState(false);

  const reaudit = useCallback(async () => {
    setIsReauditing(true);
    try {
      // invalidateQueries refetches the ACTIVE queries and resolves once they
      // settle, so awaiting this means the caller sees fresh data afterwards.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: allocationAuditKeys.all }),
        queryClient.invalidateQueries({
          queryKey: ['campus-living', 'allocation-batches', 'explain'],
        }),
      ]);
    } finally {
      setIsReauditing(false);
    }
  }, [queryClient]);

  return { reaudit, isReauditing, queryClient };
}
