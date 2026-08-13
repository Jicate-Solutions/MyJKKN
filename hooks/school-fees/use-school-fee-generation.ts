// hooks/school-fees/use-school-fee-generation.ts

import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { SchoolFeeGenerationService } from '@/lib/services/school-fees/school-fee-generation-service';
import type { GenerationResult } from '@/types/school-fees';

export const SCHOOL_FEE_GENERATION_KEYS = {
  all: ['school-fee-generation'] as const,
  preview: (institutionId?: string, academicYearId?: string) =>
    ['school-fee-generation', 'preview', institutionId, academicYearId] as const,
  runs: (institutionId?: string, academicYearId?: string) =>
    ['school-fee-generation', 'runs', institutionId, academicYearId] as const,
};

export function useSchoolFeeGeneration(institutionId?: string, academicYearId?: string) {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<GenerationResult | null>(null);

  const preview = useQuery({
    queryKey: SCHOOL_FEE_GENERATION_KEYS.preview(institutionId, academicYearId),
    queryFn: () => SchoolFeeGenerationService.preview(institutionId!, academicYearId!),
    enabled: Boolean(institutionId && academicYearId),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  const runs = useQuery({
    queryKey: SCHOOL_FEE_GENERATION_KEYS.runs(institutionId, academicYearId),
    queryFn: () => SchoolFeeGenerationService.listRuns(institutionId!, academicYearId!),
    enabled: Boolean(institutionId && academicYearId),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  const runMutation = useMutation({
    mutationFn: (dryRun: boolean) =>
      SchoolFeeGenerationService.generate(institutionId!, academicYearId!, dryRun),
    onSuccess: (result) => {
      setLastResult(result);

      // A committed run creates bills AND locks the plans it billed from, so
      // the plan list, the resolver and the generation preview are all stale.
      queryClient.invalidateQueries({ queryKey: SCHOOL_FEE_GENERATION_KEYS.all });
      if (!result.dry_run) {
        queryClient.invalidateQueries({ queryKey: ['school-fee-plans'] });
        queryClient.invalidateQueries({ queryKey: ['school-fee-resolution'] });
      }

      if (result.dry_run) {
        toast.success(`Dry run complete — ${result.learners_matched} learner(s) checked`);
      } else if (result.bills_created > 0) {
        toast.success(`Generated ${result.bills_created} bill(s)`);
      } else {
        toast('Nothing new to generate — every eligible learner already has bills.');
      }
    },
    onError: (error: Error) => toast.error(error.message || 'Fee generation failed'),
  });

  const rows = preview.data ?? [];

  const summary = {
    classes: rows.length,
    ready: rows.filter((r) => r.status === 'ready').length,
    learners: rows.reduce((s, r) => s + r.learners, 0),
    billable: rows.reduce((s, r) => s + r.billable, 0),
    alreadyBilled: rows.reduce((s, r) => s + r.already_billed, 0),
    net: rows.filter((r) => r.status === 'ready').reduce((s, r) => s + r.year_net, 0),
    blocked: rows.filter((r) => r.status === 'no_calendar' || r.status === 'no_plan').length,
  };

  return {
    rows,
    summary,
    runs: runs.data ?? [],
    lastResult,
    loading: preview.isLoading,
    running: runMutation.isPending,
    error: preview.error ? (preview.error as Error).message : null,
    dryRun: useCallback(async () => runMutation.mutateAsync(true), [runMutation]),
    commit: useCallback(async () => runMutation.mutateAsync(false), [runMutation]),
    refetch: preview.refetch,
  };
}
