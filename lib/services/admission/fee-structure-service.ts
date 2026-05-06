import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logActivityForCurrentUser } from '@/lib/utils/activity-logger-client';
import { AdmissionFeesActivityTemplates } from '@/lib/utils/admission-fees-activity-templates';
import type {
  AdmissionFeeStructure,
  AdmissionFeeStructureItem,
  AdmissionFeeStructureWithItems,
  CreateAdmissionFeeStructureInput,
  UpdateAdmissionFeeStructureInput,
  FeeStructureMatrixDimensions,
  FeeStructureCoverageReportRow,
} from '@/types/admission';

/**
 * CRUD + clone + lookup + coverage for admission_fee_structures and items.
 *
 * Every mutation explicitly destructures { error }. Item write goes through
 * a transaction-shaped flow (parent first, then items) — for v1 we tolerate
 * the small race window since ON CONFLICT DO UPDATE makes the item write
 * idempotent, and the bigger atomic guarantee will land in Plan 3 via RPC.
 */
export class FeeStructureService {
  static async list(institutionId: string, academicYearId?: string): Promise<AdmissionFeeStructure[]> {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('admission_fee_structures')
      .select('*')
      .eq('institution_id', institutionId)
      .order('updated_at', { ascending: false });
    if (academicYearId) query = query.eq('admission_year_id', academicYearId);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  /**
   * Paginated list with joined display names — for the main admin list page's
   * heavyweight DataTable. RLS scopes to institutions the caller has access to.
   * Returns { data, metadata: { total, totalPages, page, limit } } for the
   * project-standard DataTable shape.
   */
  static async listAllPaginated(params: {
    page: number;
    limit: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    institution_id?: string;
    admission_year_id?: string;
    status?: 'draft' | 'active' | 'archived';
  }): Promise<{
    data: Array<
      AdmissionFeeStructure & {
        institution_name: string | null;
        degree_name: string | null;
        department_name: string | null;
        programme_name: string | null;
        quota_name: string | null;
        community_name: string | null;
        accommodation_name: string | null;
        admission_year_name: string | null;
        item_count: number;
      }
    >;
    metadata: { total: number; totalPages: number; page: number; limit: number };
  }> {
    const supabase = createClientSupabaseClient();

    const page = Math.max(1, params.page);
    const limit = Math.max(1, Math.min(200, params.limit));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const sortColumn = params.sortBy && params.sortBy.length > 0 ? params.sortBy : 'updated_at';
    const ascending = params.sortOrder === 'asc';

    let query = supabase
      .from('admission_fee_structures')
      .select(
        `
        *,
        institution:institutions(id, name),
        degree:degrees(id, degree_name),
        department:departments(id, department_name),
        programme:programs(id, program_name),
        quota:quotas(id, name),
        community:community_categories(id, name),
        accommodation:accommodation_types(id, name),
        admission_year:admission_years(id, admission_year_name),
        items:admission_fee_structure_items(id)
      `,
        { count: 'exact' },
      )
      .order(sortColumn, { ascending })
      .range(from, to);

    if (params.institution_id) query = query.eq('institution_id', params.institution_id);
    if (params.admission_year_id) query = query.eq('admission_year_id', params.admission_year_id);
    if (params.status) query = query.eq('status', params.status);
    if (params.search && params.search.trim()) query = query.ilike('name', `%${params.search.trim()}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    interface Joined {
      institution: { name: string } | null;
      degree: { degree_name: string } | null;
      department: { department_name: string } | null;
      programme: { program_name: string } | null;
      quota: { name: string } | null;
      community: { name: string } | null;
      accommodation: { name: string } | null;
      admission_year: { admission_year_name: string } | null;
      items: Array<{ id: string }>;
    }

    const rows = (data ?? []).map((row) => {
      const joined = row as unknown as AdmissionFeeStructure & Joined;
      return {
        ...joined,
        institution_name: joined.institution?.name ?? null,
        degree_name: joined.degree?.degree_name ?? null,
        department_name: joined.department?.department_name ?? null,
        programme_name: joined.programme?.program_name ?? null,
        quota_name: joined.quota?.name ?? null,
        community_name: joined.community?.name ?? null,
        accommodation_name: joined.accommodation?.name ?? null,
        admission_year_name: joined.admission_year?.admission_year_name ?? null,
        item_count: joined.items?.length ?? 0,
      };
    });

    const total = count ?? rows.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      data: rows,
      metadata: { total, totalPages, page, limit },
    };
  }

  static async getWithItems(id: string): Promise<AdmissionFeeStructureWithItems | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_structures')
      .select('*, items:admission_fee_structure_items(*)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as AdmissionFeeStructureWithItems | null) ?? null;
  }

  /**
   * Detail loader for the admin detail page. Returns the structure + items
   * + joined display names + billing-category names per item, in one query.
   * Don't use this for hot paths — the joined shape is heavier than
   * `getWithItems`, which is the right choice for the resolution flow.
   */
  static async getDetailById(id: string): Promise<
    | (AdmissionFeeStructure & {
        institution_name: string | null;
        degree_name: string | null;
        department_name: string | null;
        programme_name: string | null;
        quota_name: string | null;
        community_name: string | null;
        accommodation_name: string | null;
        admission_year_name: string | null;
        items: Array<
          AdmissionFeeStructureItem & {
            category_name: string | null;
            category_frequency: string | null;
          }
        >;
      })
    | null
  > {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_structures')
      .select(`
        *,
        institution:institutions(id, name),
        degree:degrees(id, degree_name),
        department:departments(id, department_name),
        programme:programs(id, program_name),
        quota:quotas(id, name),
        community:community_categories(id, name),
        accommodation:accommodation_types(id, name),
        admission_year:admission_years(id, admission_year_name),
        items:admission_fee_structure_items(*, billing_category:billing_categories(id, category_name, frequency))
      `)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    interface JoinedRow {
      institution: { name: string } | null;
      degree: { degree_name: string } | null;
      department: { department_name: string } | null;
      programme: { program_name: string } | null;
      quota: { name: string } | null;
      community: { name: string } | null;
      accommodation: { name: string } | null;
      admission_year: { admission_year_name: string } | null;
      items: Array<{
        billing_category: { category_name: string; frequency: string } | null;
      }>;
    }
    const joined = data as unknown as AdmissionFeeStructureWithItems & JoinedRow;

    return {
      ...joined,
      institution_name: joined.institution?.name ?? null,
      degree_name: joined.degree?.degree_name ?? null,
      department_name: joined.department?.department_name ?? null,
      programme_name: joined.programme?.program_name ?? null,
      quota_name: joined.quota?.name ?? null,
      community_name: joined.community?.name ?? null,
      accommodation_name: joined.accommodation?.name ?? null,
      admission_year_name: joined.admission_year?.admission_year_name ?? null,
      items: joined.items.map((it) => {
        const withJoin = it as typeof it & {
          billing_category: { category_name: string; frequency: string } | null;
        };
        return {
          ...it,
          category_name: withJoin.billing_category?.category_name ?? null,
          category_frequency: withJoin.billing_category?.frequency ?? null,
        };
      }),
    };
  }

  static async findByDimensions(d: FeeStructureMatrixDimensions): Promise<AdmissionFeeStructureWithItems | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_structures')
      .select('*, items:admission_fee_structure_items(*)')
      .eq('institution_id', d.institution_id)
      .eq('degree_id', d.degree_id)
      .eq('department_id', d.department_id)
      .eq('programme_id', d.programme_id)
      .eq('quota_id', d.quota_id)
      .eq('community_category_id', d.community_category_id)
      .eq('accommodation_type_id', d.accommodation_type_id)
      .eq('admission_year_id', d.admission_year_id)
      .eq('status', 'active')
      .maybeSingle();
    if (error) throw error;
    return (data as AdmissionFeeStructureWithItems | null) ?? null;
  }

  static async create(input: CreateAdmissionFeeStructureInput): Promise<AdmissionFeeStructureWithItems> {
    const supabase = createClientSupabaseClient();
    const { items, ...structureFields } = input;
    const { data: created, error: createError } = await supabase
      .from('admission_fee_structures')
      .insert(structureFields)
      .select('*')
      .single();
    if (createError) throw createError;

    if (items.length > 0) {
      const rows = items.map((it, idx) => ({
        fee_structure_id: created.id,
        billing_category_id: it.billing_category_id,
        amount: it.amount,
        is_optional: it.is_optional ?? false,
        sort_order: it.sort_order ?? idx,
      }));
      const { error: itemError } = await supabase.from('admission_fee_structure_items').insert(rows);
      if (itemError) throw itemError;
    }

    const fullRow = await this.getWithItems(created.id);
    if (!fullRow) throw new Error('fee_structure_create_failed_to_read_back');

    void logActivityForCurrentUser({
      actionType: 'create',
      resourceType: 'admission_fee_structure',
      resourceId: fullRow.id,
      resourceName: fullRow.name,
      description: AdmissionFeesActivityTemplates.fee_structure.created(fullRow.name),
      institutionId: fullRow.institution_id,
    });

    return fullRow;
  }

  static async update(id: string, input: UpdateAdmissionFeeStructureInput): Promise<AdmissionFeeStructure> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_structures')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;

    // Choose template based on the status transition or generic update.
    const template =
      input.status === 'archived' ? AdmissionFeesActivityTemplates.fee_structure.archived(data.name)
      : input.status === 'active'   ? AdmissionFeesActivityTemplates.fee_structure.activated(data.name)
      :                               AdmissionFeesActivityTemplates.fee_structure.updated(data.name);

    const actionType =
      input.status === 'archived' ? 'archive'
      : input.status === 'active'   ? 'activate'
      :                               'update';

    void logActivityForCurrentUser({
      actionType,
      resourceType: 'admission_fee_structure',
      resourceId: data.id,
      resourceName: data.name,
      description: template,
      institutionId: data.institution_id,
    });

    return data;
  }

  static async upsertItems(structureId: string, items: AdmissionFeeStructureItem[]): Promise<void> {
    const supabase = createClientSupabaseClient();
    const rows = items.map((it, idx) => ({
      fee_structure_id: structureId,
      billing_category_id: it.billing_category_id,
      amount: it.amount,
      is_optional: it.is_optional ?? false,
      sort_order: it.sort_order ?? idx,
    }));
    const { error } = await supabase
      .from('admission_fee_structure_items')
      .upsert(rows, { onConflict: 'fee_structure_id,billing_category_id' });
    if (error) throw error;
  }

  static async removeItem(itemId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase.from('admission_fee_structure_items').delete().eq('id', itemId);
    if (error) throw error;
  }

  static async archive(id: string): Promise<AdmissionFeeStructure> {
    return this.update(id, { status: 'archived' });
  }

  static async activate(id: string): Promise<AdmissionFeeStructure> {
    return this.update(id, { status: 'active' });
  }

  /**
   * Clone a structure to a new academic year. All matrix dimensions copied
   * EXCEPT admission_year_id which is set to newAcademicYearId. Optional
   * dimension overrides via `overrides`.
   */
  static async cloneToAcademicYear(
    sourceId: string,
    newAcademicYearId: string,
    overrides?: Partial<FeeStructureMatrixDimensions> & { name?: string },
  ): Promise<AdmissionFeeStructureWithItems> {
    const source = await this.getWithItems(sourceId);
    if (!source) throw new Error('fee_structure_not_found');
    const dims: FeeStructureMatrixDimensions = {
      institution_id:        overrides?.institution_id        ?? source.institution_id,
      degree_id:             overrides?.degree_id             ?? source.degree_id,
      department_id:         overrides?.department_id         ?? source.department_id,
      programme_id:          overrides?.programme_id          ?? source.programme_id,
      quota_id:              overrides?.quota_id              ?? source.quota_id,
      community_category_id: overrides?.community_category_id ?? source.community_category_id,
      accommodation_type_id: overrides?.accommodation_type_id ?? source.accommodation_type_id,
      admission_year_id:     newAcademicYearId,
    };
    return this.create({
      ...dims,
      name: overrides?.name ?? `${source.name} (cloned)`,
      status: 'draft',
      notes: source.notes,
      items: source.items.map(it => ({
        billing_category_id: it.billing_category_id,
        amount: it.amount,
        is_optional: it.is_optional,
        sort_order: it.sort_order,
      })),
    });
  }

  /**
   * Coverage report — for each (institution, academic_year) the count of
   * configured fee_structures vs the total number of valid leaves
   * (programs × quotas × communities × accommodation_types). v1 returns
   * one row per existing structure plus a separate `gaps` query for missing
   * ones; v1.5 will compute true cartesian gaps.
   */
  static async getCoverageReport(institutionId: string, admissionYearId: string): Promise<FeeStructureCoverageReportRow[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_structures')
      .select(`
        institution_id, degree_id, department_id, programme_id,
        quota_id, community_category_id, accommodation_type_id, admission_year_id,
        items:admission_fee_structure_items(id)
      `)
      .eq('institution_id', institutionId)
      .eq('admission_year_id', admissionYearId)
      .eq('status', 'active');
    if (error) throw error;
    return (data ?? []).map(row => ({
      institution_id: row.institution_id,
      degree_id: row.degree_id,
      department_id: row.department_id,
      programme_id: row.programme_id,
      quota_id: row.quota_id,
      community_category_id: row.community_category_id,
      accommodation_type_id: row.accommodation_type_id,
      admission_year_id: row.admission_year_id,
      has_structure: true,
      item_count: (row.items as Array<{ id: string }>).length,
    }));
  }
}
