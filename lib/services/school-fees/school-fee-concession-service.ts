// lib/services/school-fees/school-fee-concession-service.ts
//
// Named concession schemes (Staff Ward -50% tuition, Sibling -10%, RTE -100%)
// plus per-learner, per-year assignments.
//
// Assignments are scoped to ONE academic year on purpose — a concession must
// be re-granted each year rather than rolling forward silently. That is also
// why a late-admission waiver is just a `flat` scheme: mid-year joiners are
// billed the full year by design (§2 decision 10), so there is no pro-rata
// code path to keep in sync.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logActivityForCurrentUser } from '@/lib/utils/activity-logger-client';
import type {
  CreateSchoolFeeConcessionAssignmentDto,
  CreateSchoolFeeConcessionSchemeDto,
  SchoolFeeConcessionAssignment,
  SchoolFeeConcessionScheme,
  SchoolFeeConcessionSchemeFilters,
  UpdateSchoolFeeConcessionSchemeDto,
} from '@/types/school-fees';

const SCHEME_COLUMNS = `
  id, institution_id, code, name, mode, value, applies_to_all_heads, is_active,
  notes, created_at, updated_at,
  heads:school_fee_concession_scheme_heads(billing_category_id)
`;

const ASSIGNMENT_COLUMNS = `
  id, learner_id, scheme_id, academic_year_id, notes, created_at, created_by,
  scheme:school_fee_concession_schemes(id, code, name, mode, value)
`;

function raise(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  if (error.code === '23505') {
    if (error.message?.includes('assignments')) {
      throw new Error('That learner already has this concession for the selected academic year.');
    }
    throw new Error('A concession scheme with that code already exists for this institution.');
  }
  if (error.code === '23514') {
    throw new Error('A percentage concession cannot exceed 100%.');
  }
  if (error.code === '42501') {
    throw new Error('You do not have permission to manage school fee concessions.');
  }
  throw new Error(error.message || 'Unexpected database error');
}

/** Flatten the joined junction rows into a plain id array for the form. */
function withHeadIds(row: any): SchoolFeeConcessionScheme {
  return {
    ...row,
    head_ids: (row.heads ?? []).map((h: { billing_category_id: string }) => h.billing_category_id),
  } as SchoolFeeConcessionScheme;
}

export class SchoolFeeConcessionService {
  // -------------------------------------------------------------------------
  // Schemes
  // -------------------------------------------------------------------------

  static async listSchemes(
    filters: SchoolFeeConcessionSchemeFilters = {},
  ): Promise<SchoolFeeConcessionScheme[]> {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('school_fee_concession_schemes')
      .select(SCHEME_COLUMNS)
      .order('name', { ascending: true });

    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;
    raise(error);
    return (data ?? []).map(withHeadIds);
  }

  static async getScheme(id: string): Promise<SchoolFeeConcessionScheme | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('school_fee_concession_schemes')
      .select(SCHEME_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    raise(error);
    return data ? withHeadIds(data) : null;
  }

  static async createScheme(
    input: CreateSchoolFeeConcessionSchemeDto,
  ): Promise<SchoolFeeConcessionScheme> {
    const supabase = createClientSupabaseClient();
    const { head_ids = [], ...schemeFields } = input;

    const { data: created, error } = await supabase
      .from('school_fee_concession_schemes')
      .insert({ ...schemeFields, code: schemeFields.code.toUpperCase() })
      .select('id, institution_id, name')
      .single();
    raise(error);

    // Junction rows are meaningless when the scheme covers every head, so skip
    // them rather than storing a snapshot that silently goes stale as heads
    // are added.
    if (!input.applies_to_all_heads && head_ids.length > 0) {
      const { error: headError } = await supabase
        .from('school_fee_concession_scheme_heads')
        .insert(head_ids.map((id) => ({ scheme_id: created.id, billing_category_id: id })));
      if (headError) {
        await supabase.from('school_fee_concession_schemes').delete().eq('id', created.id);
        raise(headError);
      }
    }

    void logActivityForCurrentUser({
      actionType: 'create',
      resourceType: 'school_fee_concession_scheme',
      resourceId: created.id,
      resourceName: created.name,
      description: `Created school fee concession scheme "${created.name}"`,
      institutionId: created.institution_id,
    });

    const full = await this.getScheme(created.id);
    if (!full) throw new Error('school_fee_concession_scheme_create_failed_to_read_back');
    return full;
  }

