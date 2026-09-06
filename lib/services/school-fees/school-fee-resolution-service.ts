// lib/services/school-fees/school-fee-resolution-service.ts
//
// Thin client over the two Phase 5 RPCs. Both are READ-ONLY — they resolve
// what a learner owes without writing anything and without creating bills.
//
// There is deliberately no TypeScript re-implementation of the concession
// maths. The RPC is the single implementation, so the preview a clerk reads
// and the amounts Phase 7 actually bills cannot disagree.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { ClassFeePreviewRow, SchoolFeeResolution } from '@/types/school-fees';

function raise(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  if (error.code === '42501' || /not_authorized/.test(error.message ?? '')) {
    throw new Error('You do not have permission to view this learner\'s fee.');
  }
  if (/learner_not_found/.test(error.message ?? '')) {
    throw new Error('That learner no longer exists.');
  }
  throw new Error(error.message || 'Failed to resolve the school fee');
}

export class SchoolFeeResolutionService {
  /** Full per-term breakdown for one learner. */
  static async resolveForLearner(learnerId: string): Promise<SchoolFeeResolution> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('school_fee_resolve_for_learner', {
      p_learner_id: learnerId,
    });
    raise(error);
    return data as SchoolFeeResolution;
  }

  /** One row per enrolled learner in a class — the preview and dry-run source. */
  static async previewForClass(
    institutionId: string,
    programId: string,
    academicYearId: string,
  ): Promise<ClassFeePreviewRow[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('school_fee_resolve_preview_for_class', {
      p_institution_id: institutionId,
      p_program_id: programId,
      p_academic_year_id: academicYearId,
    });
    raise(error);

    // numeric() comes back as string over PostgREST when it exceeds the safe
    // JS range; coerce every money column so callers can sum without checking.
    return ((data ?? []) as ClassFeePreviewRow[]).map((row) => ({
      ...row,
      year_gross: Number(row.year_gross),
      year_concession: Number(row.year_concession),
      year_net: Number(row.year_net),
      concession_count: Number(row.concession_count),
    }));
  }
}
