// hooks/admission/use-reminders.ts
// React Query hooks for follow-up reminders module

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
  const query = useQuery({
    queryKey: remindersKeys.list(institutionId || '', filters),
    queryFn: () => RemindersService.getFollowUpReminders(institutionId!, filters),
    enabled: !!institutionId,
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
