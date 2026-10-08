'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

/** One document waiting at one step (procurement_overview_waiting). */
export interface ProcurementWaitingRow {
  /** 0 sent back to requester · 1 item approval · 2 quotes · 3 final approval · 4 ordered · 5 delivered */
  gate: number;
  request_id: string;
  request_number: string;
  /** The request title, else "Keyboard × 5 + 2 more". */
  label: string;
  institution_id: string;
  institution_name: string;
  requester_name: string | null;
  /** When it reached this step — not when the request was raised. */
  waiting_since: string | null;
  /** Gate 0: what to change · 2: Super Admin's send-back · 4: PO number · 5: GRN number. */
  detail: string | null;
  quote_count: number | null;
  /** Gate 3: chosen quotes' total · 4: PO total. */
  chosen_total: number | null;
  vendor_names: string | null;
}

/** Every waiting document the viewer may see (RLS-scoped), oldest first. */
export function useProcurementOverviewWaiting(enabled = true) {
  return useQuery({
    queryKey: ['procurement-overview-waiting'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('procurement_overview_waiting');
      if (error) throw error;
      return (data ?? []) as ProcurementWaitingRow[];
    },
    enabled,
    staleTime: 60 * 1000,
  });
}

/** Whole days since a timestamp (0 for today / unknown). */
export function daysSince(ts: string | null | undefined): number {
  if (!ts) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000));
}
