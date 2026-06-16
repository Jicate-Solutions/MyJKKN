import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  HostelBillGenerationService,
  type LearnerGenerationPlan,
  type HostelYearBillStats,
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

/** Aggregate billed-vs-not-billed stats for the selected hostel year. Auto-refreshes
 *  after generation (the generate mutation invalidates the ['campus-living'] namespace). */
export function useHostelYearBillStats(hostelYearId: string | null) {
  return useQuery<HostelYearBillStats>({
    queryKey: ['campus-living', 'generation-stats', hostelYearId],
    queryFn: () => HostelBillGenerationService.getStats(hostelYearId!),
    enabled: !!hostelYearId,
  });
}
