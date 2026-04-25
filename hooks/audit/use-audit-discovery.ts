// hooks/audit/use-audit-discovery.ts
// React Query hooks for AuditDiscoveryService — run saved discovery queries
// against the parameter catalog with paginated results.
//
// Consumers: /audit/parameters/[code] discovery tab, Lead Auditor dashboard.

import { useMutation } from '@tanstack/react-query';
import {
  AuditDiscoveryService,
  type DiscoveryQueryResult,
} from '@/lib/services/audit';

export const auditDiscoveryKeys = {
  all: ['audit', 'discovery'] as const,
  query: (
    parameterCode: string,
    cycleId: string,
    institutionId: string,
    page: number,
    pageSize: number
  ) =>
    [
      ...auditDiscoveryKeys.all,
      parameterCode,
      cycleId,
      institutionId,
      page,
      pageSize,
    ] as const,
  metadata: (parameterCode: string, institutionId: string) =>
    [...auditDiscoveryKeys.all, 'metadata', parameterCode, institutionId] as const,
};

export interface RunDiscoveryQueryVars {
  parameter_code: string;
  cycle_id: string;
  institution_id: string;
  page?: number;
  page_size?: number;
}

/**
 * Mutation for running a discovery query. Mutation (not useQuery) because the
 * Lead Auditor clicks "Run Query" explicitly — we don't want to auto-run on
 * mount and burn server resources.
 *
 * Posts to /api/audit/parameters/[code]/run-query so the SECURITY DEFINER
 * RPC runs with the user's session permissions.
 */
export function useRunDiscoveryQuery() {
  return useMutation<DiscoveryQueryResult, Error, RunDiscoveryQueryVars>({
    mutationFn: async (vars) => {
      const response = await fetch(
        `/api/audit/parameters/${encodeURIComponent(vars.parameter_code)}/run-query`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            cycle_id: vars.cycle_id,
            institution_id: vars.institution_id,
            page: vars.page ?? 1,
            page_size: vars.page_size ?? 100,
          }),
        }
      );

      const payload = (await response.json().catch(() => ({}))) as {
        data?: DiscoveryQueryResult;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? `Discovery query failed (${response.status})`);
      }
      if (!payload.data) {
        throw new Error('Discovery query returned no data envelope');
      }
      return payload.data;
    },
  });
}

/**
 * Client-side-only helper for UI to preview whether a parameter has a
 * discovery query configured. Does NOT call the RPC — just reads the
 * catalog row. Use this to decide whether to show the "Run Query" button.
 */
export async function fetchDiscoveryMetadata(
  parameterCode: string,
  institutionId: string
) {
  return AuditDiscoveryService.getQueryMetadata(parameterCode, institutionId);
}
