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
      .select('*, communities:admission_fee_structure_communities(community_category_id)')
      .eq('institution_id', institutionId)
      .order('updated_at', { ascending: false });
    if (academicYearId) query = query.eq('admission_year_id', academicYearId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      ...row,
      community_category_ids: (row.communities ?? []).map(
        (c: { community_category_id: string }) => c.community_category_id,
      ),
    })) as AdmissionFeeStructure[];
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
        /** Comma-joined community names, for legacy single-cell rendering. */
        community_name: string | null;
        /** All community names attached to this structure (via junction). */
        community_names: string[];
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
        communities:admission_fee_structure_communities(community_category_id, community_category:community_categories(id, name)),
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
      communities: Array<{
        community_category_id: string;
        community_category: { id: string; name: string } | null;
      }>;
      accommodation: { name: string } | null;
      admission_year: { admission_year_name: string } | null;
      items: Array<{ id: string }>;
    }

    const rows = (data ?? []).map((row) => {
      const joined = row as unknown as AdmissionFeeStructure & Joined;
      const communityIds = (joined.communities ?? []).map((c) => c.community_category_id);
      const communityNames = (joined.communities ?? [])
        .map((c) => c.community_category?.name)
        .filter((n): n is string => !!n);
      return {
        ...joined,
        community_category_ids: communityIds,
        institution_name: joined.institution?.name ?? null,
        degree_name: joined.degree?.degree_name ?? null,
        department_name: joined.department?.department_name ?? null,
        programme_name: joined.programme?.program_name ?? null,
        quota_name: joined.quota?.name ?? null,
        // Backwards-compat single-name field — joins all linked communities
        // for legacy table cells. Most consumers should switch to
        // `community_names` (plural) when rendering chips.
        community_name: communityNames.join(', ') || null,
        community_names: communityNames,
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
      .select(
        '*, items:admission_fee_structure_items(*),' +
        ' communities:admission_fee_structure_communities(community_category_id)',
      )
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as any;
    return {
      ...row,
      community_category_ids: (row.communities ?? []).map(
        (c: { community_category_id: string }) => c.community_category_id,
      ),
    } as AdmissionFeeStructureWithItems;
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
        community_names: string[];
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
        communities:admission_fee_structure_communities(community_category_id, community_category:community_categories(id, name)),
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
      communities: Array<{
        community_category_id: string;
        community_category: { id: string; name: string } | null;
      }>;
      accommodation: { name: string } | null;
      admission_year: { admission_year_name: string } | null;
      items: Array<{
        billing_category: { category_name: string; frequency: string } | null;
      }>;
    }
    const joined = data as unknown as AdmissionFeeStructureWithItems & JoinedRow;
    const communityIds = (joined.communities ?? []).map((c) => c.community_category_id);
    const communityNames = (joined.communities ?? [])
      .map((c) => c.community_category?.name)
      .filter((n): n is string => !!n);

    return {
      ...joined,
      community_category_ids: communityIds,
      institution_name: joined.institution?.name ?? null,
      degree_name: joined.degree?.degree_name ?? null,
      department_name: joined.department?.department_name ?? null,
      programme_name: joined.programme?.program_name ?? null,
      quota_name: joined.quota?.name ?? null,
      community_name: communityNames.join(', ') || null,
      community_names: communityNames,
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

  /**
   * Find a single active structure that matches the 7 matrix dimensions AND
   * covers the given community via the junction. Used by the editor when the
   * tree-rail leaf includes a community: returns the structure that serves
   * that community for those 7 dims (or null if none).
   *
   * The trigger `_fee_structure_community_no_overlap` guarantees this lookup
   * cannot match more than one active structure, so `.maybeSingle()` is safe.
   */
  static async findByDimensions(
    d: FeeStructureMatrixDimensions,
    community_category_id: string,
  ): Promise<AdmissionFeeStructureWithItems | null> {
    const supabase = createClientSupabaseClient();

    // 1. Resolve which active structures cover this community for these 7 dims.
    //    The junction is keyed (structure, community) and we need to filter by
    //    parent dimensions, so we query the junction with an inner join.
    const { data: junctionRows, error: junctionErr } = await supabase
      .from('admission_fee_structure_communities')
      .select(
        `fee_structure_id,
         structure:admission_fee_structures!inner(id, status,
           institution_id, degree_id, department_id, programme_id,
           quota_id, accommodation_type_id, admission_year_id)`,
      )
      .eq('community_category_id', community_category_id)
      .eq('structure.institution_id', d.institution_id)
      .eq('structure.degree_id', d.degree_id)
      .eq('structure.department_id', d.department_id)
      .eq('structure.programme_id', d.programme_id)
      .eq('structure.quota_id', d.quota_id)
      .eq('structure.accommodation_type_id', d.accommodation_type_id)
      .eq('structure.admission_year_id', d.admission_year_id)
      .eq('structure.status', 'active')
      .limit(1);
    if (junctionErr) throw junctionErr;
    const structureId = junctionRows?.[0]?.fee_structure_id;
    if (!structureId) return null;

    // 2. Hydrate the full structure (with items + all linked communities) so
    //    the editor can render the existing community chips.
    return this.getWithItems(structureId);
  }

  static async create(input: CreateAdmissionFeeStructureInput): Promise<AdmissionFeeStructureWithItems> {
    const supabase = createClientSupabaseClient();
    const { items, community_category_ids, ...structureFields } = input;

    if (!community_category_ids || community_category_ids.length === 0) {
      throw new Error('At least one community must be selected for the fee structure.');
    }

    // 1. Parent row.
    const { data: created, error: createError } = await supabase
      .from('admission_fee_structures')
      .insert(structureFields)
      .select('*')
      .single();
    if (createError) throw createError;

    // 2. Junction rows. The overlap-prevention trigger may reject one of
    //    these — when that happens, roll back the parent so the operator
    //    isn't left with an orphan with zero communities.
    const junctionRows = community_category_ids.map((cid) => ({
      fee_structure_id: created.id,
      community_category_id: cid,
    }));
    const { error: junctionError } = await supabase
      .from('admission_fee_structure_communities')
      .insert(junctionRows);
    if (junctionError) {
      await supabase.from('admission_fee_structures').delete().eq('id', created.id);
      throw junctionError;
    }

    // 3. Items.
    if (items.length > 0) {
      const rows = items.map((it, idx) => ({
        fee_structure_id: created.id,
        billing_category_id: it.billing_category_id,
        amount: it.amount,
        is_optional: it.is_optional ?? false,
        sort_order: it.sort_order ?? idx,
      }));
      const { error: itemError } = await supabase.from('admission_fee_structure_items').insert(rows);
      if (itemError) {
        // Item failure also rolls back parent + junction (parent cascade).
        await supabase.from('admission_fee_structures').delete().eq('id', created.id);
        throw itemError;
      }
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
    const { community_category_ids, ...structureFields } = input;

    // 1. Parent fields (if any non-community fields supplied).
    let parentRow: AdmissionFeeStructure | null = null;
    if (Object.keys(structureFields).length > 0) {
      const { data, error } = await supabase
        .from('admission_fee_structures')
        .update(structureFields)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      parentRow = data as AdmissionFeeStructure;
    }

    // 2. Community diff — only when caller supplied a list.
    if (community_category_ids) {
      if (community_category_ids.length === 0) {
        throw new Error('At least one community must remain on the fee structure.');
      }
      const { data: existing, error: readErr } = await supabase
        .from('admission_fee_structure_communities')
        .select('community_category_id')
        .eq('fee_structure_id', id);
      if (readErr) throw readErr;

      const existingSet = new Set((existing ?? []).map((r) => r.community_category_id));
      const desiredSet = new Set(community_category_ids);

      const toAdd = community_category_ids.filter((c) => !existingSet.has(c));
      const toRemove = [...existingSet].filter((c) => !desiredSet.has(c));

      if (toRemove.length > 0) {
        const { error: delErr } = await supabase
          .from('admission_fee_structure_communities')
          .delete()
          .eq('fee_structure_id', id)
          .in('community_category_id', toRemove);
        if (delErr) throw delErr;
      }
      if (toAdd.length > 0) {
        const { error: insErr } = await supabase
          .from('admission_fee_structure_communities')
          .insert(toAdd.map((cid) => ({ fee_structure_id: id, community_category_id: cid })));
        if (insErr) throw insErr;
      }
    }

    // Read back parent if it wasn't updated above (community-only changes).
    if (!parentRow) {
      const { data, error } = await supabase
        .from('admission_fee_structures')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      parentRow = data as AdmissionFeeStructure;
    }
    if (!parentRow) {
      throw new Error('fee_structure_update_failed_to_read_back');
    }
    const data = parentRow;

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

  /**
   * Hard delete a fee structure. Cascades to admission_fee_structure_items
   * via the table's ON DELETE CASCADE. RLS gate: requires
   * admission_fees.delete (super_admin by default per Plan post-ship migration
   * 20260507100011). Logs an activity entry before the row goes away —
   * after the delete, fees-by-id lookups would return null.
   */
  static async delete(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    // Read minimal metadata for activity log before delete fires
    const { data: row } = await supabase
      .from('admission_fee_structures')
      .select('id, name, institution_id')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabase
      .from('admission_fee_structures')
      .delete()
      .eq('id', id);
    if (error) throw error;

    if (row) {
      void logActivityForCurrentUser({
        actionType: 'delete',
        resourceType: 'admission_fee_structure',
        resourceId: row.id,
        resourceName: row.name,
        description: AdmissionFeesActivityTemplates.fee_structure.archived(row.name),
        institutionId: row.institution_id,
      });
    }
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
    overrides?: Partial<FeeStructureMatrixDimensions> & {
      name?: string;
      community_category_ids?: string[];
    },
  ): Promise<AdmissionFeeStructureWithItems> {
    const source = await this.getWithItems(sourceId);
    if (!source) throw new Error('fee_structure_not_found');
    const dims: FeeStructureMatrixDimensions = {
      institution_id:        overrides?.institution_id        ?? source.institution_id,
      degree_id:             overrides?.degree_id             ?? source.degree_id,
      department_id:         overrides?.department_id         ?? source.department_id,
      programme_id:          overrides?.programme_id          ?? source.programme_id,
      quota_id:              overrides?.quota_id              ?? source.quota_id,
      accommodation_type_id: overrides?.accommodation_type_id ?? source.accommodation_type_id,
      admission_year_id:     newAcademicYearId,
    };
    return this.create({
      ...dims,
      community_category_ids:
        overrides?.community_category_ids ?? source.community_category_ids,
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
        quota_id, accommodation_type_id, admission_year_id,
        communities:admission_fee_structure_communities(community_category_id),
        items:admission_fee_structure_items(id)
      `)
      .eq('institution_id', institutionId)
      .eq('admission_year_id', admissionYearId)
      .eq('status', 'active');
    if (error) throw error;
    // Each (structure, community) pair becomes one coverage row, since the
    // coverage report's grain is "is THIS 8-tuple covered?" — the matrix view
    // still wants per-community granularity even though we no longer store
    // community on the parent.
    const rows: FeeStructureCoverageReportRow[] = [];
    for (const row of data ?? []) {
      const communities = (row.communities as Array<{ community_category_id: string }>) ?? [];
      const itemCount = (row.items as Array<{ id: string }>).length;
      for (const c of communities) {
        rows.push({
          institution_id: row.institution_id,
          degree_id: row.degree_id,
          department_id: row.department_id,
          programme_id: row.programme_id,
          quota_id: row.quota_id,
          community_category_id: c.community_category_id,
          accommodation_type_id: row.accommodation_type_id,
          admission_year_id: row.admission_year_id,
          has_structure: true,
          item_count: itemCount,
        });
      }
    }
    return rows;
  }
}
