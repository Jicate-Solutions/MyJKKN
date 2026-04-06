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
