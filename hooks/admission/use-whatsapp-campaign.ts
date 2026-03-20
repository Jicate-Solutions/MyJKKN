// hooks/admission/use-whatsapp-campaign.ts
// React Query hooks for WhatsApp campaign functionality

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  WhatsAppCampaignService,
  type WhatsAppMessage,
  type WhatsAppMessageFilters,
  type WhatsAppCampaignStats,
  type SendCampaignMessageInput,
  type WhatsAppDeliveryStatus,
} from '@/lib/services/admission/whatsapp-campaign-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const whatsappCampaignKeys = {
  all: ['whatsapp-campaign'] as const,
  messages: () => [...whatsappCampaignKeys.all, 'messages'] as const,
  messageList: (filters: WhatsAppMessageFilters) => [...whatsappCampaignKeys.messages(), filters] as const,
  message: (id: string) => [...whatsappCampaignKeys.messages(), 'detail', id] as const,
  leadMessages: (leadId: string) => [...whatsappCampaignKeys.messages(), 'lead', leadId] as const,
  stats: (institutionId: string, dateFrom?: string, dateTo?: string) =>
    [...whatsappCampaignKeys.all, 'stats', institutionId, dateFrom, dateTo] as const,
};

// ============================================================================
// MESSAGE HOOKS
// ============================================================================

/**
 * Hook to fetch WhatsApp messages with filters
 */
export function useWhatsAppMessages(filters: WhatsAppMessageFilters) {
  const query = useQuery({
    queryKey: whatsappCampaignKeys.messageList(filters),
    queryFn: () => WhatsAppCampaignService.getMessages(filters),
    enabled: !!filters.institutionId,
  });

  return {
    messages: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch messages for a specific lead
 */
export function useLeadWhatsAppMessages(leadId?: string) {
  const query = useQuery({
    queryKey: whatsappCampaignKeys.leadMessages(leadId || ''),
    queryFn: () => WhatsAppCampaignService.getLeadMessages(leadId!),
    enabled: !!leadId,
  });

  return {
    messages: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch a single message status
 */
export function useWhatsAppMessageStatus(messageId?: string) {
  const query = useQuery({
    queryKey: whatsappCampaignKeys.message(messageId || ''),
    queryFn: () => WhatsAppCampaignService.getDeliveryStatus(messageId!),
    enabled: !!messageId,
    refetchInterval: (query) => {
      // Auto-refetch pending/sent messages to check for delivery updates
      const data = query.state.data;
      if (data?.delivery_status === 'pending' || data?.delivery_status === 'sent') {
        return 5000; // Refetch every 5 seconds
      }
      return false;
    },
  });

  return {
    message: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// STATISTICS HOOKS
// ============================================================================

/**
 * Hook to fetch WhatsApp campaign statistics
 */
export function useWhatsAppCampaignStats(
  institutionId?: string,
  dateFrom?: string,
  dateTo?: string
) {
  const query = useQuery({
    queryKey: whatsappCampaignKeys.stats(institutionId || '', dateFrom, dateTo),
    queryFn: () => WhatsAppCampaignService.getCampaignStats(institutionId!, dateFrom, dateTo),
    enabled: !!institutionId,
    staleTime: 30000, // 30 seconds
  });

  return {
    stats: query.data || {
      totalMessages: 0,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      failedCount: 0,
      pendingCount: 0,
      deliveryRate: 0,
      readRate: 0,
    } as WhatsAppCampaignStats,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Hook for WhatsApp message mutations (send, update status)
 */
export function useWhatsAppCampaignMutations() {
  const queryClient = useQueryClient();

  const invalidateQueries = (institutionId?: string, leadId?: string) => {
    queryClient.invalidateQueries({ queryKey: whatsappCampaignKeys.messages() });
    if (institutionId) {
      queryClient.invalidateQueries({ queryKey: whatsappCampaignKeys.stats(institutionId) });
    }
    if (leadId) {
      queryClient.invalidateQueries({ queryKey: whatsappCampaignKeys.leadMessages(leadId) });
    }
  };

  const sendMessage = useMutation({
    mutationFn: (input: SendCampaignMessageInput) =>
      WhatsAppCampaignService.sendCampaignMessage(input),
    onSuccess: (result, variables) => {
      if (result.success) {
        toast.success('WhatsApp message sent');
        invalidateQueries(variables.institution_id, variables.lead_id);
      } else {
        toast.error(result.error || 'Failed to send message');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send WhatsApp message');
    },
  });

  const sendBulkMessages = useMutation({
    mutationFn: (messages: SendCampaignMessageInput[]) =>
      WhatsAppCampaignService.sendBulkMessages(messages),
    onSuccess: (result) => {
      if (result.succeeded > 0) {
        toast.success(`Sent ${result.succeeded} of ${result.total} messages`);
      }
      if (result.failed > 0) {
        toast.warning(`${result.failed} messages failed to send`);
      }
      queryClient.invalidateQueries({ queryKey: whatsappCampaignKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send bulk messages');
    },
  });

  const updateMessageStatus = useMutation({
    mutationFn: ({
      messageId,
      status,
      additionalData,
    }: {
      messageId: string;
      status: WhatsAppDeliveryStatus;
      additionalData?: Partial<WhatsAppMessage>;
    }) => WhatsAppCampaignService.updateMessageStatus(messageId, status, additionalData),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: whatsappCampaignKeys.message(variables.messageId),
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update message status');
    },
  });

  return {
    sendMessage,
    sendBulkMessages,
    updateMessageStatus,
    isSending: sendMessage.isPending,
    isSendingBulk: sendBulkMessages.isPending,
    isUpdating: updateMessageStatus.isPending,
  };
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Hook for template variable helpers
 */
export function useWhatsAppTemplateHelpers() {
  return {
    replaceVariables: WhatsAppCampaignService.replaceTemplateVariables,
    getLeadVariables: WhatsAppCampaignService.getLeadVariables,
    getCommonVariables: WhatsAppCampaignService.getCommonVariables,
    isValidPhoneNumber: WhatsAppCampaignService.isValidPhoneNumber,
  };
}

/**
 * Hook to get delivery status label and color
 */
export function useDeliveryStatusDisplay() {
  const getStatusLabel = (status: WhatsAppDeliveryStatus): string => {
    const labels: Record<WhatsAppDeliveryStatus, string> = {
      pending: 'Pending',
      sent: 'Sent',
      delivered: 'Delivered',
      read: 'Read',
      failed: 'Failed',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: WhatsAppDeliveryStatus): string => {
    const colors: Record<WhatsAppDeliveryStatus, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      sent: 'bg-blue-100 text-blue-800',
      delivered: 'bg-green-100 text-green-800',
      read: 'bg-emerald-100 text-emerald-800',
      failed: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusIcon = (status: WhatsAppDeliveryStatus): string => {
    const icons: Record<WhatsAppDeliveryStatus, string> = {
      pending: 'clock',
      sent: 'check',
      delivered: 'check-check',
      read: 'eye',
      failed: 'x-circle',
    };
    return icons[status] || 'circle';
  };

  return {
    getStatusLabel,
    getStatusColor,
    getStatusIcon,
  };
}
