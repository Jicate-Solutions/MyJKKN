// hooks/admission/use-loans.ts
// React Query hooks for Loan Connect & Financial Aid

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  LoanService,
  type LoanPartner,
  type LoanApplication,
  type CreatePartnerInput,
  type UpdatePartnerInput,
  type CreateApplicationInput,
  type UpdateApplicationInput,
  type LoanApplicationFilters,
  type LoanAnalyticsSummary,
} from '@/lib/services/admission/loan-service';

// Query keys for cache management
export const loanKeys = {
  all: ['loans'] as const,
  partners: (institutionId: string) => [...loanKeys.all, 'partners', institutionId] as const,
  partner: (partnerId: string) => [...loanKeys.all, 'partner', partnerId] as const,
  applications: (institutionId: string, filters?: LoanApplicationFilters) =>
    [...loanKeys.all, 'applications', institutionId, filters] as const,
  application: (applicationId: string) => [...loanKeys.all, 'application', applicationId] as const,
  analytics: (institutionId: string) => [...loanKeys.all, 'analytics', institutionId] as const,
};

// =============================================================================
// PARTNER HOOKS
// =============================================================================

/**
 * Hook to list all loan partners for an institution
 */
export function useLoanPartners(institutionId: string | undefined) {
  const query = useQuery({
    queryKey: loanKeys.partners(institutionId || ''),
    queryFn: () => LoanService.getPartners(institutionId!),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    partners: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get a single loan partner
 */
export function useLoanPartner(partnerId: string | undefined) {
  const query = useQuery({
    queryKey: loanKeys.partner(partnerId || ''),
    queryFn: () => LoanService.getPartner(partnerId!),
    enabled: !!partnerId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    partner: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// =============================================================================
// APPLICATION HOOKS
// =============================================================================

/**
 * Hook to list loan applications for an institution
 */
export function useLoanApplications(
  institutionId: string | undefined,
  filters?: LoanApplicationFilters
) {
  const query = useQuery({
    queryKey: loanKeys.applications(institutionId || '', filters),
    queryFn: () => LoanService.getApplications(institutionId!, filters),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  return {
    applications: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get a single loan application
 */
export function useLoanApplication(applicationId: string | undefined) {
  const query = useQuery({
    queryKey: loanKeys.application(applicationId || ''),
    queryFn: () => LoanService.getApplication(applicationId!),
    enabled: !!applicationId,
    staleTime: 2 * 60 * 1000,
  });

  return {
    application: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// =============================================================================
// ANALYTICS HOOKS
// =============================================================================

/**
 * Hook to get loan analytics for an institution
 */
export function useLoanAnalytics(institutionId: string | undefined) {
  const query = useQuery({
    queryKey: loanKeys.analytics(institutionId || ''),
    queryFn: () => LoanService.getAnalytics(institutionId!),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    analytics: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Hook for all loan-related mutations (partners + applications)
 */
export function useLoanMutations() {
  const queryClient = useQueryClient();

  // Partner mutations
  const createPartner = useMutation({
    mutationFn: ({ institutionId, input }: { institutionId: string; input: CreatePartnerInput }) =>
      LoanService.createPartner(institutionId, input),
    onSuccess: () => {
      toast.success('Loan partner added successfully');
      queryClient.invalidateQueries({ queryKey: loanKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add loan partner');
    },
  });

  const updatePartner = useMutation({
    mutationFn: ({ partnerId, input }: { partnerId: string; input: UpdatePartnerInput }) =>
      LoanService.updatePartner(partnerId, input),
    onSuccess: () => {
      toast.success('Loan partner updated successfully');
      queryClient.invalidateQueries({ queryKey: loanKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update loan partner');
    },
  });

  const deletePartner = useMutation({
    mutationFn: (partnerId: string) => LoanService.deletePartner(partnerId),
    onSuccess: () => {
      toast.success('Loan partner deactivated');
      queryClient.invalidateQueries({ queryKey: loanKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to deactivate loan partner');
    },
  });

  // Application mutations
  const createApplication = useMutation({
    mutationFn: ({ institutionId, input }: { institutionId: string; input: CreateApplicationInput }) =>
      LoanService.createApplication(institutionId, input),
    onSuccess: () => {
      toast.success('Loan application created successfully');
      queryClient.invalidateQueries({ queryKey: loanKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create loan application');
    },
  });

  const updateApplication = useMutation({
    mutationFn: ({ applicationId, input }: { applicationId: string; input: UpdateApplicationInput }) =>
      LoanService.updateApplication(applicationId, input),
    onSuccess: () => {
      toast.success('Loan application updated successfully');
      queryClient.invalidateQueries({ queryKey: loanKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update loan application');
    },
  });

  const deleteApplication = useMutation({
    mutationFn: (applicationId: string) => LoanService.deleteApplication(applicationId),
    onSuccess: () => {
      toast.success('Loan application deleted');
      queryClient.invalidateQueries({ queryKey: loanKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete loan application');
    },
  });

  return {
    createPartner,
    updatePartner,
    deletePartner,
    createApplication,
    updateApplication,
    deleteApplication,
  };
}

// =============================================================================
// HELPER HOOKS
// =============================================================================

/**
 * Hook for EMI calculation (pure math, no API calls)
 */
export function useEMICalculator() {
  const calculateEMI = (principal: number, annualRate: number, tenureMonths: number) =>
    LoanService.calculateEMI(principal, annualRate, tenureMonths);

  const calculateTotalInterest = (principal: number, annualRate: number, tenureMonths: number) =>
    LoanService.calculateTotalInterest(principal, annualRate, tenureMonths);

  const calculateTotalPayment = (principal: number, annualRate: number, tenureMonths: number) =>
    LoanService.calculateTotalPayment(principal, annualRate, tenureMonths);

  return {
    calculateEMI,
    calculateTotalInterest,
    calculateTotalPayment,
  };
}

/**
 * Hook for loan application status display
 */
export function useLoanStatusDisplay() {
  const getStatusBadge = (status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } => {
    const badges: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      draft: { label: 'Draft', variant: 'secondary' },
      submitted: { label: 'Submitted', variant: 'outline' },
      under_review: { label: 'Under Review', variant: 'outline' },
      documents_pending: { label: 'Docs Pending', variant: 'outline' },
      approved: { label: 'Approved', variant: 'default' },
      disbursed: { label: 'Disbursed', variant: 'default' },
      rejected: { label: 'Rejected', variant: 'destructive' },
    };
    return badges[status] || { label: status, variant: 'outline' };
  };

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      submitted: 'bg-blue-100 text-blue-700',
      under_review: 'bg-yellow-100 text-yellow-700',
      documents_pending: 'bg-orange-100 text-orange-700',
      approved: 'bg-green-100 text-green-700',
      disbursed: 'bg-purple-100 text-purple-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  return { getStatusBadge, getStatusColor };
}
