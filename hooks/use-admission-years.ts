'use client';

// hooks/use-admission-years.ts
//
// Shared hook for the institution-scoped admission_years fetch.
// Extracted 2026-04-23 from inline useEffect blocks in:
//   - app/(routes)/admission/leads/new/page.tsx:283-306
//   - app/(routes)/admission/leads/[id]/page.tsx:980-1001
//
// Returns only ACTIVE admission years for the given institution, ordered by
// year DESC so the most recent cohort is first in the dropdown. Skips fetching
// (and clears state) when the institution is missing — callers can safely
// render the disabled placeholder state.

import { useEffect, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface AdmissionYearOption {
  id: string;
  admission_year_name: string;
  year: number;
  is_active: boolean;
  /** Institution's designated current cohort (Settings → Admission Years). */
  is_current: boolean;
}

export interface UseAdmissionYearsResult {
  admissionYears: AdmissionYearOption[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAdmissionYears(
  institutionId: string | null | undefined
): UseAdmissionYearsResult {
  const [admissionYears, setAdmissionYears] = useState<AdmissionYearOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  useEffect(() => {
    if (!institutionId) {
      setAdmissionYears([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const supabase = createClientSupabaseClient();
    (supabase as any)
      .from('admission_years')
      .select('id, admission_year_name, year, is_active, is_current')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('year', { ascending: false })
      .then(({ data, error: queryError }: { data: any; error: any }) => {
        if (cancelled) return;
        if (queryError) {
          console.error('[useAdmissionYears] query failed:', queryError.message);
          setError(queryError.message);
          setAdmissionYears([]);
        } else {
          setAdmissionYears((data as AdmissionYearOption[]) ?? []);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [institutionId, refetchKey]);

  return {
    admissionYears,
    loading,
    error,
    refetch: () => setRefetchKey((k) => k + 1),
  };
}
