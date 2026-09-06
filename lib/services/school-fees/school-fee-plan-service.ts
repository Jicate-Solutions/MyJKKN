// lib/services/school-fees/school-fee-plan-service.ts
//
// CRUD + lifecycle + clone + versioning for school_fee_plans and
// school_fee_plan_items.
//
// KEY DIFFERENCE FROM THE COLLEGE ENGINE:
// FeeStructureService keys on admission_year_id (cohort — a 4-year learner
// keeps their admission-year sheet for 4 years). This service keys on
// academic_year_id (CURRENT year — the fee re-fixes annually). Both columns
// exist on learners_profiles; nothing here touches admission_fee_structures.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logActivityForCurrentUser } from '@/lib/utils/activity-logger-client';
import type {
  CreateSchoolFeePlanDto,
  CreateSchoolFeePlanItemDto,
  SchoolFeePlan,
  SchoolFeePlanFilters,
  SchoolFeePlanItem,
  SchoolFeePlanListResponse,
  SchoolFeePlanWithItems,
  UpdateSchoolFeePlanDto,
} from '@/types/school-fees';

const PLAN_COLUMNS = `
  id, institution_id, program_id, academic_year_id, version, name, status,
  locked_at, superseded_by, notes, created_at, updated_at, created_by, updated_by
`;

const PLAN_WITH_JOINS = `
  ${PLAN_COLUMNS},
  institution:institutions(id, name, counselling_code),
  program:programs(id, program_name),
  academic_year:academic_years(id, academic_year_name)
`;

const ITEM_COLUMNS = `
  id, plan_id, billing_category_id, term_number, amount, is_one_time, sort_order,
  billing_category:billing_categories(id, category_name, kind)
`;

/**
 * Turn Postgres error codes into messages an operator can act on. Without this
 * the UI shows "duplicate key value violates unique constraint
 * ux_school_fee_plans_one_active", which tells a fee clerk nothing.
 */
function translate(error: { code?: string; message?: string } | null): Error | null {
  if (!error) return null;
  if (error.code === '23505') {
    if (error.message?.includes('ux_school_fee_plans_one_active')) {
      return new Error(
        'This class already has an active fee plan for that academic year. Archive it, or create a new version instead.',
      );
    }
    if (error.message?.includes('school_fee_plan_items')) {
      return new Error('The same fee head cannot appear twice in one term.');
    }
    if (error.message?.includes('school_fee_plans')) {
      return new Error('A plan with that version already exists for this class and year.');
    }
    return new Error('That record already exists.');
  }
  if (error.code === '23503') {
    return new Error('A referenced record (class, academic year or fee head) no longer exists.');
  }
  if (error.code === '23514') {
    return new Error('A value is outside the allowed range — check term numbers and amounts.');
  }
  if (error.code === '42501') {
    return new Error('You do not have permission to change school fee plans.');
  }
  return new Error(error.message || 'Unexpected database error');
}

function raise(error: { code?: string; message?: string } | null): void {
  const translated = translate(error);
  if (translated) throw translated;
}

export class SchoolFeePlanService {
  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /**
   * The classes a school can key a plan to. Read straight from `programs`
   * rather than borrowing another module's hook, so school-fees stays
   * self-contained.
   *
   * Ordering is deliberately natural, not alphabetical: "Standard 10" sorts
   * before "Standard 2" as text, and a fee grid listing X STD above II STD is
   * unreadable to the office.
   */
  static async listClasses(
    institutionId: string,
  ): Promise<Array<{ id: string; program_name: string }>> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('programs')
      .select('id, program_name')
      .eq('institution_id', institutionId)
      .eq('is_active', true);
    raise(error);

