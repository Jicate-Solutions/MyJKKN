// hooks/admission/use-sms-campaign.ts
// React Query hooks for SMS Campaign functionality

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  SMSCampaignService,
  type SendSMSInput,
  type BulkSMSInput,
  type SMSLogFilters,
  type SMSLog,
  type SMSCampaignStats,
  type SMSDeliveryStatus,
} from '@/lib/services/admission/sms-campaign-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const smsCampaignKeys = {
  all: ['sms-campaign'] as const,
  logs: () => [...smsCampaignKeys.all, 'logs'] as const,
  logsList: (filters: SMSLogFilters) => [...smsCampaignKeys.logs(), filters] as const,
  logDetail: (id: string) => [...smsCampaignKeys.logs(), 'detail', id] as const,
  stats: (institutionId: string, fromDate?: string, toDate?: string) =>
    [...smsCampaignKeys.all, 'stats', institutionId, fromDate, toDate] as const,
  leadLogs: (leadId: string) => [...smsCampaignKeys.logs(), 'lead', leadId] as const,
};

// ============================================================================
// SMS LOGS HOOKS
// ============================================================================

/**
 * Hook to fetch SMS logs with filters
 */
export function useSMSLogs(filters: SMSLogFilters) {
  const query = useQuery({
    queryKey: smsCampaignKeys.logsList(filters),
    queryFn: () => SMSCampaignService.getSMSLogs(filters),
    enabled: !!filters.institutionId,
  });

  return {
    logs: query.data?.logs || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch SMS logs for a specific lead
 */
export function useLeadSMSLogs(institutionId: string, leadId: string) {
  const query = useQuery({
    queryKey: smsCampaignKeys.leadLogs(leadId),
    queryFn: () =>
      SMSCampaignService.getSMSLogs({
        institutionId,
        leadId,
        limit: 50,
      }),
    enabled: !!institutionId && !!leadId,
  });

  return {
    logs: query.data?.logs || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch delivery status for a specific SMS
 */
export function useSMSDeliveryStatus(logId?: string) {
  const query = useQuery({
    queryKey: smsCampaignKeys.logDetail(logId || ''),
    queryFn: () => SMSCampaignService.getDeliveryStatus(logId!),
    enabled: !!logId,
    refetchInterval: (query) => {
      // Auto-refetch every 10 seconds if status is pending/queued
      const data = query.state.data as SMSLog | null | undefined;
      if (data && ['pending', 'queued', 'sent'].includes(data.status)) {
        return 10000;
      }
      return false;
    },
  });

  return {
    log: query.data,
    status: query.data?.status as SMSDeliveryStatus | undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

// ============================================================================
// SMS STATISTICS HOOKS
// ============================================================================

/**
 * Hook to fetch SMS campaign statistics
 */
export function useSMSCampaignStats(
  institutionId?: string,
  fromDate?: string,
  toDate?: string
) {
  const query = useQuery({
    queryKey: smsCampaignKeys.stats(institutionId || '', fromDate, toDate),
    queryFn: () => SMSCampaignService.getCampaignStats(institutionId!, fromDate, toDate),
    enabled: !!institutionId,
    staleTime: 60000, // 1 minute
  });

  return {
    stats: query.data || {
      totalSent: 0,
      totalDelivered: 0,
      totalFailed: 0,
      totalPending: 0,
      deliveryRate: 0,
      costTotal: 0,
      byDate: [],
    } as SMSCampaignStats,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

// ============================================================================
// SMS SEND MUTATIONS
// ============================================================================

/**
 * Hook for SMS sending mutations
 */
export function useSMSMutations() {
  const queryClient = useQueryClient();

  const invalidateQueries = (institutionId?: string, leadId?: string) => {
    queryClient.invalidateQueries({ queryKey: smsCampaignKeys.logs() });
    if (institutionId) {
      queryClient.invalidateQueries({
        queryKey: smsCampaignKeys.stats(institutionId),
      });
    }
    if (leadId) {
      queryClient.invalidateQueries({
        queryKey: smsCampaignKeys.leadLogs(leadId),
      });
    }
  };

  const sendSMS = useMutation({
    mutationFn: (input: SendSMSInput) => SMSCampaignService.sendCampaignSMS(input),
    onSuccess: (result: { success: boolean; error?: string }, variables) => {
      if (result.success) {
        toast.success('SMS sent successfully');
      } else {
        toast.error(result.error || 'Failed to send SMS');
      }
      invalidateQueries(variables.institutionId, variables.leadId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send SMS');
    },
  });

  const sendBulkSMS = useMutation({
    mutationFn: (input: BulkSMSInput) => SMSCampaignService.sendBulkSMS(input),
    onSuccess: (result: { totalSent: number; totalFailed: number }, variables) => {
      if (result.totalSent > 0) {
        toast.success(`Successfully sent ${result.totalSent} SMS messages`);
      }
      if (result.totalFailed > 0) {
        toast.warning(`${result.totalFailed} SMS messages failed to send`);
      }
      invalidateQueries(variables.institutionId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send bulk SMS');
    },
  });

  return {
    sendSMS,
    sendBulkSMS,
    isSending: sendSMS.isPending,
    isSendingBulk: sendBulkSMS.isPending,
  };
}

// ============================================================================
// HELPER HOOKS
// ============================================================================

/**
 * Hook for template variable helpers
 */
export function useSMSTemplateHelpers() {
  return {
    replaceVariables: SMSCampaignService.replaceTemplateVariables,
    buildLeadVariables: SMSCampaignService.buildLeadVariables,
    validateDLTTemplate: SMSCampaignService.validateDLTTemplate,
  };
}

/**
 * Hook to get SMS delivery status badge info
 */
export function useSMSStatusBadge(status: SMSDeliveryStatus) {
  const statusConfig: Record<
    SMSDeliveryStatus,
    { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; color: string }
  > = {
    pending: { label: 'Pending', variant: 'outline', color: 'text-yellow-600' },
    queued: { label: 'Queued', variant: 'secondary', color: 'text-blue-600' },
    sent: { label: 'Sent', variant: 'default', color: 'text-blue-600' },
    delivered: { label: 'Delivered', variant: 'default', color: 'text-green-600' },
    failed: { label: 'Failed', variant: 'destructive', color: 'text-red-600' },
    undelivered: { label: 'Undelivered', variant: 'destructive', color: 'text-orange-600' },
    rejected: { label: 'Rejected', variant: 'destructive', color: 'text-red-600' },
  };

  return statusConfig[status] || statusConfig.pending;
}
