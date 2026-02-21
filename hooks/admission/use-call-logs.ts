// hooks/admission/use-call-logs.ts
// React Query hooks for call log listing and single call retrieval

import { useQuery } from '@tanstack/react-query';
import type {
  CallLog,
  CallLogFilters,
  PaginatedCallLogs,
  CallStatus,
  CallDisposition,
  CallDirection,
} from '@/lib/services/telephony/telephony-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const callLogsKeys = {
  all: ['call-logs'] as const,
  lists: () => [...callLogsKeys.all, 'list'] as const,
  list: (filters: CallLogFilters) => [...callLogsKeys.lists(), filters] as const,
  detail: (id: string) => [...callLogsKeys.all, 'detail', id] as const,
  leadCalls: (leadId: string) => [...callLogsKeys.all, 'lead', leadId] as const,
};

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to fetch paginated call logs with filters.
 */
export function useCallLogs(filters: CallLogFilters) {
  const query = useQuery<PaginatedCallLogs>({
    queryKey: callLogsKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('institution_id', filters.institution_id);
      if (filters.counselor_id) params.set('counselor_id', filters.counselor_id);
      if (filters.lead_id) params.set('lead_id', filters.lead_id);
      if (filters.status) params.set('status', filters.status);
      if (filters.disposition) params.set('disposition', filters.disposition);
      if (filters.direction) params.set('direction', filters.direction);
      if (filters.from_date) params.set('from_date', filters.from_date);
      if (filters.to_date) params.set('to_date', filters.to_date);
      if (filters.has_notes !== undefined) params.set('has_notes', String(filters.has_notes));
      if (filters.search) params.set('search', filters.search);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));

      const res = await fetch(`/api/admission/calls?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to fetch call logs' }));
        throw new Error(err.message || 'Failed to fetch call logs');
      }

      const json = await res.json();
      return {
        logs: json.data || [],
        total: json.metadata?.total || 0,
        page: json.metadata?.page || 1,
        limit: json.metadata?.limit || 20,
        totalPages: json.metadata?.totalPages || 0,
      };
    },
    enabled: !!filters.institution_id,
  });

  return {
    logs: query.data?.logs || [],
    total: query.data?.total || 0,
    page: query.data?.page || 1,
    limit: query.data?.limit || 20,
    totalPages: query.data?.totalPages || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch call logs for a specific lead.
 */
export function useLeadCallLogs(institutionId: string, leadId: string) {
  const filters: CallLogFilters = {
    institution_id: institutionId,
    lead_id: leadId,
    limit: 50,
  };

  const query = useQuery<PaginatedCallLogs>({
    queryKey: callLogsKeys.leadCalls(leadId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('institution_id', institutionId);
      params.set('lead_id', leadId);
      params.set('limit', '50');

      const res = await fetch(`/api/admission/calls?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to fetch lead calls' }));
        throw new Error(err.message || 'Failed to fetch lead calls');
      }

      const json = await res.json();
      return {
        logs: json.data || [],
        total: json.metadata?.total || 0,
        page: 1,
        limit: 50,
        totalPages: 1,
      };
    },
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
 * Helper for call status display.
 */
export function useCallStatusDisplay(status: CallStatus) {
  const statusConfig: Record<
    CallStatus,
    { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; color: string }
  > = {
    'initiated': { label: 'Initiated', variant: 'outline', color: 'text-blue-600' },
    'ringing': { label: 'Ringing', variant: 'secondary', color: 'text-yellow-600' },
    'in-progress': { label: 'In Progress', variant: 'default', color: 'text-green-600' },
    'completed': { label: 'Completed', variant: 'default', color: 'text-green-700' },
    'busy': { label: 'Busy', variant: 'outline', color: 'text-orange-600' },
    'no-answer': { label: 'No Answer', variant: 'outline', color: 'text-red-500' },
    'failed': { label: 'Failed', variant: 'destructive', color: 'text-red-600' },
    'cancelled': { label: 'Cancelled', variant: 'secondary', color: 'text-gray-600' },
  };

  return statusConfig[status] || statusConfig.initiated;
}

/**
 * Helper for call disposition display.
 */
export function useCallDispositionDisplay(disposition: CallDisposition | null) {
  const dispositionConfig: Record<
    string,
    { label: string; color: string }
  > = {
    interested: { label: 'Interested', color: 'text-green-600' },
    not_interested: { label: 'Not Interested', color: 'text-red-600' },
    callback: { label: 'Callback Requested', color: 'text-blue-600' },
    wrong_number: { label: 'Wrong Number', color: 'text-orange-600' },
    not_reachable: { label: 'Not Reachable', color: 'text-yellow-600' },
    switched_off: { label: 'Switched Off', color: 'text-gray-600' },
    busy: { label: 'Busy', color: 'text-orange-500' },
    other: { label: 'Other', color: 'text-gray-500' },
  };

  if (!disposition) return { label: 'No Disposition', color: 'text-muted-foreground' };
  return dispositionConfig[disposition] || { label: disposition, color: 'text-gray-500' };
}

// Re-export types for convenience
export type { CallLog, CallLogFilters, PaginatedCallLogs, CallStatus, CallDisposition, CallDirection };
