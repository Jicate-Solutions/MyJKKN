'use client';

// Missed-call callbacks for the Counselor View ("Call back now").
// Reads through fn_callback_queue_for_me, which decides who sees what:
// a counsellor sees their own plus unclaimed ones in their college; a manager
// sees the college (or one counsellor when "View as" is set).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface CallbackRow {
  id: string;
  caller_number: string;
  lead_id: string | null;
  lead_name: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  missed_count_7d: number | null;
  ever_connected: boolean | null;
  created_at: string;
  escalation_level: number;
  assigned_counselor_id: string | null;
  assigned_name: string | null;
  is_mine: boolean;
}

export interface CallbacksForMe {
  rows: CallbackRow[];
  total: number;
  is_manager: boolean;
}

export const callbacksKey = (institutionId?: string, counsellorUserId?: string) =>
  ['admission', 'callbacks-for-me', institutionId ?? '', counsellorUserId ?? ''] as const;

export function useCallbacksForMe(institutionId?: string, counsellorUserId?: string) {
  return useQuery({
    queryKey: callbacksKey(institutionId, counsellorUserId),
    enabled: !!institutionId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<CallbacksForMe> => {
      const supabase = createClientSupabaseClient();
      // New functions are not in the generated types yet.
      const { data, error } = await (supabase as any).rpc('fn_callback_queue_for_me', {
        p_institution_id: institutionId,
        p_counsellor_user_id: counsellorUserId || null,
      });
      if (error) throw new Error(error.message);
      const d = (data ?? {}) as Partial<CallbacksForMe>;
      return {
        rows: Array.isArray(d.rows) ? d.rows : [],
        total: typeof d.total === 'number' ? d.total : 0,
        is_manager: !!d.is_manager,
      };
    },
  });
}

export function useCompleteCallback(institutionId?: string, counsellorUserId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc('fn_complete_callback', {
        p_id: id,
        p_note: note?.trim() || null,
      });
      if (error) throw new Error(error.message);
      return (data ?? {}) as { ok?: boolean; already_closed?: boolean };
    },
    onSuccess: (res) => {
      toast.success(res.already_closed ? 'Someone already marked this call done.' : 'Marked as called back.');
      qc.invalidateQueries({ queryKey: callbacksKey(institutionId, counsellorUserId) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not mark this call done.');
    },
  });
}
