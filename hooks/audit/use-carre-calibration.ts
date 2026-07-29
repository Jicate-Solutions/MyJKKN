// hooks/audit/use-carre-calibration.ts
// React Query hooks for the CARRE predict-then-see calibration mirror
// (see lib/services/audit/carre-calibration-service.ts for the contract).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CarreCalibrationService } from '@/lib/services/audit/carre-calibration-service';

export const carreCalibrationKeys = {
  all: ['audit', 'carre-calibration'] as const,
  context: (cycleId: string) => [...carreCalibrationKeys.all, 'context', cycleId] as const,
  mirror: (cycleId: string | undefined) =>
    [...carreCalibrationKeys.all, 'mirror', cycleId ?? 'all'] as const,
};

/** Cycle + frozen catalog for the prediction page (team members only). */
export function useCarrePredictContext(cycleId: string | undefined) {
  return useQuery({
    queryKey: carreCalibrationKeys.context(cycleId ?? ''),
    queryFn: () => CarreCalibrationService.getPredictContext(cycleId!),
    enabled: !!cycleId,
  });
}

/** The caller's predictions + k≥3 reveals (+ errors). cycleId omitted = all. */
export function useCarreCalibrationMirror(cycleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: carreCalibrationKeys.mirror(cycleId),
    queryFn: () => CarreCalibrationService.getMirror(cycleId),
    enabled,
    staleTime: 30 * 1000,
  });
}

/** Upsert one prediction (frozen once revealed; A3 data-gated server-side). */
export function useCarrePredictMedian() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { cycleId: string; parameterCode: string; predicted: number }) =>
      CarreCalibrationService.predictMedian(input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: carreCalibrationKeys.mirror(vars.cycleId) });
      void qc.invalidateQueries({ queryKey: carreCalibrationKeys.mirror(undefined) });
    },
  });
}
