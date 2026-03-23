'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import {
  BugReport,
  BugReportLeaderboardEntry,
  BugReportStatus,
  DetailedBugReport,
  BugReportMessage,
  BugReportParticipant,
  BugReportFilters,
  BugReporterStats,
  BugReporterStatsFilters
} from '@/types/bugs';

// --- API Fetching Functions ---

const fetchBugReports = async (filters: BugReportFilters) => {
  const params = new URLSearchParams();
  if (filters.status) params.append('status', filters.status);
  if (filters.category) params.append('category', filters.category);
  if (filters.institution_id) params.append('institution_id', filters.institution_id);
  if (filters.department_id) params.append('department_id', filters.department_id);
  if (filters.reporter_user_id) params.append('reporter_user_id', filters.reporter_user_id);
  if (filters.search) params.append('search', filters.search);
  if (filters.module_name) params.append('module_name', filters.module_name);
  if (filters.sub_module_name) params.append('sub_module_name', filters.sub_module_name);
  if (filters.page) params.append('page', filters.page.toString());
  if (filters.limit) params.append('limit', filters.limit.toString());

  const response = await fetch(`/api/bug-reports?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch bug reports');
  }
  return response.json();
};

const fetchBugReporterStats = async (filters: BugReporterStatsFilters) => {
  const params = new URLSearchParams();
  if (filters.institution_id) params.append('institution_id', filters.institution_id);
  if (filters.department_id) params.append('department_id', filters.department_id);
  if (filters.sort_by) params.append('sort_by', filters.sort_by);
  if (filters.sort_order) params.append('sort_order', filters.sort_order);
  if (filters.page) params.append('page', filters.page.toString());
  if (filters.limit) params.append('limit', filters.limit.toString());

  const response = await fetch(`/api/bug-reports/reporters?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch reporter statistics');
  }
  return response.json() as Promise<{ data: BugReporterStats[]; metadata: any }>;
};

