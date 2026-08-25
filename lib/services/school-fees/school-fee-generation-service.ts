// lib/services/school-fees/school-fee-generation-service.ts
//
// The only client path that creates school fee bills.
//
// `generate()` defaults to a DRY RUN. Committing is an explicit second call
// with dryRun=false — there is no single-call "just do it" convenience, because
// the thing it does is write financial records for hundreds of learners.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { GenerationPreviewRow, GenerationResult } from '@/types/school-fees';

function raise(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  if (error.code === '42501' || /not_authorized/.test(error.message ?? '')) {
    throw new Error('You do not have permission to generate school fee bills.');
  }
  if (error.code === '23505') {
    // The partial unique index caught a duplicate the RPC's ON CONFLICT should
    // have absorbed — surface it plainly rather than as a constraint name.
    throw new Error('Some bills already exist for this plan. Re-run to skip them.');
  }
  throw new Error(error.message || 'Fee generation failed');
}

const num = (v: unknown) => Number(v ?? 0);

function normalisePreview(rows: GenerationPreviewRow[]): GenerationPreviewRow[] {
  // numeric() arrives as string over PostgREST; coerce so callers can sum.
  return rows.map((r) => ({
    ...r,
    learners: num(r.learners),
    already_billed: num(r.already_billed),
    billable: num(r.billable),
    year_gross: num(r.year_gross),
    year_concession: num(r.year_concession),
    year_net: num(r.year_net),
  }));
}

export class SchoolFeeGenerationService {
  /** Per-class dry run. Writes nothing at all — not even an audit row. */
  static async preview(
    institutionId: string,
    academicYearId: string,
  ): Promise<GenerationPreviewRow[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('school_fee_generation_preview', {
      p_institution_id: institutionId,
      p_academic_year_id: academicYearId,
    });
    raise(error);
    return normalisePreview((data ?? []) as GenerationPreviewRow[]);
  }

  /**
   * Run generation. `dryRun: true` records an audit row but creates no bills.
   *
   * Idempotent by construction: the RPC's ON CONFLICT targets
   * ux_billing_bills_school_fee_item, so a retry after a network timeout
   * cannot double-charge anyone.
   */
  static async generate(
    institutionId: string,
    academicYearId: string,
    dryRun = true,
  ): Promise<GenerationResult> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('school_fee_generate', {
      p_institution_id: institutionId,
      p_academic_year_id: academicYearId,
      p_dry_run: dryRun,
    });
    raise(error);

    const result = data as GenerationResult;
    return {
      ...result,
      learners_matched: num(result.learners_matched),
      bills_created: num(result.bills_created),
      skipped_no_plan: num(result.skipped_no_plan),
      skipped_existing: num(result.skipped_existing),
      classes: normalisePreview(result.classes ?? []),
    };
  }

  /** Past runs for this school + year, newest first. */
  static async listRuns(institutionId: string, academicYearId: string) {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('school_fee_generation_runs')
      .select(
        'id, is_dry_run, learners_matched, bills_created, skipped_no_plan, skipped_existing, run_at, run_by',
      )
      .eq('institution_id', institutionId)
      .eq('academic_year_id', academicYearId)
      .order('run_at', { ascending: false })
      .limit(20);
    raise(error);
    return data ?? [];
  }
}
