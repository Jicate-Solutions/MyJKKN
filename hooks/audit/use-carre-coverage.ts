// hooks/audit/use-carre-coverage.ts
// React Query hooks for the CARRE Coverage Map (RPC-backed — see
// lib/services/audit/carre-coverage-service.ts).
//
// useCarreCoverage()  — leadership coverage read (fn_carre_module_coverage).
// useSetAuditModule() — owner tags a CARRE cycle with its module; invalidates
//                       the coverage list + the CARRE audit list/detail so the
//                       coverage page and dashboards refresh.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CarreCoverageService } from '@/lib/services/audit/carre-coverage-service';
import { carreAuditKeys } from '@/hooks/audit/use-carre-audits';

export const carreCoverageKeys = {
  all: ['audit', 'carre', 'coverage'] as const,
  list: () => [...carreCoverageKeys.all, 'list'] as const,
};

export function useCarreCoverage() {
  return useQuery({
    queryKey: carreCoverageKeys.list(),
    queryFn: () => CarreCoverageService.getCoverage(),
    staleTime: 30 * 1000,
  });
}

export function useSetAuditModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { cycleId: string; moduleKey: string }) =>
      CarreCoverageService.setAuditModule(input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: carreCoverageKeys.list() });
      qc.invalidateQueries({ queryKey: carreAuditKeys.detail(vars.cycleId) });
      qc.invalidateQueries({ queryKey: carreAuditKeys.list() });
    },
  });
}
