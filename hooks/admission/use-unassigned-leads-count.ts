'use client';

/**
 * Admission — Unassigned Leads Count Hook
 * Purpose: Fetches count of leads with no counselor assigned + total lead count.
 * Uses head:true (zero data transfer — count header only).
 */

import { useState, useEffect } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface UnassignedLeadsCounts {
  unassigned: number;
  total: number;
}

export interface UseUnassignedLeadsCountResult {
  counts: UnassignedLeadsCounts | null;
  loading: boolean;
}

export function useUnassignedLeadsCount(): UseUnassignedLeadsCountResult {
  const [counts, setCounts] = useState<UnassignedLeadsCounts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClientSupabaseClient();

    async function fetchCounts() {
      try {
        // Use head:true to get only the count header — zero data transfer
        const [totalRes, unassignedRes] = await Promise.all([
          supabase
            .from('admission_leads')
            .select('*', { count: 'exact', head: true }),
          supabase
            .from('admission_leads')
            .select('*', { count: 'exact', head: true })
            .is('counselor_id', null),
        ]);

        if (cancelled) return;

        const total = totalRes.count ?? 0;
        const unassigned = unassignedRes.count ?? 0;
        setCounts({ total, unassigned });
      } catch {
        // Fail silently — banner simply won't render
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchCounts();
    return () => {
      cancelled = true;
    };
  }, []);

  return { counts, loading };
}
