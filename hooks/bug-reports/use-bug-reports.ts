'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import {
  BugReport,
  BugReportLeaderboardEntry,
  BugReportStatus,
  DetailedBugReport
} from '@/types/bugs';

// --- API Fetching Functions ---

const fetchBugReports = async (filters: {
  status?: BugReportStatus;
  page?: number;
  limit?: number;
}) => {
  const params = new URLSearchParams();
  if (filters.status) params.append('status', filters.status);
  if (filters.page) params.append('page', filters.page.toString());
  if (filters.limit) params.append('limit', filters.limit.toString());

  const response = await fetch(`/api/bug-reports?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch bug reports');
  }
  return response.json();
};

const fetchBugReportById = async (reportId: string) => {
  const response = await fetch(`/api/bug-reports/${reportId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch bug report details');
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

// --- React Query Hooks ---

export const useBugReports = (filters: {
  status?: BugReportStatus;
  page?: number;
  limit?: number;
}) => {
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
    staleTime: 1 * 60 * 1000 // 1 minute
  });
};

export const useMyBugReports = () => {
  return useQuery<BugReport[]>({
    queryKey: queryKeys.bugReports.mine(),
    queryFn: fetchMyBugReports,
    refetchInterval: 30000, // Refetch every 30 seconds
    refetchOnWindowFocus: true, // Refetch when window gains focus
    staleTime: 2 * 60 * 1000 // 2 minutes
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
