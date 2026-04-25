// hooks/admission/use-call-mutations.ts
// React Query mutations for telephony actions (initiate call, update notes)

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { callLogsKeys } from './use-call-logs';
import { callStatsKeys } from './use-call-stats';
import type { CallDisposition, LogCallInput } from '@/lib/services/telephony/telephony-service';

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
  follow_up_at?: string | null;
  call_outcome?: string | null;
  prospect_sentiment?: string | null;
  primary_objection?: string | null;
  next_action?: string | null;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook for all telephony mutations.
 */
export function useCallMutations() {
  const queryClient = useQueryClient();

  const invalidateCallQueries = (institutionId?: string, leadId?: string, callId?: string) => {
    queryClient.invalidateQueries({ queryKey: callLogsKeys.lists() });
    queryClient.invalidateQueries({ queryKey: callStatsKeys.all });
    if (leadId) {
      queryClient.invalidateQueries({ queryKey: callLogsKeys.leadCalls(leadId) });
    }
    // Detail page reads ['call-detail', id] — invalidate so the Call Details
    // page picks up the new disposition/notes/etc when the counselor navigates
    // there after editing through the list dialog.
    if (callId) {
      queryClient.invalidateQueries({ queryKey: ['call-detail', callId] });
    } else {
      queryClient.invalidateQueries({ queryKey: ['call-detail'] });
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
    onSuccess: (_data, variables) => {
      toast.success('Call notes saved');
      invalidateCallQueries(undefined, undefined, variables.call_id);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save call notes');
    },
  });


  const logManualCall = useMutation({
    mutationFn: async (input: LogCallInput) => {
      const res = await fetch('/api/admission/calls/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      if (!res.ok) { const err = await res.json().catch(() => ({ message: 'Failed to log call' })); throw new Error(err.message || 'Failed to log call'); }
      return (await res.json()).data;
    },
    onSuccess: () => {
      toast.success('Call logged');
      invalidateCallQueries();
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
      queryClient.invalidateQueries({ queryKey: ['lead-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['lead-activities'] });
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-summary'] });
    },
    onError: (error: Error) => { toast.error(error.message || 'Failed to log call'); },
  });

  return {
    initiateCall,
    updateCallNotes,
    logManualCall,
    isInitiating: initiateCall.isPending,
    isUpdatingNotes: updateCallNotes.isPending,
    isLoggingCall: logManualCall.isPending,
  };
}