  static async updateScheme(
    id: string,
    input: UpdateSchoolFeeConcessionSchemeDto,
  ): Promise<SchoolFeeConcessionScheme> {
    const supabase = createClientSupabaseClient();
    const { head_ids, ...schemeFields } = input;

    if (Object.keys(schemeFields).length > 0) {
      const { error } = await supabase
        .from('school_fee_concession_schemes')
        .update({
          ...schemeFields,
          ...(schemeFields.code ? { code: schemeFields.code.toUpperCase() } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      raise(error);
    }

    if (head_ids) {
      const { error: deleteError } = await supabase
        .from('school_fee_concession_scheme_heads')
        .delete()
        .eq('scheme_id', id);
      raise(deleteError);

      if (head_ids.length > 0 && !schemeFields.applies_to_all_heads) {
        const { error: insertError } = await supabase
          .from('school_fee_concession_scheme_heads')
          .insert(head_ids.map((h) => ({ scheme_id: id, billing_category_id: h })));
        raise(insertError);
      }
    }

    const full = await this.getScheme(id);
    if (!full) throw new Error('school_fee_concession_scheme_update_failed_to_read_back');

    void logActivityForCurrentUser({
      actionType: 'update',
      resourceType: 'school_fee_concession_scheme',
      resourceId: full.id,
      resourceName: full.name,
      description: `Updated school fee concession scheme "${full.name}"`,
      institutionId: full.institution_id,
    });

    return full;
  }

  /**
   * Deactivate rather than delete when the scheme is already assigned.
   * Deleting would cascade the assignments away, erasing the record of which
   * learners were discounted and why — the thing an auditor asks for.
   */
  static async deleteScheme(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { count, error: countError } = await supabase
      .from('school_fee_concession_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('scheme_id', id);
    raise(countError);

    if ((count ?? 0) > 0) {
      throw new Error(
        `This scheme is assigned to ${count} learner(s). Deactivate it instead of deleting, so the history is preserved.`,
      );
    }

    const { error } = await supabase
      .from('school_fee_concession_schemes')
      .delete()
      .eq('id', id);
    raise(error);
  }

  // -------------------------------------------------------------------------
  // Assignments
  // -------------------------------------------------------------------------

  static async listAssignmentsForLearner(
    learnerId: string,
    academicYearId?: string,
  ): Promise<SchoolFeeConcessionAssignment[]> {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('school_fee_concession_assignments')
      .select(ASSIGNMENT_COLUMNS)
      .eq('learner_id', learnerId)
      .order('created_at', { ascending: false });
    if (academicYearId) query = query.eq('academic_year_id', academicYearId);

    const { data, error } = await query;
    raise(error);
    return (data ?? []) as unknown as SchoolFeeConcessionAssignment[];
  }

  static async listAssignmentsForScheme(
    schemeId: string,
    academicYearId?: string,
  ): Promise<SchoolFeeConcessionAssignment[]> {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('school_fee_concession_assignments')
      .select(
        `${ASSIGNMENT_COLUMNS},
         learner:learners_profiles(id, first_name, last_name, roll_number)`,
      )
      .eq('scheme_id', schemeId)
      .order('created_at', { ascending: false });
    if (academicYearId) query = query.eq('academic_year_id', academicYearId);

    const { data, error } = await query;
    raise(error);
    return (data ?? []) as unknown as SchoolFeeConcessionAssignment[];
  }

  static async assign(
    input: CreateSchoolFeeConcessionAssignmentDto,
  ): Promise<SchoolFeeConcessionAssignment> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('school_fee_concession_assignments')
      .insert(input)
      .select(ASSIGNMENT_COLUMNS)
      .single();
    raise(error);
    return data as unknown as SchoolFeeConcessionAssignment;
  }

  /** Assign one scheme to many learners. Duplicates are ignored, not failed. */
  static async assignBulk(
    schemeId: string,
    academicYearId: string,
    learnerIds: string[],
  ): Promise<{ assigned: number; skipped: number }> {
    const supabase = createClientSupabaseClient();
    if (learnerIds.length === 0) return { assigned: 0, skipped: 0 };

    const rows = learnerIds.map((learner_id) => ({
      learner_id,
      scheme_id: schemeId,
      academic_year_id: academicYearId,
    }));

    // ignoreDuplicates leans on UNIQUE (learner_id, scheme_id, academic_year_id)
    // so re-running a bulk assign is a no-op rather than an error.
    const { data, error } = await supabase
      .from('school_fee_concession_assignments')
      .upsert(rows, {
        onConflict: 'learner_id,scheme_id,academic_year_id',
        ignoreDuplicates: true,
      })
      .select('id');
    raise(error);

    const assigned = data?.length ?? 0;
    return { assigned, skipped: learnerIds.length - assigned };
  }

  static async unassign(assignmentId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('school_fee_concession_assignments')
      .delete()
      .eq('id', assignmentId);
    raise(error);
  }
}
