import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { OnboardingService, type OnboardingFilters } from '@/lib/services/billing/onboarding/onboarding-service';
import { studentBillKeys } from '@/hooks/billing/use-student-bills';
import { learnerProfileKeys } from '@/hooks/use-learner-profiles';

// Query Keys
export const onboardingKeys = {
  all: ['billing-onboarding'] as const,
  lists: () => [...onboardingKeys.all, 'list'] as const,
  list: (filters: OnboardingFilters) => [...onboardingKeys.lists(), filters] as const,
};

// Hook to fetch onboarding learners with filters
export function useOnboardingLearners(filters: OnboardingFilters = {}) {
  return useQuery({
    queryKey: onboardingKeys.list(filters),
    queryFn: () => OnboardingService.getOnboardingLearners(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes
    // Keep previous page's data visible while next page is fetching, so
    // pagination feels instant instead of flashing skeletons. Standard
    // pattern across the repo (see hooks/staff/use-staff.ts).
    placeholderData: (prev) => prev,
  });
}

// Hook to mark a learner as account (sent to billing)
export function useMarkAsAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (learnerId: string) => OnboardingService.markAsAccount(learnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentBillKeys.lists() });
      toast.success('Learner sent to accounts for billing');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/** Result of a bulk-generate-bills operation, summarised for the toast. */
export interface BulkGenerateBillsResult {
  generated: number;          // learners for whom bills were created
  skipped: number;            // learners who already had bills (no-op)
  failed: number;             // learners that errored (e.g. no fee data)
  totalBillsCreated: number;  // sum of bill rows inserted across all learners
  errors: { learnerId: string; error: string }[];
}

/**
 * Bulk-generate bills for the supplied learner IDs. Sequential to avoid
 * overwhelming RLS / triggers and to give predictable failure ordering.
 * Skips learners who already have bills (idempotent at the service level).
 */
export function useBulkGenerateBills() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (learnerIds: string[]): Promise<BulkGenerateBillsResult> => {
      const result: BulkGenerateBillsResult = {
        generated: 0,
        skipped: 0,
        failed: 0,
        totalBillsCreated: 0,
        errors: [],
      };
      for (const id of learnerIds) {
        try {
          const created = await OnboardingService.createBillsFromProfile(id);
          if (created === 0) {
            result.skipped += 1;
          } else {
            result.generated += 1;
            result.totalBillsCreated += created;
          }
        } catch (err: any) {
          result.failed += 1;
          result.errors.push({
            learnerId: id,
            error: err?.message || 'Unknown error',
          });
        }
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentBillKeys.lists() });

      const parts: string[] = [];
      if (result.generated > 0) {
        parts.push(`${result.generated} learner(s) — ${result.totalBillsCreated} bill(s) created`);
      }
      if (result.skipped > 0) {
        parts.push(`${result.skipped} skipped (already had bills)`);
      }
      if (result.failed > 0) {
        parts.push(`${result.failed} failed`);
      }
      const msg = parts.length > 0 ? parts.join(' · ') : 'No learners processed';

      if (result.failed > 0 && result.generated === 0) {
        toast.error(msg, { duration: 6000 });
      } else if (result.failed > 0) {
        toast(msg, { icon: '⚠️', duration: 6000 });
      } else if (result.generated > 0) {
        toast.success(msg, { duration: 5000 });
      } else {
        toast(msg, { icon: 'ℹ️' });
      }
    },
    onError: (error: Error) => {
      toast.error(`Bulk generation failed: ${error.message}`);
    },
  });
}

// Hook to mark a learner as approved and activated
export function useMarkAsApproved() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (learnerId: string) => OnboardingService.markAsApproved(learnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentBillKeys.lists() });
      toast.success('Learner approved and activated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Hook to revert a learner back to approved status
export function useRevertToApproved() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (learnerId: string) => OnboardingService.revertToApproved(learnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentBillKeys.lists() });
      toast.success('Learner reverted to approved status');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
