// hooks/accreditation/use-escs-disadvantaged.ts
// ============================================================================
// The read behind the ESCS disadvantaged-learner count.
//
// Two columns, from the learners of the colleges NIRF actually ranks, handed to
// the pure counter in `app/(routes)/accreditation/_lib/escs-disadvantaged.ts`.
// Everything the figures mean is documented there; this file only gets the rows.
//
// SCOPE — HIGHER EDUCATION ONLY
// NIRF ranks higher education. `institutions.iqac_code IS NOT NULL` is the
// established way this codebase names the 8 JKKN colleges (the same filter the
// NAAC and DCF-export screens use); the remaining institution rows are the two
// schools, a testing institution and the main office. Learners sitting in those
// would inflate every ESCS figure at source, so they are excluded here rather
// than left for a screen to remember.
//
// WHY IT PAGES
// PostgREST caps a single response, and this reads the whole learner body of a
// college — thousands of rows. A capped read produces a number that looks fine
// and is wrong, which is exactly how the NIRF dashboard came to stop counting at
// ten thousand. So it pages to exhaustion, and if it ever hits the page ceiling
// it throws rather than return a short count.
//
// WHAT IT CANNOT SEE
// RLS denial on `learners_profiles` is silent — no error, just fewer rows. A
// viewer without read access gets `total: 0` rather than a failure. A screen
// adopting this must show `total` and `assessed`, never a bare percentage, or a
// permissions problem will render as "0% disadvantaged".
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  countDisadvantagedLearners,
  type EscsDisadvantagedCount,
  type EscsLearnerRow,
} from '@/app/(routes)/accreditation/_lib/escs-disadvantaged';

/** PostgREST's own default page size — asking for more silently returns this. */
const PAGE_SIZE = 1000;

/**
 * Well above the ~7k learners on record, so this only fires if the read starts
 * running away. Reaching it means the count would be short, and a short ESCS
 * figure is worse than no figure.
 */
const MAX_PAGES = 50;

export const escsKeys = {
  all: ['accreditation', 'escs'] as const,
  count: (institutionId: string | 'cluster') =>
    [...escsKeys.all, 'disadvantaged-count', institutionId] as const,
};

/** The 8 colleges NIRF ranks — the institution rows carrying an `iqac_code`. */
async function readRankedInstitutionIds(sb: any): Promise<string[]> {
  const { data, error } = await sb
    .from('institutions')
    .select('id')
    .not('iqac_code', 'is', null);
  if (error) throw error;
  return (data ?? []).map((row: { id: string }) => row.id);
}

async function readEscsLearnerRows(
  sb: any,
  institutionIds: string[],
): Promise<EscsLearnerRow[]> {
  const rows: EscsLearnerRow[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const start = page * PAGE_SIZE;
    const { data, error } = await sb
      .from('learners_profiles')
      .select('scholarship_type, annual_income')
      .in('institution_id', institutionIds)
      // Without a stable order, paging can repeat or skip rows between requests.
      .order('id')
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw error;

    const batch = (data ?? []) as EscsLearnerRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }

  throw new Error(
    `ESCS learner read hit the ${MAX_PAGES * PAGE_SIZE}-row page ceiling — the ` +
      'count would be short. Raise MAX_PAGES rather than report a truncated figure.',
  );
}

/**
 * The five ESCS figures for one college, or for all 8 at once.
 *
 * NIRF is submitted per college, so `institutionId` narrows to one; `'cluster'`
 * counts every ranked college together. Passing an institution with no
 * `iqac_code` yields `total: 0` — it is not a college NIRF ranks.
 */
export function useEscsDisadvantagedCount(institutionId: string | 'cluster' = 'cluster') {
  return useQuery({
    queryKey: escsKeys.count(institutionId),
    queryFn: async (): Promise<EscsDisadvantagedCount> => {
      const sb = createClientSupabaseClient() as any;

      const rankedIds = await readRankedInstitutionIds(sb);
      const scopedIds =
        institutionId === 'cluster'
          ? rankedIds
          : rankedIds.filter((id) => id === institutionId);

      // No ranked institution in scope: return an honest empty count rather than
      // querying with an empty `IN ()`, which would match every learner on file.
      if (scopedIds.length === 0) return countDisadvantagedLearners([]);

      return countDisadvantagedLearners(await readEscsLearnerRows(sb, scopedIds));
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
