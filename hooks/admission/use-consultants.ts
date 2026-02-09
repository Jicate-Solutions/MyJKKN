// Consultant Hooks
// Uses ConsultantService for data operations

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import type {
  ConsultantFilters,
  CommissionTransactionFilters,
  RewardFilters
} from '@/types/education-consultants';

// ============================================
// CONSULTANTS CRUD
// ============================================

export function useConsultants(filters: ConsultantFilters) {
  return useQuery({
    queryKey: ['consultants', filters],
    queryFn: () => ConsultantService.getConsultants(filters),
    enabled: !!filters.institution_id
  });
}

export function useConsultant(id: string) {
  return useQuery({
    queryKey: ['consultant', id],
    queryFn: () => ConsultantService.getConsultantById(id),
    enabled: !!id
  });
}

export function useConsultantMutations() {
  const queryClient = useQueryClient();

  const createConsultant = useMutation({
    mutationFn: ConsultantService.createConsultant,
    onSuccess: () => {
      toast.success('Consultant created successfully');
      queryClient.invalidateQueries({ queryKey: ['consultants'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create consultant');
    }
  });

  const updateConsultant = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      ConsultantService.updateConsultant(id, data),
    onSuccess: () => {
      toast.success('Consultant updated successfully');
      queryClient.invalidateQueries({ queryKey: ['consultants'] });
      queryClient.invalidateQueries({ queryKey: ['consultant'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update consultant');
    }
  });

  const deleteConsultant = useMutation({
    mutationFn: ConsultantService.deleteConsultant,
    onSuccess: () => {
      toast.success('Consultant deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['consultants'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete consultant');
    }
  });

  return { createConsultant, updateConsultant, deleteConsultant };
}

// ============================================
// COMMISSIONS
// ============================================

export function useConsultantCommissions(filters: CommissionTransactionFilters) {
  return useQuery({
    queryKey: ['consultant-commissions', filters],
    queryFn: () => ConsultantService.getCommissionTransactions(filters),
    enabled: !!filters.institution_id
  });
}

export function useCommissionSummary(consultantId: string) {
  return useQuery({
    queryKey: ['commission-summary', consultantId],
    queryFn: async () => {
      // Get consultant to access commission data
      const consultant = await ConsultantService.getConsultantById(consultantId);
      return {
        total_earned: consultant?.total_commission_earned || 0,
        pending: consultant?.pending_commission || 0,
        paid: (consultant?.total_commission_earned || 0) - (consultant?.pending_commission || 0)
      };
    },
    enabled: !!consultantId
  });
}

export function useCommissionMutations() {
  const queryClient = useQueryClient();

  const createCommission = useMutation({
    mutationFn: ConsultantService.createCommissionTransaction,
    onSuccess: () => {
      toast.success('Commission recorded successfully');
      queryClient.invalidateQueries({ queryKey: ['consultant-commissions'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to record commission');
    }
  });

  const processPayouts = useMutation({
    mutationFn: async (_batchId: string) => {
      // TODO: Implement payout processing via ConsultantService
      throw new Error('Payout processing is not yet implemented');
    },
    onSuccess: () => {
      toast.success('Payout processed successfully');
      queryClient.invalidateQueries({ queryKey: ['consultant-commissions'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to process payout');
    }
  });

  return { createCommission, processPayouts };
}

// ============================================
// REWARDS
// ============================================

export function useConsultantRewards(filters: RewardFilters) {
  return useQuery({
    queryKey: ['consultant-rewards', filters],
    queryFn: () => ConsultantService.getRewards(filters),
    enabled: !!filters.institution_id
  });
}

export function useRewardMutations() {
  const queryClient = useQueryClient();

  const createReward = useMutation({
    mutationFn: ConsultantService.createReward,
    onSuccess: () => {
      toast.success('Reward created successfully');
      queryClient.invalidateQueries({ queryKey: ['consultant-rewards'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create reward');
    }
  });

  const redeemReward = useMutation({
    mutationFn: async (_rewardId: string) => {
      // TODO: Implement reward redemption via ConsultantService
      throw new Error('Reward redemption is not yet implemented');
    },
    onSuccess: () => {
      toast.success('Reward redeemed successfully');
      queryClient.invalidateQueries({ queryKey: ['consultant-rewards'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to redeem reward');
    }
  });

  return { createReward, redeemReward };
}

// ============================================
// DASHBOARD & ANALYTICS
// ============================================

export function useConsultantDashboardStats(institutionId: string) {
  return useQuery({
    queryKey: ['consultant-dashboard-stats', institutionId],
    queryFn: () => ConsultantService.getDashboardStats(institutionId),
    enabled: !!institutionId
  });
}

export function useConsultantPerformance(consultantId: string) {
  return useQuery({
    queryKey: ['consultant-performance', consultantId],
    queryFn: async () => {
      // Get consultant data and calculate performance metrics
      const consultant = await ConsultantService.getConsultantById(consultantId);
      if (!consultant) return null;

      return {
        leadsReferred: consultant.total_leads_referred || 0,
        conversions: consultant.total_conversions || 0,
        conversionRate: consultant.conversion_rate || 0,
        totalCommissionEarned: consultant.total_commission_earned || 0,
        pendingCommission: consultant.pending_commission || 0,
        relationshipScore: consultant.relationship_score || 0,
        tier: consultant.tier || 'bronze',
        status: consultant.status || 'active'
      };
    },
    enabled: !!consultantId
  });
}

// ============================================
// DROPDOWN HOOKS
// ============================================

export function useConsultantsForDropdown(institutionId: string) {
  return useQuery({
    queryKey: ['consultants-dropdown', institutionId],
    queryFn: async () => {
      const result = await ConsultantService.getConsultants({
        institution_id: institutionId,
        status: 'active',
        limit: 1000
      });
      return result.data.map(c => ({
        id: c.id,
        name: c.name,
        value: c.id,
        label: c.name
      }));
    },
    enabled: !!institutionId
  });
}

// ============================================
// COMMISSION TRANSACTIONS
// ============================================

export function useCommissionTransactions(filters: CommissionTransactionFilters) {
  return useQuery({
    queryKey: ['commission-transactions', filters],
    queryFn: () => ConsultantService.getCommissionTransactions(filters),
    enabled: !!filters.institution_id
  });
}

export function useProcessClawback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: string | { id: string; reason?: string; processedBy?: string }) => {
      // TODO: Implement clawback processing
      throw new Error('Clawback processing is not yet implemented');
    },
    onSuccess: () => {
      toast.success('Clawback processed successfully');
      queryClient.invalidateQueries({ queryKey: ['commission-transactions'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to process clawback');
    }
  });
}

// ============================================
// REWARD CONFIG MUTATIONS
// ============================================

export function useCreateRewardConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { data: any; createdBy?: string }) => {
      // Extract data from wrapped object if present
      const configData = input.data || input;
      const createdBy = input.createdBy || 'system';
      return ConsultantService.createRewardConfig(configData, createdBy);
    },
    onSuccess: () => {
      toast.success('Reward configuration created successfully');
      queryClient.invalidateQueries({ queryKey: ['reward-configs'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create reward configuration');
    }
  });
}

export function useUpdateRewardConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, configId, data }: { id?: string; configId?: string; data: any }) => {
      // TODO: Implement update reward config
      throw new Error('Update reward configuration is not yet implemented');
    },
    onSuccess: () => {
      toast.success('Reward configuration updated successfully');
      queryClient.invalidateQueries({ queryKey: ['reward-configs'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update reward configuration');
    }
  });
}

export function useDeleteRewardConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (configId: string) => {
      // TODO: Implement delete
      throw new Error('Delete reward configuration is not yet implemented');
    },
    onSuccess: () => {
      toast.success('Reward configuration deleted');
      queryClient.invalidateQueries({ queryKey: ['reward-configs'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete reward configuration');
    }
  });
}

// ============================================
// REWARD ACTIONS
// ============================================

export function useApproveReward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: string | { id: string; approvedBy?: string; notes?: string }) => {
      // TODO: Implement approval
      throw new Error('Reward approval is not yet implemented');
    },
    onSuccess: () => {
      toast.success('Reward approved successfully');
      queryClient.invalidateQueries({ queryKey: ['consultant-rewards'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to approve reward');
    }
  });
}

export function useRedeemReward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: string | { id: string; redemptionReference?: string }) => {
      // TODO: Implement redemption
      throw new Error('Reward redemption is not yet implemented');
    },
    onSuccess: () => {
      toast.success('Reward redeemed successfully');
      queryClient.invalidateQueries({ queryKey: ['consultant-rewards'] });
      queryClient.invalidateQueries({ queryKey: ['referrer-rewards'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to redeem reward');
    }
  });
}

export function useRejectReward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: string | { id: string; rejectedBy?: string; reason?: string }) => {
      // TODO: Implement rejection
      throw new Error('Reward rejection is not yet implemented');
    },
    onSuccess: () => {
      toast.success('Reward rejected');
      queryClient.invalidateQueries({ queryKey: ['consultant-rewards'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reject reward');
    }
  });
}

export function useRewardConfigs(institutionId: string) {
  return useQuery({
    queryKey: ['reward-configs', institutionId],
    queryFn: () => ConsultantService.getRewardConfigs(institutionId),
    enabled: !!institutionId
  });
}

export function useRewardStats(institutionId: string) {
  return useQuery({
    queryKey: ['reward-stats', institutionId],
    queryFn: async () => {
      // TODO: Implement
      return {
        totalRewards: 0,
        pendingRewards: 0,
        approvedRewards: 0,
        redeemedRewards: 0,
        totalValue: 0,
        totalValueRedeemed: 0
      };
    },
    enabled: !!institutionId
  });
}

export function useRewards(filters: RewardFilters) {
  return useQuery({
    queryKey: ['rewards', filters],
    queryFn: () => ConsultantService.getRewards(filters),
    enabled: !!filters.institution_id
  });
}

export function useReferrerRewards(referrerId: string, statuses?: string[]) {
  const query = useQuery({
    queryKey: ['referrer-rewards', referrerId, statuses],
    queryFn: async () => {
      // TODO: Implement - returns array of rewards
      return [] as any[];
    },
    enabled: !!referrerId
  });

  return {
    data: query.data || [],
    rewards: query.data || [],
    total: query.data?.length || 0,
    isLoading: query.isLoading,
    refetch: query.refetch
  };
}

interface SourcePerformanceData {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  leadsGenerated: number;
  conversions: number;
  conversionRate: number;
  costPerLead?: number;
  costPerConversion?: number;
}

export function useSourcePerformance(institutionId: string) {
  const query = useQuery<SourcePerformanceData[]>({
    queryKey: ['source-performance', institutionId],
    queryFn: async (): Promise<SourcePerformanceData[]> => {
      // TODO: Implement actual source performance fetching
      return [];
    },
    enabled: !!institutionId
  });

  return {
    sources: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  };
}

export function useToggleRewardConfigActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, configId, isActive }: { id?: string; configId?: string; isActive: boolean }) => {
      // TODO: Implement toggle active status
      throw new Error('Toggle reward config active status is not yet implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reward-configs'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to toggle reward configuration');
    }
  });
}

export function useUpdateCommissionTransactionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, transactionId, status, changedBy, reason }: {
      id?: string;
      transactionId?: string;
      status: string;
      changedBy?: string;
      reason?: string;
    }) => {
      // TODO: Implement commission status update
      throw new Error('Update commission transaction status is not yet implemented');
    },
    onSuccess: () => {
      toast.success('Commission status updated');
      queryClient.invalidateQueries({ queryKey: ['commission-transactions'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update commission status');
    }
  });
}

export function useUpdateConsultant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      ConsultantService.updateConsultant(id, data),
    onSuccess: () => {
      toast.success('Consultant updated successfully');
      queryClient.invalidateQueries({ queryKey: ['consultants'] });
      queryClient.invalidateQueries({ queryKey: ['consultant'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update consultant');
    }
  });
}

export function useSubmitLeadFromPortal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      // TODO: Implement portal lead submission
      throw new Error('Submit lead from portal is not yet implemented');
    },
    onSuccess: () => {
      toast.success('Lead submitted successfully');
      queryClient.invalidateQueries({ queryKey: ['portal-leads'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit lead');
    }
  });
}

export function useLeadAttributions(filters: string | { institution_id?: string; consultant_id?: string; page?: number; limit?: number } | null | undefined) {
  const filterKey = typeof filters === 'string' ? { leadId: filters } : filters;

  const query = useQuery({
    queryKey: ['lead-attributions', filterKey],
    queryFn: async () => {
      // TODO: Implement lead attribution fetching
      return { data: [], total: 0, totalPages: 0 };
    },
    enabled: !!filters
  });

  return {
    data: query.data,
    attributions: query.data?.data || [],
    total: query.data?.total || 0,
    totalPages: query.data?.totalPages || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch
  };
}
