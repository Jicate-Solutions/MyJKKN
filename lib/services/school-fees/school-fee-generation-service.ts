// lib/services/school-fees/school-fee-generation-service.ts
//
// The only client path that creates school fee bills.
//
// `generate()` defaults to a DRY RUN. Committing is an explicit second call
// with dryRun=false — there is no single-call "just do it" convenience, because
// the thing it does is write financial records for hundreds of learners.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  GenerationPreviewRow,
  GenerationResult,
  SchoolFeeReportRow,
} from '@/types/school-fees';

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


  /**
   * Every generated school-fee bill for a school + year, learner by learner.
   *
   * Reports what was ACTUALLY written, not what the preview projected — it
   * reads billing_student_bills, so a class skipped by a guard simply has no
   * rows here. That is the point: this is the artefact you check a generation
   * run against.
   *
   * PAGED. ~550 learners x ~8 fee rows is well past PostgREST's 1000-row
   * default, and that cap truncates SILENTLY — a report that quietly stops at
   * 1000 rows is worse than one that fails.
   */
  static async getLearnerWiseReport(
    institutionId: string,
    academicYearId: string,
  ): Promise<SchoolFeeReportRow[]> {
    const supabase = createClientSupabaseClient();
    const PAGE = 1000;
    const out: SchoolFeeReportRow[] = [];

    for (let from = 0; ; from += PAGE) {
      // 'as any': types/supabase.ts predates 20260813100005, so the generated
      // row type still lacks school_fee_plan_id / term_number.
      const { data, error } = await (supabase as any)
        .from('billing_student_bills')
        .select(
          `
          id,
          student_id,
          term_number,
          due_date,
          final_amount,
          balance_amount,
          status,
          bill_description,
          item_category:billing_categories(category_name),
          student:learners_profiles!student_id(
            first_name,
            last_name,
            roll_number,
            register_number,
            program:programs!program_id(program_name),
            section:sections!section_id(section_name)
          )
          `,
        )
        .eq('institution_id', institutionId)
        .eq('academic_year_id', academicYearId)
        .not('school_fee_plan_id', 'is', null)
        .order('student_id', { ascending: true })
        .order('term_number', { ascending: true })
        .range(from, from + PAGE - 1);

      raise(error);
      const page = (data ?? []) as Record<string, unknown>[];

      for (const row of page) {
        const one = <T,>(v: unknown): T | undefined =>
          (Array.isArray(v) ? v[0] : v) as T | undefined;
        const student = one<Record<string, unknown>>(row.student);
        const category = one<{ category_name?: string }>(row.item_category);
        const program = one<{ program_name?: string }>(student?.program);
        const section = one<{ section_name?: string }>(student?.section);

        const finalAmount = num(row.final_amount);
        const balance = num(row.balance_amount);

        out.push({
          student_id: String(row.student_id),
          learner_name: `${student?.first_name ?? ''} ${student?.last_name ?? ''}`.trim(),
          roll_number: (student?.roll_number as string) || '',
          register_number: (student?.register_number as string) || '',
          class_name: program?.program_name ?? '',
          section_name: section?.section_name ?? '',
          fee_head: category?.category_name || (row.bill_description as string) || 'Fee',
          term_number: row.term_number == null ? null : Number(row.term_number),
          due_date: (row.due_date as string) ?? null,
          amount: finalAmount,
          // balance_amount is NULL on legacy rows, where the full amount is
          // still owed — same fallback the counter uses.
          balance: balance > 0 ? balance : finalAmount,
          status: String(row.status ?? ''),
        });
      }

      if (page.length < PAGE) break;
    }

    return out;
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