    const rows = (data ?? []) as Array<{ id: string; program_name: string }>;
    const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
    return rows.sort((a, b) => collator.compare(a.program_name, b.program_name));
  }

  /**
   * Enrolled learners for one school + academic year, optionally one class.
   *
   * lifecycle_status='active' is the enrolment marker — 'graduated',
   * 'inactive' and 'enquiry' rows must never be billed or offered a
   * concession. Shared with Phase 7's generation preview so both agree on who
   * counts as enrolled.
   */
  static async listEnrolledLearners(
    institutionId: string,
    academicYearId: string,
    programId?: string,
  ): Promise<
    Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      roll_number: string | null;
      program_id: string | null;
    }>
  > {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number, program_id')
      .eq('institution_id', institutionId)
      .eq('academic_year_id', academicYearId)
      .eq('lifecycle_status', 'active')
      .order('roll_number', { ascending: true, nullsFirst: false })
      .limit(2000);

    if (programId) query = query.eq('program_id', programId);

    const { data, error } = await query;
    raise(error);
    return (data ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      roll_number: string | null;
      program_id: string | null;
    }>;
  }

  /** Every plan for one institution+year, ordered for the class grid. */
  static async listForYear(
    institutionId: string,
    academicYearId: string,
  ): Promise<SchoolFeePlan[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('school_fee_plans')
      .select(PLAN_WITH_JOINS)
      .eq('institution_id', institutionId)
      .eq('academic_year_id', academicYearId)
      .order('status', { ascending: true })
      .order('version', { ascending: false });
    raise(error);
    return (data ?? []) as unknown as SchoolFeePlan[];
  }

  /**
   * Year totals for a set of plans, as plan_id -> sum(amount).
   *
   * Two round trips (plans, then their items) rather than one query with an
   * embedded filter: PostgREST needs `!inner` plus dotted filters to constrain
   * an embedded resource, and that syntax silently returns everything if the
   * hint is dropped. A wrong total on a fee screen is worse than an extra
   * request.
   */
  static async listItemTotals(planIds: string[]): Promise<Record<string, number>> {
    if (planIds.length === 0) return {};
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('school_fee_plan_items')
      .select('plan_id, amount')
      .in('plan_id', planIds);
    raise(error);

    const totals: Record<string, number> = {};
    for (const row of (data ?? []) as Array<{ plan_id: string; amount: number }>) {
      totals[row.plan_id] = (totals[row.plan_id] ?? 0) + Number(row.amount);
    }
    return totals;
  }

  /** Paginated list for the DataTable. RLS scopes to accessible institutions. */
  static async listPaginated(filters: SchoolFeePlanFilters): Promise<SchoolFeePlanListResponse> {
    const supabase = createClientSupabaseClient();
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;

    let query = supabase
      .from('school_fee_plans')
      .select(PLAN_WITH_JOINS, { count: 'exact' });

    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters.academic_year_id) query = query.eq('academic_year_id', filters.academic_year_id);
    if (filters.program_id) query = query.eq('program_id', filters.program_id);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.search) query = query.ilike('name', `%${filters.search}%`);

    const sortBy = filters.sortBy ?? 'updated_at';
    query = query
      .order(sortBy, { ascending: filters.sortOrder === 'asc' })
      .range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;
    raise(error);

    const total = count ?? 0;
    return {
      data: (data ?? []) as unknown as SchoolFeePlan[],
      metadata: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  static async getWithItems(id: string): Promise<SchoolFeePlanWithItems | null> {
    const supabase = createClientSupabaseClient();

    const { data: plan, error: planError } = await supabase
      .from('school_fee_plans')
      .select(PLAN_WITH_JOINS)
      .eq('id', id)
      .maybeSingle();
    raise(planError);
    if (!plan) return null;

    const { data: items, error: itemError } = await supabase
      .from('school_fee_plan_items')
      .select(ITEM_COLUMNS)
      .eq('plan_id', id)
      .order('sort_order', { ascending: true })
      .order('term_number', { ascending: true });
    raise(itemError);

    return {
      ...(plan as unknown as SchoolFeePlan),
      items: (items ?? []) as unknown as SchoolFeePlanItem[],
    };
  }

  /** The single active plan for a class+year, or null. Mirrors what generation resolves. */
  static async findActive(
    institutionId: string,
    programId: string,
    academicYearId: string,
  ): Promise<SchoolFeePlanWithItems | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('school_fee_plans')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('program_id', programId)
      .eq('academic_year_id', academicYearId)
      .eq('status', 'active')
      .maybeSingle();
    raise(error);
    return data ? this.getWithItems(data.id) : null;
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /**
   * Create a plan and its grid.
   *
   * Parent-then-items, with an explicit parent delete if the item write fails.
   * PostgREST gives us no cross-table transaction, so this hand-rolled rollback
   * is what stops a plan existing with a half-written grid — a plan whose
   * amounts are wrong is worse than no plan, because generation would bill it.
   */
  static async create(input: CreateSchoolFeePlanDto): Promise<SchoolFeePlanWithItems> {
    const supabase = createClientSupabaseClient();
    const { items, ...planFields } = input;

    const { data: created, error: createError } = await supabase
      .from('school_fee_plans')
      .insert({ ...planFields, status: planFields.status ?? 'draft' })
      .select('id, institution_id, name')
      .single();
    raise(createError);

    if (items.length > 0) {
      const { error: itemError } = await supabase
        .from('school_fee_plan_items')
        .insert(this.toItemRows(created.id, items));
      if (itemError) {
        await supabase.from('school_fee_plans').delete().eq('id', created.id);
        raise(itemError);
      }
    }

    const full = await this.getWithItems(created.id);
    if (!full) throw new Error('school_fee_plan_create_failed_to_read_back');

    void logActivityForCurrentUser({
      actionType: 'create',
      resourceType: 'school_fee_plan',
      resourceId: full.id,
      resourceName: full.name,
      description: `Created school fee plan "${full.name}" with ${items.length} grid cell(s)`,
      institutionId: full.institution_id,
    });

    return full;
  }

  /**
   * Update plan metadata and, if `items` is supplied, replace the whole grid.
   *
   * Refuses once locked_at is set. The DB trigger that enforces this lands in
   * Phase 9; until then this is the only guard, so it is checked here rather
   * than in the form — a second browser tab must hit the same wall.
   */
  static async update(id: string, input: UpdateSchoolFeePlanDto): Promise<SchoolFeePlanWithItems> {
    const supabase = createClientSupabaseClient();
    await this.assertUnlocked(id);

    const { items, ...planFields } = input;

    if (Object.keys(planFields).length > 0) {
      const { error } = await supabase
        .from('school_fee_plans')
        .update({ ...planFields, updated_at: new Date().toISOString() })
        .eq('id', id);
      raise(error);
    }

    if (items) await this.replaceItems(id, items);

    const full = await this.getWithItems(id);
    if (!full) throw new Error('school_fee_plan_update_failed_to_read_back');

    void logActivityForCurrentUser({
      actionType: 'update',
      resourceType: 'school_fee_plan',
      resourceId: full.id,
      resourceName: full.name,
      description: `Updated school fee plan "${full.name}"`,
      institutionId: full.institution_id,
    });

    return full;
  }

  /**
   * Swap the grid wholesale. Delete-then-insert is safe here (unlike the term
   * calendar) because a plan with a half-written grid is only reachable while
   * it is a draft — a locked plan is rejected by assertUnlocked above.
   */
  static async replaceItems(planId: string, items: CreateSchoolFeePlanItemDto[]): Promise<void> {
    const supabase = createClientSupabaseClient();
    await this.assertUnlocked(planId);

    const { error: deleteError } = await supabase
      .from('school_fee_plan_items')
      .delete()
      .eq('plan_id', planId);
    raise(deleteError);

    if (items.length === 0) return;

    const { error: insertError } = await supabase
      .from('school_fee_plan_items')
      .insert(this.toItemRows(planId, items));
    raise(insertError);
  }

  static async activate(id: string): Promise<SchoolFeePlan> {
    return this.setStatus(id, 'active');
  }

  static async archive(id: string): Promise<SchoolFeePlan> {
    return this.setStatus(id, 'archived');
  }

  /**
   * Hard delete. Items cascade. Blocked once the plan has generated bills —
   * the FK on billing_student_bills.school_fee_plan_id is ON DELETE SET NULL,
   * so deleting a locked plan would silently orphan real bills from the plan
   * that explains their amounts.
   */
  static async delete(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { data: row, error: readError } = await supabase
      .from('school_fee_plans')
      .select('id, name, institution_id, locked_at')
      .eq('id', id)
      .maybeSingle();
    raise(readError);
    if (!row) return;

    if (row.locked_at) {
      throw new Error(
        'This plan has already generated bills and cannot be deleted. Archive it instead.',
      );
    }

    const { error } = await supabase.from('school_fee_plans').delete().eq('id', id);
    raise(error);

    void logActivityForCurrentUser({
      actionType: 'delete',
      resourceType: 'school_fee_plan',
      resourceId: row.id,
      resourceName: row.name,
      description: `Deleted school fee plan "${row.name}"`,
      institutionId: row.institution_id,
    });
  }

  // -------------------------------------------------------------------------
  // Clone + version
  // -------------------------------------------------------------------------

  /**
   * Copy every ACTIVE plan from one academic year into another as drafts.
   * This is the normal year-on-year path: clone, then retype the cells that
   * changed. Classes that already have a plan in the target year are skipped
   * rather than duplicated, so re-running is safe.
   */
  static async cloneYear(
    institutionId: string,
    fromAcademicYearId: string,
    toAcademicYearId: string,
  ): Promise<{ cloned: number; skipped: number }> {
    if (fromAcademicYearId === toAcademicYearId) {
      throw new Error('Source and target academic year must differ.');
    }

    const source = await this.listForYear(institutionId, fromAcademicYearId);
    const active = source.filter((p) => p.status === 'active');
    if (active.length === 0) {
      throw new Error('The source academic year has no active fee plans to clone.');
    }

    const existing = await this.listForYear(institutionId, toAcademicYearId);
    const taken = new Set(existing.map((p) => p.program_id));

    let cloned = 0;
    let skipped = 0;

    for (const plan of active) {
      if (taken.has(plan.program_id)) {
        skipped += 1;
        continue;
      }
      const full = await this.getWithItems(plan.id);
      if (!full) continue;

      await this.create({
        institution_id: institutionId,
        program_id: plan.program_id,
        academic_year_id: toAcademicYearId,
        name: plan.name,
        status: 'draft',
        notes: plan.notes,
        items: full.items.map((i) => ({
          billing_category_id: i.billing_category_id,
          term_number: i.term_number,
          amount: i.amount,
          is_one_time: i.is_one_time,
          sort_order: i.sort_order,
        })),
      });
      cloned += 1;
    }

    return { cloned, skipped };
  }

  /**
   * Create the next version of a LOCKED plan as a draft copy (design §5.3).
   * Activating the new version — and superseding the old bills — is Phase 9;
   * this only produces the editable copy.
   */
  static async createNextVersion(planId: string): Promise<SchoolFeePlanWithItems> {
    const supabase = createClientSupabaseClient();

    const source = await this.getWithItems(planId);
    if (!source) throw new Error('Plan not found.');

    const { data: siblings, error } = await supabase
      .from('school_fee_plans')
      .select('version')
      .eq('institution_id', source.institution_id)
      .eq('program_id', source.program_id)
      .eq('academic_year_id', source.academic_year_id)
      .order('version', { ascending: false })
      .limit(1);
    raise(error);

    const nextVersion = (siblings?.[0]?.version ?? source.version) + 1;

    const { data: created, error: createError } = await supabase
      .from('school_fee_plans')
      .insert({
        institution_id: source.institution_id,
        program_id: source.program_id,
        academic_year_id: source.academic_year_id,
        version: nextVersion,
        name: source.name,
        status: 'draft',
        notes: source.notes,
      })
      .select('id')
      .single();
    raise(createError);

    if (source.items.length > 0) {
      const { error: itemError } = await supabase
        .from('school_fee_plan_items')
        .insert(
          this.toItemRows(
            created.id,
            source.items.map((i) => ({
              billing_category_id: i.billing_category_id,
              term_number: i.term_number,
              amount: i.amount,
              is_one_time: i.is_one_time,
              sort_order: i.sort_order,
            })),
          ),
        );
      if (itemError) {
        await supabase.from('school_fee_plans').delete().eq('id', created.id);
        raise(itemError);
      }
    }

    const full = await this.getWithItems(created.id);
    if (!full) throw new Error('school_fee_plan_version_failed_to_read_back');

    void logActivityForCurrentUser({
      actionType: 'create',
      resourceType: 'school_fee_plan',
      resourceId: full.id,
      resourceName: full.name,
      description: `Created version ${nextVersion} of school fee plan "${full.name}"`,
      institutionId: full.institution_id,
    });

    return full;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private static toItemRows(planId: string, items: CreateSchoolFeePlanItemDto[]) {
    return items.map((item, index) => ({
      plan_id: planId,
      billing_category_id: item.billing_category_id,
      term_number: item.term_number,
      amount: item.amount,
      is_one_time: item.is_one_time ?? false,
      sort_order: item.sort_order ?? index,
    }));
  }

  private static async assertUnlocked(planId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('school_fee_plans')
      .select('locked_at')
      .eq('id', planId)
      .maybeSingle();
    raise(error);
    if (data?.locked_at) {
      throw new Error(
        'This plan has already generated bills and is locked. Create a new version to change the amounts.',
      );
    }
  }

  private static async setStatus(
    id: string,
    status: 'active' | 'archived',
  ): Promise<SchoolFeePlan> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('school_fee_plans')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(PLAN_COLUMNS)
      .single();
    raise(error);

    void logActivityForCurrentUser({
      actionType: 'update',
      resourceType: 'school_fee_plan',
      resourceId: data.id,
      resourceName: data.name,
      description: `School fee plan "${data.name}" set to ${status}`,
      institutionId: data.institution_id,
    });

    return data as SchoolFeePlan;
  }
}
