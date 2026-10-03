'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

/** One institution x gate cell of the Overview tab (procurement_overview_counts). */
export interface ProcurementOverviewCount {
  institution_id: string;
  institution_name: string;
  /** 1 request approval · 2 quotations · 3 Super Admin approval · 4 purchase orders · 5 goods received */
  gate: number;
  pending: number;
  updated: number;
  recent: number;
}

/**
 * Pending / updated / recent counts per college and step, already limited by RLS to
 * the colleges the viewer may see. One call feeds every view of the Overview tab.
 */
export function useProcurementOverviewCounts(days = 7) {
  return useQuery({
    queryKey: ['procurement-overview-counts', days],
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('procurement_overview_counts', { p_days: days });
      if (error) throw error;
      return (data ?? []) as ProcurementOverviewCount[];
    },
    staleTime: 60 * 1000,
  });
}
