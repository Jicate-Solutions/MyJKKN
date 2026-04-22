// hooks/audit/use-audit-parameters.ts

import { useQuery } from '@tanstack/react-query';
import { AuditParameterCatalogService } from '@/lib/services/audit';

export const auditParameterKeys = {
  all: ['audit', 'parameters'] as const,
  system: () => [...auditParameterKeys.all, 'system'] as const,
  forInstitution: (id: string) => [...auditParameterKeys.all, 'institution', id] as const,
  byFramework: () => [...auditParameterKeys.all, 'by-framework'] as const,
};

export function useSystemParameters() {
  return useQuery({
    queryKey: auditParameterKeys.system(),
    queryFn: () => AuditParameterCatalogService.listSystem(),
    staleTime: 5 * 60 * 1000, // Static-ish, cache longer
  });
}

export function useParametersForInstitution(institutionId: string | undefined) {
  return useQuery({
    queryKey: auditParameterKeys.forInstitution(institutionId ?? ''),
    queryFn: () =>
      institutionId
        ? AuditParameterCatalogService.listForInstitution(institutionId)
        : Promise.resolve([]),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useParameterCountByFramework() {
  return useQuery({
    queryKey: auditParameterKeys.byFramework(),
    queryFn: () => AuditParameterCatalogService.countByFramework(),
    staleTime: 10 * 60 * 1000,
  });
}