const fetchBugReportById = async (reportId: string) => {
  const response = await fetch(`/api/bug-reports/${reportId}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error || 'Failed to fetch bug report details';

    // Create error with status information
    const error = new Error(errorMessage);
    (error as any).status = response.status;
    throw error;
  }
  return response.json();
};

const fetchMyBugReports = async () => {
  const response = await fetch('/api/bug-reports/me');
  if (!response.ok) {
    throw new Error('Failed to fetch your bug reports');
  }
  return response.json();
};

const updateBugReportStatus = async ({
  reportId,
  status
}: {
  reportId: string;
  status: BugReportStatus;
}) => {
  const response = await fetch(`/api/bug-reports/${reportId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  if (!response.ok) {
    throw new Error('Failed to update bug report status');
  }
  return response.json();
};

const fetchLeaderboard = async (
  period: 'overall' | 'week' | 'month' = 'overall'
) => {
  const response = await fetch(`/api/bug-reports/leaderboard?period=${period}`);
  if (!response.ok) {
    throw new Error('Failed to fetch leaderboard');
  }
  return response.json();
};

const fetchBugReportStats = async () => {
  const response = await fetch('/api/bug-reports/stats');
  if (!response.ok) {
    throw new Error('Failed to fetch bug report statistics');
  }
  return response.json();
};

const deleteBugReport = async (reportId: string) => {
  const response = await fetch(`/api/bug-reports/${reportId}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete bug report');
  }
  return response.json();
};

const bulkDeleteBugReports = async (reportIds: string[]) => {
  const response = await fetch('/api/bug-reports/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportIds })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete bug reports');
  }
  return response.json();
};

const bulkUpdateBugReportsStatus = async ({
  reportIds,
  status
}: {
  reportIds: string[];
  status: BugReportStatus;
}) => {
  const response = await fetch('/api/bug-reports/bulk-update-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportIds, status })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update bug reports status');
  }
  return response.json();
};

const reopenBugReport = async (reportId: string) => {
  const response = await fetch(`/api/bug-reports/${reportId}/reopen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to reopen bug report');
  }
  return response.json();
};

const fetchBugReportMessages = async (reportId: string) => {
  const response = await fetch(`/api/bug-reports/${reportId}/messages`);
  if (!response.ok) {
    throw new Error('Failed to fetch bug report messages');
  }
  return response.json();
};

const sendBugReportMessage = async ({
  reportId,
  message_text,
  is_internal,
  reply_to_message_id
}: {
  reportId: string;
  message_text: string;
  is_internal?: boolean;
  reply_to_message_id?: string;
}) => {
  const response = await fetch(`/api/bug-reports/${reportId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message_text, is_internal, reply_to_message_id })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error || 'Failed to send message';

    // Create error with status information
    const error = new Error(errorMessage);
    (error as any).status = response.status;
    (error as any).details = errorData.details;
    throw error;
  }
  return response.json();
};

const fetchBugReportParticipants = async (reportId: string) => {
  const response = await fetch(`/api/bug-reports/${reportId}/participants`);
  if (!response.ok) {
    throw new Error('Failed to fetch bug report participants');
  }
  return response.json();
};

const fetchInstitutions = async () => {
  const response = await fetch('/api/institutions');
  if (!response.ok) {
    throw new Error('Failed to fetch institutions');
  }
  return response.json();
};

const fetchDepartments = async (institutionId?: string) => {
  const params = new URLSearchParams();
  if (institutionId) params.append('institution_id', institutionId);

  const response = await fetch(`/api/departments?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch departments');
  }
  return response.json();
};

const fetchBugModules = async (): Promise<{
  modules: { name: string; count: number; subModules: { name: string; count: number }[] }[];
}> => {
  const response = await fetch('/api/bug-reports/modules');
  if (!response.ok) throw new Error('Failed to fetch bug modules');
  return response.json();
};

// --- React Query Hooks ---

export const useBugReports = (filters: BugReportFilters) => {
  return useQuery<{ data: BugReport[]; metadata: any }>({
    queryKey: queryKeys.bugReports.list(filters),
    queryFn: () => fetchBugReports(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true
  });
};

export const useBugReport = (reportId: string) => {
  return useQuery<DetailedBugReport>({
    queryKey: queryKeys.bugReports.detail(reportId),
    queryFn: () => fetchBugReportById(reportId),
    enabled: !!reportId, // Only run the query if reportId is available
    refetchInterval: 15000, // Refetch every 15 seconds for detailed view
    refetchOnWindowFocus: true,
    refetchOnMount: true, // Always refetch on mount to catch deletions
    staleTime: 1 * 60 * 1000, // 1 minute
    retry: (failureCount, error: any) => {
      // Don't retry if it's a 404 (deleted bug report)
      if (error?.status === 404) {
        return false;
      }
      // Retry up to 3 times for other errors
      return failureCount < 3;
    }
  });
};

export const useMyBugReports = () => {
  return useQuery<BugReport[]>({
    queryKey: queryKeys.bugReports.mine(),
    queryFn: fetchMyBugReports,
    refetchInterval: 15000, // Reduced to 15 seconds for faster updates
    refetchOnWindowFocus: true, // Refetch when window gains focus
    refetchOnMount: true, // Always refetch when component mounts
    staleTime: 1 * 60 * 1000 // Reduced to 1 minute
  });
};

export const useUpdateBugReportStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateBugReportStatus,
    onSuccess: (data, variables) => {
      // Invalidate and refetch all bug reports queries using centralized keys
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.lists() });

      // Invalidate my bug reports
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.mine() });

      // Invalidate leaderboard (in case status changed to/from resolved)
      queryClient.invalidateQueries({
        queryKey: queryKeys.bugReports.leaderboard()
      });

      // Update the specific bug report in cache
      queryClient.invalidateQueries({
        queryKey: queryKeys.bugReports.detail(variables.reportId)
      });

      // Invalidate stats widget (total/resolved/in-progress counters)
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.stats() });

      // Invalidate reporter analytics (resolved_count, resolution_rate, etc.)
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.bugReports.all, 'reporter-stats']
      });
    }
  });
};

export const useDeleteBugReport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteBugReport,
    onSuccess: () => {
      // Invalidate and refetch all bug reports queries
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.lists() });

      // Invalidate my bug reports
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.mine() });

      // Invalidate leaderboard
      queryClient.invalidateQueries({
        queryKey: queryKeys.bugReports.leaderboard()
      });
    }
  });
};

export const useBulkDeleteBugReports = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bulkDeleteBugReports,
    onSuccess: () => {
      // Invalidate and refetch all bug reports queries
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.lists() });

      // Invalidate my bug reports
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.mine() });

      // Invalidate leaderboard
      queryClient.invalidateQueries({
        queryKey: queryKeys.bugReports.leaderboard()
      });
    }
  });
};

export const useBulkUpdateBugReportsStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bulkUpdateBugReportsStatus,
    onSuccess: () => {
      // Invalidate and refetch all bug reports queries
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.lists() });

      // Invalidate my bug reports
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.mine() });

      // Invalidate leaderboard (in case status changed to/from resolved)
      queryClient.invalidateQueries({
        queryKey: queryKeys.bugReports.leaderboard()
      });

      // Invalidate stats widget and reporter analytics
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.stats() });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.bugReports.all, 'reporter-stats']
      });
    }
  });
};

