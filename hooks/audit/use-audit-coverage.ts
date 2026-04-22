// hooks/audit/use-audit-coverage.ts
// React Query hook for audit cycle coverage (body × institution cells).
// Backing service: AuditCoverageService.getForCycle
// Route: GET /api/audit/coverage?cycle_id=&body=&institution_id=

import { useQuery } from '@tanstack/react-query';
import { AuditCoverageService, type CoverageOptions } from '@/lib/services/audit';

export const auditCoverageKeys = {
  all: ['audit', 'coverage'] as const,
  byCycle: (cycleId: string) =>
    [...auditCoverageKeys.all, 'byCycle', cycleId] as const,
  filtered: (cycleId: string, options: CoverageOptions) =>
    [...auditCoverageKeys.byCycle(cycleId), options] as const,
};

/**
 * Fetch per-(body × institution) coverage cells for an audit cycle.
 * Optionally narrow to one body and/or one institution.
 *
 * staleTime: 30s (dashboard refresh cadence matches cycle/attestation queries).
 */
export function useAuditCoverage(
  cycleId: string | undefined,
  options: CoverageOptions = {}
) {
  const { body, institutionId } = options;
  return useQuery({
    queryKey: cycleId
      ? auditCoverageKeys.filtered(cycleId, { body, institutionId })
      : auditCoverageKeys.all,
    queryFn: () =>
      cycleId
        ? AuditCoverageService.getForCycle(cycleId, { body, institutionId })
        : Promise.resolve([]),
    enabled: !!cycleId,
    staleTime: 30 * 1000,
  });
}
