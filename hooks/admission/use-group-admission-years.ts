'use client';

// hooks/admission/use-group-admission-years.ts
//
// Group-level admission-year picker source. Aggregates admission_years rows
// across multiple institutions and dedupes by program_start_year so the user
// sees one entry per cohort year regardless of how many programs/institutions
// have a row for that year.
//
// Why a NEW hook instead of reusing useAdmissionYears (hooks/use-admission-years.ts):
// the existing hook requires (institutionId, programId) cascade — fine for
// per-lead/per-learner forms, useless for the group dashboard which spans
// many institutions and many programs at once.

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface GroupAdmissionYearOption {
  /** program_start_year (the dedup key — also passed to fn_group_dashboard_overview) */
  programStartYear: number;
  /** Display label, e.g. "2025-2026" — picked from the most-common admission_year_name for the cohort */
  label: string;
  /** Sample admission_year_id (institution+program-specific). Useful only for strict-mode lookups. */
  sampleAdmissionYearId: string;
  /** How many (institution × program) rows exist for this cohort across the user's scope. Diagnostic. */
  rowCount: number;
}

const QK = (institutionIds: string[] | null | undefined) =>
  ['group-admission-years', institutionIds ?? 'all'] as const;

export function useGroupAdmissionYears(institutionIds: string[] | null | undefined) {
  return useQuery({
    queryKey: QK(institutionIds),
    queryFn: async (): Promise<GroupAdmissionYearOption[]> => {
      const supabase = createClientSupabaseClient();
      let q = (supabase as any)
        .from('admission_years')
        .select('id, admission_year_name, program_start_year, institution_id')
        .eq('is_active', true)
        .order('program_start_year', { ascending: false });

      if (institutionIds && institutionIds.length > 0) {
        q = q.in('institution_id', institutionIds);
      }

      const { data, error } = await q;
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as Array<{
        id: string;
        admission_year_name: string;
        program_start_year: number;
      }>;

      // Dedupe by program_start_year. Pick the most-common admission_year_name
      // as the label (e.g. "2025-2026" rather than "2025-2026 Additional 1").
      const byYear = new Map<number, { labels: Map<string, number>; sampleId: string; count: number }>();
      for (const r of rows) {
        const bucket = byYear.get(r.program_start_year);
        if (bucket) {
          bucket.labels.set(r.admission_year_name, (bucket.labels.get(r.admission_year_name) ?? 0) + 1);
          bucket.count += 1;
        } else {
          byYear.set(r.program_start_year, {
            labels: new Map([[r.admission_year_name, 1]]),
            sampleId: r.id,
            count: 1,
          });
        }
      }

      const options: GroupAdmissionYearOption[] = Array.from(byYear.entries())
        .map(([programStartYear, b]) => {
          const label = Array.from(b.labels.entries()).sort((a, c) => c[1] - a[1])[0][0];
          return {
            programStartYear,
            label,
            sampleAdmissionYearId: b.sampleId,
            rowCount: b.count,
          };
        })
        .sort((a, b) => b.programStartYear - a.programStartYear);

      return options;
    },
    enabled: institutionIds === undefined || (Array.isArray(institutionIds) && institutionIds.length > 0) || institutionIds === null,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
