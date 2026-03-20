import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { 
  AttendanceConflictMonitorService,
  type AttendanceConflict,
  type ConflictSummary
} from '@/lib/services/academic/attendance-conflict-monitor-service';

/**
 * Updated: 2025-09-05 - Created hook for attendance conflict monitoring
 * React hook for managing attendance staff assignment conflict monitoring
 */

export interface UseAttendanceConflictMonitorOptions {
  institutionId: string;
  dateRange?: { start: string; end: string };
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useAttendanceConflictMonitor({
  institutionId,
  dateRange,
  autoRefresh = false,
  refreshInterval = 5 * 60 * 1000 // 5 minutes
}: UseAttendanceConflictMonitorOptions) {
  
  // Query for active conflicts
  const {
    data: conflicts = [],
    isLoading: isLoadingConflicts,
    error: conflictsError,
    refetch: refetchConflicts
  } = useQuery<AttendanceConflict[]>({
    queryKey: ['attendance-conflicts', institutionId, dateRange],
    queryFn: () => AttendanceConflictMonitorService.getActiveConflicts(
      institutionId,
      dateRange
    ),
    enabled: !!institutionId,
    refetchInterval: autoRefresh ? refreshInterval : false,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Query for conflict summary
  const {
    data: summary,
    isLoading: isLoadingSummary,
    error: summaryError,
    refetch: refetchSummary
  } = useQuery<ConflictSummary>({
    queryKey: ['attendance-conflict-summary', institutionId, dateRange],
    queryFn: () => AttendanceConflictMonitorService.getConflictSummary(
      institutionId,
      dateRange
    ),
    enabled: !!institutionId,
    refetchInterval: autoRefresh ? refreshInterval : false,
    staleTime: 2 * 60 * 1000,
  });

  // Mutation for validating a specific record
  const validateRecordMutation = useMutation({
    mutationFn: (attendanceId: string) => 
      AttendanceConflictMonitorService.validateAttendanceRecord(attendanceId),
    onSuccess: (data) => {
      if (data.isValid) {
        toast.success('Attendance record is valid');
      } else {
        toast.error(`Conflicts found: ${data.conflicts.length} issues detected`);
      }
    },
    onError: (error) => {
      console.error('Error validating attendance record:', error);
      toast.error('Failed to validate attendance record');
    }
  });

  // Mutation for getting daily report
  const getDailyReportMutation = useMutation({
    mutationFn: (date: string) => 
      AttendanceConflictMonitorService.getDailyConflictReport(institutionId, date),
    onError: (error) => {
      console.error('Error getting daily report:', error);
      toast.error('Failed to generate daily conflict report');
    }
  });

  // Mutation for getting conflict fix suggestions
  const getSuggestionsMutation = useMutation({
    mutationFn: (conflicts: AttendanceConflict[]) => 
      AttendanceConflictMonitorService.suggestConflictFixes(conflicts),
    onError: (error) => {
      console.error('Error getting fix suggestions:', error);
      toast.error('Failed to generate fix suggestions');
    }
  });

  // Helper functions
  const hasConflicts = conflicts.length > 0;
  const conflictPercentage = summary?.conflict_percentage || 0;
  const isHighRisk = conflictPercentage > 10; // More than 10% conflicts is high risk
  
  const conflictsByType = summary?.conflicts_by_type || {};
  const mostCommonConflictType = Object.entries(conflictsByType)
    .sort(([,a], [,b]) => (b as number) - (a as number))[0]?.[0];

  // Refresh all data
  const refreshAll = async () => {
    try {
      await Promise.all([
        refetchConflicts(),
        refetchSummary()
      ]);
      toast.success('Conflict data refreshed');
    } catch (error) {
      console.error('Error refreshing data:', error);
      toast.error('Failed to refresh conflict data');
    }
  };

  // Get conflicts for a specific date
  const getConflictsForDate = (date: string) => {
    return conflicts.filter(conflict => 
      conflict.attendance_date === date
    );
  };

  // Get conflicts for a specific staff member
  const getConflictsForStaff = (staffId: string) => {
    return conflicts.filter(conflict => 
      conflict.marked_by === staffId
    );
  };

  return {
    // Data
    conflicts,
    summary,
    hasConflicts,
    conflictPercentage,
    isHighRisk,
    mostCommonConflictType,

    // Loading states
    isLoadingConflicts,
    isLoadingSummary,
    isLoading: isLoadingConflicts || isLoadingSummary,

    // Errors
    conflictsError,
    summaryError,
    hasErrors: !!conflictsError || !!summaryError,

    // Actions
    validateRecord: validateRecordMutation.mutate,
    getDailyReport: getDailyReportMutation.mutate,
    getSuggestions: getSuggestionsMutation.mutate,
    refreshAll,

    // Mutation states
    isValidatingRecord: validateRecordMutation.isPending,
    isGeneratingReport: getDailyReportMutation.isPending,
    isGeneratingSuggestions: getSuggestionsMutation.isPending,

    // Mutation results
    validationResult: validateRecordMutation.data,
    dailyReport: getDailyReportMutation.data,
    suggestions: getSuggestionsMutation.data,

    // Helper functions
    getConflictsForDate,
    getConflictsForStaff,

    // Refetch functions
    refetchConflicts,
    refetchSummary
  };
}

/**
 * Hook for monitoring conflicts in real-time during attendance marking
 */
export function useRealTimeConflictMonitor(
  institutionId: string,
  onConflictDetected?: (conflict: AttendanceConflict) => void
) {
  const monitor = useAttendanceConflictMonitor({
    institutionId,
    autoRefresh: true,
    refreshInterval: 30 * 1000 // 30 seconds for real-time monitoring
  });

  // Effect to handle new conflicts
  React.useEffect(() => {
    if (monitor.conflicts.length > 0 && onConflictDetected) {
      // Check if there are any conflicts from the last 5 minutes (likely new)
      const recentConflicts = monitor.conflicts.filter(conflict => {
        const conflictTime = new Date(conflict.detected_at).getTime();
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return conflictTime > fiveMinutesAgo;
      });

      recentConflicts.forEach(onConflictDetected);
    }
  }, [monitor.conflicts, onConflictDetected]);

  return monitor;
}

// React import fix
import React from 'react';