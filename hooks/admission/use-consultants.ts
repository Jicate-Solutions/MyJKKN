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
      const totalEarned = consultant?.total_commission_earned ?? 0;
      const pending = consultant?.pending_commission ?? 0;
      return {
        total_earned: totalEarned,
        pending,
        paid: Math.max(0, totalEarned - pending)
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
    mutationFn: async (batchId: string) => {
      return ConsultantService.approvePayoutBatch(batchId, 'system');
    },
    onSuccess: () => {
      toast.success('Payout processed successfully');
      queryClient.invalidateQueries({ queryKey: ['consultant-commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commission-transactions'] });
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
    mutationFn: async (rewardId: string) => {
      return ConsultantService.redeemReward(rewardId);
    },
    onSuccess: () => {
      toast.success('Reward redeemed successfully');
      queryClient.invalidateQueries({ queryKey: ['consultant-rewards'] });
      queryClient.invalidateQueries({ queryKey: ['rewards'] });
      queryClient.invalidateQueries({ queryKey: ['reward-stats'] });
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
        leadsReferred: consultant.total_leads_referred ?? 0,
        conversions: consultant.total_conversions ?? 0,
        conversionRate: consultant.conversion_rate ?? 0,
        totalCommissionEarned: consultant.total_commission_earned ?? 0,
        pendingCommission: consultant.pending_commission ?? 0,
        relationshipScore: consultant.relationship_score ?? 0,
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
      if (typeof data === 'string') {
        return ConsultantService.processClawback(data, 'Clawback requested', 'system');
      }
      return ConsultantService.processClawback(
        data.id,
        data.reason || 'Clawback requested',
        data.processedBy || 'system'
      );
    },
    onSuccess: () => {
      toast.success('Clawback processed successfully');
      queryClient.invalidateQueries({ queryKey: ['commission-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['consultant-commissions'] });
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
      const configIdToUse = id || configId;
      if (!configIdToUse) throw new Error('Config ID is required');
      return ConsultantService.updateRewardConfig(configIdToUse, data);
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
      return ConsultantService.deleteRewardConfig(configId);
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
      if (typeof input === 'string') {
        return ConsultantService.approveReward(input, 'system');
      }
      return ConsultantService.approveReward(
        input.id,
        input.approvedBy || 'system',
        input.notes
      );
    },
    onSuccess: () => {
      toast.success('Reward approved successfully');
      queryClient.invalidateQueries({ queryKey: ['consultant-rewards'] });
      queryClient.invalidateQueries({ queryKey: ['rewards'] });
      queryClient.invalidateQueries({ queryKey: ['reward-stats'] });
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
      if (typeof input === 'string') {
        return ConsultantService.redeemReward(input);
      }
      return ConsultantService.redeemReward(input.id, input.redemptionReference);
    },
    onSuccess: () => {
      toast.success('Reward redeemed successfully');
      queryClient.invalidateQueries({ queryKey: ['consultant-rewards'] });
      queryClient.invalidateQueries({ queryKey: ['referrer-rewards'] });
      queryClient.invalidateQueries({ queryKey: ['rewards'] });
      queryClient.invalidateQueries({ queryKey: ['reward-stats'] });
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
      if (typeof input === 'string') {
        return ConsultantService.rejectReward(input, 'system', 'Rejected');
      }
      return ConsultantService.rejectReward(
        input.id,
        input.rejectedBy || 'system',
        input.reason || 'Rejected'
      );
    },
    onSuccess: () => {
      toast.success('Reward rejected');
      queryClient.invalidateQueries({ queryKey: ['consultant-rewards'] });
      queryClient.invalidateQueries({ queryKey: ['rewards'] });
      queryClient.invalidateQueries({ queryKey: ['reward-stats'] });
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
      const stats = await ConsultantService.getRewardStats(institutionId);
      return {
        totalRewards: stats.totalRewards,
        pendingRewards: stats.pendingRewards,
        approvedRewards: stats.approvedRewards,
        redeemedRewards: stats.redeemedRewards,
        totalValue: stats.totalValuePending,
        totalValueRedeemed: stats.totalValueRedeemed
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
      return ConsultantService.getReferrerRewards(referrerId, statuses);
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
      // Derive source performance from consultant data by type
      const stats = await ConsultantService.getDashboardStats(institutionId);
      return Object.entries(stats.consultants_by_type || {}).map(([type, _count]) => ({
        sourceId: type,
        sourceName: type.charAt(0).toUpperCase() + type.slice(1),
        sourceType: type,
        leadsGenerated: 0,
        conversions: 0,
        conversionRate: 0,
        costPerLead: undefined,
        costPerConversion: undefined
      }));
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
      const configIdToUse = id || configId;
      if (!configIdToUse) throw new Error('Config ID is required');
      return ConsultantService.toggleRewardConfigActive(configIdToUse, isActive);
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
      const txId = id || transactionId;
      if (!txId) throw new Error('Transaction ID is required');
      return ConsultantService.updateCommissionTransactionStatus(
        txId,
        status,
        changedBy || 'system',
        reason
      );
    },
    onSuccess: () => {
      toast.success('Commission status updated');
      queryClient.invalidateQueries({ queryKey: ['commission-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['consultant-commissions'] });
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
      return ConsultantService.submitLeadFromPortal(data);
    },
    onSuccess: () => {
      toast.success('Lead submitted successfully');
      queryClient.invalidateQueries({ queryKey: ['portal-leads'] });
      queryClient.invalidateQueries({ queryKey: ['consultant-referrals'] });
      queryClient.invalidateQueries({ queryKey: ['lead-attributions'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit lead');
    }
  });
}

export function useLeadAttributions(filters: string | { institution_id?: string; consultant_id?: string; page?: number; limit?: number } | null | undefined) {
  const filterKey = typeof filters === 'string' ? { lead_id: filters } : filters;

  const query = useQuery({
    queryKey: ['lead-attributions', filterKey],
    queryFn: async () => {
      if (typeof filters === 'string') {
        const result = await ConsultantService.getLeadAttributions({ lead_id: filters });
        return { data: result.data, total: result.total, totalPages: Math.ceil(result.total / 20) };
      }
      if (filters && typeof filters === 'object') {
        const result = await ConsultantService.getLeadAttributions(filters as any);
        const limit = (filters as any).limit || 20;
        return { data: result.data, total: result.total, totalPages: Math.ceil(result.total / limit) };
      }
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