export const useReopenBugReport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reopenBugReport,
    onSuccess: (data, reportId) => {
      // Invalidate and refetch all bug reports queries
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.lists() });

      // Invalidate my bug reports
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.mine() });

      // Invalidate the specific bug report details
      queryClient.invalidateQueries({
        queryKey: queryKeys.bugReports.detail(reportId)
      });

      // Invalidate messages to show the reopen message
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.bugReports.detail(reportId), 'messages']
      });

      // Invalidate leaderboard (status changed from resolved)
      queryClient.invalidateQueries({
        queryKey: queryKeys.bugReports.leaderboard()
      });

      // Invalidate stats widget and reporter analytics
      queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.stats() });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.bugReports.all, 'reporter-stats']
      });
    }
  });
};

export const useBugLeaderboard = (
  period: 'overall' | 'week' | 'month' = 'overall'
) => {
  return useQuery<BugReportLeaderboardEntry[]>({
    queryKey: [...queryKeys.bugReports.leaderboard(), period],
    queryFn: () => fetchLeaderboard(period),
    refetchInterval: 60000, // Refetch every minute
    refetchOnWindowFocus: true,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
};

// Statistics hook - fetches real-time counts from database
export interface BugReportStats {
  total: number;
  resolved: number;
  inProgress: number;
  newReports: number;
  seen: number;
  wontFix: number;
  resolutionRate: string;
  recentReports: number;
  previousReports: number;
  reportsTrend: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
  };
}

export const useBugReportStats = () => {
  return useQuery<BugReportStats>({
    queryKey: queryKeys.bugReports.stats(),
    queryFn: fetchBugReportStats,
    refetchInterval: 30000, // Refetch every 30 seconds for real-time stats
    refetchOnWindowFocus: true,
    staleTime: 15 * 1000 // 15 seconds
  });
};

// Chat hooks
export const useBugReportMessages = (reportId: string) => {
  return useQuery<BugReportMessage[]>({
    queryKey: [...queryKeys.bugReports.detail(reportId), 'messages'],
    queryFn: () => fetchBugReportMessages(reportId),
    enabled: !!reportId,
    refetchInterval: 2000, // More aggressive - every 2 seconds
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 10 * 1000 // Reduced to 10 seconds for fresher data
  });
};

export const useSendBugReportMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sendBugReportMessage,
    onSuccess: (data, variables) => {
      // Immediately invalidate and refetch messages for instant updates
      queryClient.invalidateQueries({
        queryKey: [
          ...queryKeys.bugReports.detail(variables.reportId),
          'messages'
        ]
      });

      // Force refetch for immediate UI update
      queryClient.refetchQueries({
        queryKey: [
          ...queryKeys.bugReports.detail(variables.reportId),
          'messages'
        ]
      });

      // Invalidate participants (in case new participant was added)
      queryClient.invalidateQueries({
        queryKey: [
          ...queryKeys.bugReports.detail(variables.reportId),
          'participants'
        ]
      });

      // Also invalidate read counts to update unread indicators
      queryClient.invalidateQueries({
        queryKey: [
          ...queryKeys.bugReports.detail(variables.reportId),
          'reads'
        ]
      });
    }
  });
};

export const useBugReportParticipants = (reportId: string) => {
  return useQuery<BugReportParticipant[]>({
    queryKey: [...queryKeys.bugReports.detail(reportId), 'participants'],
    queryFn: () => fetchBugReportParticipants(reportId),
    enabled: !!reportId,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
};

// Filter data hooks
export const useInstitutions = () => {
  return useQuery<{ id: string; name: string }[]>({
    queryKey: ['institutions'],
    queryFn: fetchInstitutions,
    staleTime: 10 * 60 * 1000 // 10 minutes
  });
};

export const useDepartments = (institutionId?: string) => {
  return useQuery<{ id: string; name: string }[]>({
    queryKey: ['departments', institutionId],
    queryFn: () => fetchDepartments(institutionId),
    enabled: !!institutionId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    select: (data) => {
      if (!data) return [];
      return data.map((d: any) => ({
        id: d.id,
        name: d.department_name
      }));
    }
  });
};

export const useBugModules = () => {
  return useQuery({
    queryKey: [...queryKeys.bugReports.all, 'modules'],
    queryFn: fetchBugModules,
    staleTime: 5 * 60 * 1000
  });
};

export const useBugReporterStats = (
  filters: BugReporterStatsFilters,
  enabled = true
) => {
  return useQuery<{ data: BugReporterStats[]; metadata: any }>({
    queryKey: queryKeys.bugReports.reporterStats(filters),
    queryFn: () => fetchBugReporterStats(filters),
    enabled,
    staleTime: 2 * 60 * 1000,    // 2 minutes — analytics don't need real-time precision
    refetchOnWindowFocus: true
  });
};
