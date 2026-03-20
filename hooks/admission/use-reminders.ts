// hooks/admission/use-reminders.ts
// React Query hooks for follow-up reminders module

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import {
  RemindersService,
  type ReminderFilters,
  type FollowUpReminder,
} from '@/lib/services/admission/reminders-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const remindersKeys = {
  all: ['admission-reminders'] as const,
  list: (institutionId: string, filters?: Omit<ReminderFilters, 'institutionId'>) =>
    [...remindersKeys.all, institutionId, filters] as const,
};

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Fetch follow-up reminders for an institution.
 * Returns leads with next_followup_at set, classified as overdue/today/upcoming.
 */
export function useFollowUpReminders(
  institutionId: string | null | undefined,
  filters?: Omit<ReminderFilters, 'institutionId'>
) {
  const { isSuperAdmin } = usePermissions();
  const query = useQuery({
    queryKey: remindersKeys.list(institutionId || '', filters),
    queryFn: () => RemindersService.getFollowUpReminders(institutionId ?? undefined, filters),
    enabled: isSuperAdmin || !!institutionId,
  });

  return {
    reminders: query.data || [] as FollowUpReminder[],
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
 * Complete a reminder — clears next_followup_at and updates last_contact_at.
 */
export function useCompleteReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (leadId: string) => RemindersService.completeReminder(leadId),
    onSuccess: () => {
      toast.success('Reminder marked as completed');
      queryClient.invalidateQueries({ queryKey: remindersKeys.all });
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to complete reminder');
    },
  });
}

/**
 * Snooze a reminder — pushes next_followup_at to tomorrow 9 AM.
 */
export function useSnoozeReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (leadId: string) => RemindersService.snoozeReminder(leadId),
    onSuccess: () => {
      toast.success('Reminder snoozed until tomorrow');
      queryClient.invalidateQueries({ queryKey: remindersKeys.all });
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to snooze reminder');
    },
  });
}

/**
 * Reschedule a reminder -- updates next_followup_at to a new date.
 */
export function useRescheduleReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ leadId, newDate }: { leadId: string; newDate: string }) =>
      RemindersService.rescheduleReminder(leadId, newDate),
    onSuccess: () => {
      toast.success('Reminder rescheduled');
      queryClient.invalidateQueries({ queryKey: remindersKeys.all });
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reschedule reminder');
    },
  });
}

/**
 * Dismiss a reminder -- clears next_followup_at without updating last_contact_at.
 */
export function useDismissReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (leadId: string) => RemindersService.dismissReminder(leadId),
    onSuccess: () => {
      toast.success('Reminder dismissed');
      queryClient.invalidateQueries({ queryKey: remindersKeys.all });
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to dismiss reminder');
    },
  });
}

/**
 * Create a manual reminder -- sets next_followup_at on a lead.
 */
export function useCreateReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ leadId, dueDate }: { leadId: string; dueDate: string }) =>
      RemindersService.createReminder(leadId, dueDate),
    onSuccess: () => {
      toast.success('Reminder created');
      queryClient.invalidateQueries({ queryKey: remindersKeys.all });
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create reminder');
    },
  });
}

/**
 * Search leads for creating a reminder.
 */
export function useSearchLeadsForReminder(institutionId: string | null | undefined, search: string) {
  return useQuery({
    queryKey: ['reminder-lead-search', institutionId, search],
    queryFn: () => RemindersService.searchLeadsForReminder(institutionId!, search),
    enabled: !!institutionId && search.length >= 2,
    staleTime: 30_000,
  });
}
