'use client';

/**
 * Admission — Counselor Staffing Stats Hook
 * Purpose: Surfaces load imbalance (top vs median) and orphan institutions.
 *
 * Trigger thresholds:
 *   - top_load > 3 × median  → overload alert
 *   - orphan_count > 0       → orphan institutions alert
 *
 * Cache: 60 seconds (setInterval refresh). Uses head:true where possible.
 */

import { useState, useEffect, useRef } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface CounselorStaffingStats {
  /** Open-lead count for the most-loaded counselor. */
  top_load: number;
  /** Median open-lead count across all active counselors. */
  median_load: number;
  /** top_load / median_load, rounded to 1 dp. */
  ratio: number;
  /** Number of institutions that have unassigned leads but zero active counselors. */
  orphan_count: number;
}

export interface UseCounselorStaffingStatsResult {
  stats: CounselorStaffingStats | null;
  loading: boolean;
}

const CACHE_TTL_MS = 60_000;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function useCounselorStaffingStats(): UseCounselorStaffingStatsResult {
  const [stats, setStats] = useState<CounselorStaffingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClientSupabaseClient();

    async function fetchStats() {
      try {
        // Query 1 — open lead counts per counselor (active = has a counselor_id)
        const { data: counselorRows, error: counselorErr } = await supabase
          .from('admission_leads')
          .select('counselor_id')
          .not('counselor_id', 'is', null)
          .eq('status', 'open');

        if (counselorErr || cancelled) return;

        // Build per-counselor load map
        const loadMap: Record<string, number> = {};
        for (const row of counselorRows ?? []) {
          if (row.counselor_id) {
            loadMap[row.counselor_id] = (loadMap[row.counselor_id] ?? 0) + 1;
          }
        }

        const loads = Object.values(loadMap);
        const top_load = loads.length > 0 ? Math.max(...loads) : 0;
        const median_load = median(loads);
        const ratio =
          median_load > 0
            ? Math.round((top_load / median_load) * 10) / 10
            : 0;

        // Query 2 — institution_ids that have open unassigned leads
        const { data: unassignedRows, error: unassignedErr } = await supabase
          .from('admission_leads')
          .select('institution_id')
          .is('counselor_id', null)
          .eq('status', 'open');

        if (unassignedErr || cancelled) return;

        // Collect unique institution_ids with unassigned leads
        const orphanInstitutions = new Set<string>(
          (unassignedRows ?? [])
            .map((r) => r.institution_id)
            .filter(Boolean) as string[],
        );

        // Re-query for institution_ids that DO have an assigned counselor
        const { data: assignedRows } = await supabase
          .from('admission_leads')
          .select('institution_id')
          .not('counselor_id', 'is', null)
          .eq('status', 'open');

        if (cancelled) return;

        const assignedInstitutions = new Set<string>(
          (assignedRows ?? [])
            .map((r) => r.institution_id)
            .filter(Boolean) as string[],
        );

        // Orphan = has unassigned leads AND no counselor-covered leads at all
        let orphan_count = 0;
        for (const instId of orphanInstitutions) {
          if (!assignedInstitutions.has(instId)) {
            orphan_count++;
          }
        }

        if (!cancelled) {
          setStats({ top_load, median_load, ratio, orphan_count });
          setLoading(false);
        }
      } catch {
        // Fail silently — banner simply won't render
        if (!cancelled) setLoading(false);
      }
    }

    fetchStats();

    // Refresh every 60 s
    timerRef.current = setInterval(fetchStats, CACHE_TTL_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { stats, loading };
}
