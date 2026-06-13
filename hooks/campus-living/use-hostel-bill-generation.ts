import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HostelBillGenerationService,
  type LearnerGenerationPlan,
} from '@/lib/services/campus-living/hostel-bill-generation-service';

/** Dry-run preview (imperative — call when operator clicks "Preview selected"). */
export function useHostelBillDryRun() {
  return useMutation<
    LearnerGenerationPlan[],
    Error,
    { hostelYearId: string; learnerIds: string[] }
  >({
    mutationFn: ({ hostelYearId, learnerIds }) =>
      HostelBillGenerationService.run(hostelYearId, learnerIds, true),
  });
}

/** Commit generation. Invalidates billing + resident caches so statuses refresh. */
export function useGenerateHostelBills() {
  const qc = useQueryClient();
  return useMutation<
    LearnerGenerationPlan[],
    Error,
    { hostelYearId: string; learnerIds: string[] }
  >({
    mutationFn: ({ hostelYearId, learnerIds }) =>
      HostelBillGenerationService.run(hostelYearId, learnerIds, false),
    onSuccess: () => {
      // Invalidate all campus-living queries (residents, fee resolution, etc.)
      qc.invalidateQueries({ queryKey: ['campus-living'] });
      // Invalidate student-bills (the billing module's per-learner bill list)
      qc.invalidateQueries({ queryKey: ['student-bills'] });
      // Invalidate hostel-residents (allocation/billing status badges on the residents list)
      qc.invalidateQueries({ queryKey: ['hostel-residents'] });
    },
  });
}
