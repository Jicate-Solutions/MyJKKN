// hooks/admission/use-call-mutations.ts
// React Query mutations for telephony actions (initiate call, update notes)

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { callLogsKeys } from './use-call-logs';
import { callStatsKeys } from './use-call-stats';
import type { CallDisposition } from '@/lib/services/telephony/telephony-service';

// ============================================================================
// TYPES
// ============================================================================

interface InitiateCallInput {
  institution_id: string;
  counselor_phone: string;
  prospect_phone: string;
  lead_id?: string;
  caller_id?: string;
}

interface InitiateCallResult {
  call_sid: string;
  call_log_id: string;
}

interface UpdateCallNotesInput {
  call_id: string;
  call_notes?: string;
  call_disposition?: CallDisposition;
  follow_up_date?: string | null;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook for all telephony mutations.
 */
export function useCallMutations() {
  const queryClient = useQueryClient();

  const invalidateCallQueries = (institutionId?: string, leadId?: string) => {
    queryClient.invalidateQueries({ queryKey: callLogsKeys.lists() });
    queryClient.invalidateQueries({ queryKey: callStatsKeys.all });
    if (leadId) {
      queryClient.invalidateQueries({ queryKey: callLogsKeys.leadCalls(leadId) });
    }
    // Also invalidate lead timeline and activity
    queryClient.invalidateQueries({ queryKey: ['lead-timeline'] });
    queryClient.invalidateQueries({ queryKey: ['lead-activities'] });
    queryClient.invalidateQueries({ queryKey: ['lead-communication-history'] });
  };

  /**
   * Initiate a click-to-call.
   */
  const initiateCall = useMutation({
    mutationFn: async (input: InitiateCallInput): Promise<InitiateCallResult> => {
      const res = await fetch('/api/admission/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to initiate call' }));
        throw new Error(err.message || 'Failed to initiate call');
      }

      const json = await res.json();
      return json.data;
    },
    onSuccess: (_, variables) => {
      toast.success('Call initiated — your phone will ring shortly');
      invalidateCallQueries(variables.institution_id, variables.lead_id);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to initiate call');
    },
  });

  /**
   * Update post-call notes, disposition, and follow-up date.
   */
  const updateCallNotes = useMutation({
    mutationFn: async (input: UpdateCallNotesInput) => {
      const { call_id, ...body } = input;
      const res = await fetch(`/api/admission/calls/${call_id}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to update call notes' }));
        throw new Error(err.message || 'Failed to update call notes');
      }

      const json = await res.json();
      return json.data;
    },
    onSuccess: () => {
      toast.success('Call notes saved');
      invalidateCallQueries();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save call notes');
    },
  });

  return {
    initiateCall,
    updateCallNotes,
    isInitiating: initiateCall.isPending,
    isUpdatingNotes: updateCallNotes.isPending,
  };
}
