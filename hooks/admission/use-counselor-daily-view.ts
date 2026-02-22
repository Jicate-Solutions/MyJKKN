// hooks/admission/use-counselor-daily-view.ts
// Composite React Query hook for the Counselor Daily View page

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CounselorDailyViewService,
  type CounselorDailyViewData,
  type UnassignedLead,
} from '@/lib/services/admission/counselor-daily-view-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const counselorDailyViewKeys = {
  all: ['counselor-daily-view'] as const,
  view: (institutionId: string) => [...counselorDailyViewKeys.all, 'view', institutionId] as const,
  unassigned: (institutionId: string) => [...counselorDailyViewKeys.all, 'unassigned', institutionId] as const,
  counselors: (institutionId: string) => [...counselorDailyViewKeys.all, 'counselors', institutionId] as const,
};

// ============================================================================
// MAIN DAILY VIEW HOOK
// ============================================================================

/**
 * Primary hook for the counselor daily view.
 * Fetches all data in a single DB function call.
 * Auto-refreshes every 60 seconds.
 */
export function useCounselorDailyView(institutionId?: string) {
  const query = useQuery<CounselorDailyViewData>({
    queryKey: counselorDailyViewKeys.view(institutionId || ''),
    queryFn: () => CounselorDailyViewService.getDailyView(institutionId!),
    enabled: !!institutionId,
    refetchInterval: 60000, // Auto-refresh every 60 seconds
    staleTime: 30000,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    // Derived state
    isManager: query.data?.is_manager || false,
    isCounselor: !!query.data?.counselor_id,
    isNotCounselor: query.data?.error === 'not_a_counselor',
    kpis: query.data?.kpis,
    followups: query.data?.followups || [],
    pipeline: query.data?.pipeline || [],
    todayActivities: query.data?.today_activities || [],
    unassignedCount: query.data?.unassigned_count || 0,
  };
}

// ============================================================================
// UNASSIGNED LEADS HOOK (for managers)
// ============================================================================

export function useUnassignedLeads(institutionId?: string, enabled = true) {
  const query = useQuery<UnassignedLead[]>({
    queryKey: counselorDailyViewKeys.unassigned(institutionId || ''),
    queryFn: () => CounselorDailyViewService.getUnassignedLeads(institutionId!),
    enabled: !!institutionId && enabled,
    staleTime: 30000,
  });

  return {
    leads: query.data || [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

// ============================================================================
// COUNSELORS LIST HOOK (for assignment dropdown)
// ============================================================================

export function useCounselorsList(institutionId?: string) {
  const query = useQuery({
    queryKey: counselorDailyViewKeys.counselors(institutionId || ''),
    queryFn: () => CounselorDailyViewService.getCounselors(institutionId!),
    enabled: !!institutionId,
    staleTime: 300000, // 5 minutes
  });

  return {
    counselors: query.data || [],
    isLoading: query.isLoading,
  };
}

// ============================================================================
// ACTION MUTATIONS
// ============================================================================

export function useCounselorActions(institutionId?: string) {
  const queryClient = useQueryClient();

  // Runtime guard — throws a clear error instead of silently passing undefined to DB queries
  const requireInstitutionId = (): string => {
    if (!institutionId) throw new Error('Institution ID is required for counselor actions');
    return institutionId;
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: counselorDailyViewKeys.all });
    // Also invalidate shared admission query keys so other pages stay in sync
    queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
    queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
    queryClient.invalidateQueries({ queryKey: ['funnel-summary'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    queryClient.invalidateQueries({ queryKey: ['admission-dashboard'] });
  };

  const rescheduleFollowup = useMutation({
    mutationFn: ({ leadId, newDate }: { leadId: string; newDate: string }) =>
      CounselorDailyViewService.rescheduleFollowup(leadId, newDate, requireInstitutionId()),
    onSuccess: () => {
      toast.success('Follow-up rescheduled');
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reschedule');
    },
  });

  const addQuickNote = useMutation({
    mutationFn: ({ leadId, note }: { leadId: string; note: string }) =>
      CounselorDailyViewService.addQuickNote(leadId, note, requireInstitutionId()),
    onSuccess: () => {
      toast.success('Note added');
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add note');
    },
  });

  const logCall = useMutation({
    mutationFn: ({ leadId, notes }: { leadId: string; notes?: string }) =>
      CounselorDailyViewService.logCall(leadId, notes, requireInstitutionId()),
    onSuccess: () => {
      toast.success('Call logged');
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to log call');
    },
  });

  const advanceStage = useMutation({
    mutationFn: ({ leadId, newStage }: { leadId: string; newStage: string }) =>
      CounselorDailyViewService.advanceStage(leadId, newStage, requireInstitutionId()),
    onSuccess: () => {
      toast.success('Stage updated');
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update stage');
    },
  });

  const assignLeads = useMutation({
    mutationFn: ({ leadIds, counselorId }: { leadIds: string[]; counselorId: string }) =>
      CounselorDailyViewService.assignLeads(leadIds, counselorId, requireInstitutionId()),
    onSuccess: () => {
      toast.success('Leads assigned');
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign leads');
    },
  });

  return {
    rescheduleFollowup,
    addQuickNote,
    logCall,
    advanceStage,
    assignLeads,
    isRescheduling: rescheduleFollowup.isPending,
    isAddingNote: addQuickNote.isPending,
    isLoggingCall: logCall.isPending,
    isAdvancingStage: advanceStage.isPending,
    isAssigning: assignLeads.isPending,
  };
}

// ============================================================================
// COUNSELOR PROFILES HOOK (sourced from user profiles, role='counselor')
// ============================================================================

/**
 * Fetch counselors sourced from profiles (role='counselor') for a given institution.
 * Use this for all counselor picker dropdowns — no admission_counselors management UI needed.
 */
export function useCounselorProfiles(institutionId: string | undefined) {
  return useQuery({
    queryKey: [...counselorDailyViewKeys.counselors(institutionId || ''), 'profiles'],
    queryFn: () => CounselorDailyViewService.getCounselorProfiles(institutionId!),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000, // 5-minute cache — counselor list changes infrequently
  });
}
