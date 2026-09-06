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
  FeeStructurePackageType,
} from '@/types/admission';

export type FeeItemApplicability = {
  applies_to: 'first_year_only' | 'every_year' | 'specific_year';
  applies_year_of_study: number | null;
};

/**
 * The schedule columns an item write carries (2026-08-21). Split out so the
 * create path and upsertItems build byte-identical rows — the two used to
 * duplicate their column lists, which is how a new column reaches one path and
 * not the other.
 */
function scheduleColumnsFor(it: Partial<AdmissionFeeStructureItem>) {
  const isSplit = it.schedule_mode === 'split';
  return {
    schedule_mode: it.schedule_mode ?? 'single',
    due_anchor: it.due_anchor ?? 'generation_date',
    // A split item's dates live on its lines; carrying an item-level date as
    // well would leave two sources of truth for the same fee.
    due_offset_days: isSplit ? null : it.due_offset_days ?? null,
    due_date: isSplit ? null : it.due_date ?? null,
    // Documented as ignored when split — persist NULL rather than dead config,
    // so nothing can later read it back and fire a rule the author replaced
    // with per-instalment targets.
    promotes_to_status_code: isSplit ? null : it.promotes_to_status_code ?? null,
  };
}

/**
 * Replaces the schedule lines of the given items. Delete-then-insert per item,
 * not a diff: sequence_no is UNIQUE per item and must stay contiguous from 1,
 * so an in-place update would have to sequence its writes to dodge its own
 * unique index. Items in `single` mode simply have their lines removed.
 *
 * The shape check (>= 2 lines, no sequence gaps, percentages totalling 100)
 * lives in a DEFERRED constraint trigger, so it fires at commit on the whole
 * inserted batch rather than rejecting line 1 of a 30/30/40 split for summing
 * to 30.
 */
async function replaceItemSchedules(
  supabase: ReturnType<typeof createClientSupabaseClient>,
  itemIdByCategory: Map<string, string>,
  items: Array<Partial<AdmissionFeeStructureItem> & { billing_category_id: string }>
): Promise<void> {
  const itemIds = items
    .map((it) => itemIdByCategory.get(it.billing_category_id))
    .filter((id): id is string => !!id);
  if (itemIds.length === 0) return;

  const { error: delError } = await supabase
    .from('admission_fee_structure_item_schedules')
    .delete()
    .in('fee_structure_item_id', itemIds);
  if (delError) throw delError;

  const rows = items.flatMap((it) => {
    if (it.schedule_mode !== 'split') return [];
    const itemId = itemIdByCategory.get(it.billing_category_id);
    if (!itemId) return [];
    return (it.schedules ?? []).map((s, idx) => ({
      fee_structure_item_id: itemId,
      // Renumber on write: the UI can leave gaps mid-edit, and the database
      // rejects them outright.
      sequence_no: idx + 1,
      share_percent: s.fixed_amount != null ? null : s.share_percent ?? null,
      fixed_amount: s.fixed_amount ?? null,
      due_offset_days: s.due_date ? null : s.due_offset_days ?? null,
      due_date: s.due_date ?? null,
      promotes_to_status_code: s.promotes_to_status_code ?? null,
      label: s.label ?? null,
    }));
  });

  if (rows.length === 0) return;

  const { error: insError } = await supabase
    .from('admission_fee_structure_item_schedules')
    .insert(rows);
  if (insError) throw insError;
}

/** Whether a fee item applies to a learner currently in `yearOfStudy`. */
export function feeItemAppliesToYear(item: FeeItemApplicability, yearOfStudy: number): boolean {
  if (item.applies_to === 'every_year') return true;
  if (item.applies_to === 'first_year_only') return yearOfStudy === 1;
  return item.applies_year_of_study === yearOfStudy; // 'specific_year'
}

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
    degree_id?: string;
    department_id?: string;
    programme_id?: string;
    admission_year_id?: string;
    admission_year_ids?: string[];
    quota_id?: string;
    community_category_id?: string;
    status?: 'draft' | 'active' | 'archived';
    /**
     * Classification filter. 'unclassified' selects rows where package_type
     * IS NULL — `.eq(col, null)` would send the literal string "null" and
     * match nothing, so that branch uses `.is()` instead.
     */
    package_type?: 'package' | 'non_package' | 'unclassified';
  }): Promise<{
    data: Array<
      AdmissionFeeStructure & {
        institution_name: string | null;
        degree_name: string | null;
        department_name: string | null;
        programme_name: string | null;
        quota_name: string | null;
        accommodation_name: string | null;
        /** Comma-joined community names, for legacy single-cell rendering. */
        community_name: string | null;
        /** All community names attached to this structure (via junction). */
        community_names: string[];
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

    // Community filter is many-to-many via admission_fee_structure_communities.
    // Resolve matching parent IDs first, then constrain the main query with
    // `.in('id', ids)`. Cheap because the junction is narrow (2 UUIDs/row) and
    // it sidesteps the !inner-vs-left-join branching that would otherwise be
    // needed inside the embedded select.
    let communityScopedIds: string[] | null = null;
    if (params.community_category_id) {
      const { data: junctionRows, error: jErr } = await supabase
        .from('admission_fee_structure_communities')
        .select('fee_structure_id')
        .eq('community_category_id', params.community_category_id);
      if (jErr) throw jErr;
      communityScopedIds = (junctionRows ?? []).map(
        (r: { fee_structure_id: string }) => r.fee_structure_id,
      );
      // No matches → short-circuit with an empty page; otherwise PostgREST
      // would receive `.in('id', [])` which it rejects as an empty list.
      if (communityScopedIds.length === 0) {
        return {
          data: [],
          metadata: { total: 0, totalPages: 1, page, limit },
        };
      }
    }

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
        accommodation:accommodation_types(id, name),
        communities:admission_fee_structure_communities(community_category_id, community_category:community_categories(id, name)),
        admission_year:admission_years(id, admission_year_name),
        items:admission_fee_structure_items(id)
      `,
        { count: 'exact' },
      )
      .order(sortColumn, { ascending })
      .range(from, to);

    if (params.institution_id) query = query.eq('institution_id', params.institution_id);
    if (params.degree_id) query = query.eq('degree_id', params.degree_id);
    if (params.department_id) query = query.eq('department_id', params.department_id);
    if (params.programme_id) query = query.eq('programme_id', params.programme_id);
    if (params.admission_year_ids?.length) {
      query = params.admission_year_ids.length === 1
        ? query.eq('admission_year_id', params.admission_year_ids[0])
        : query.in('admission_year_id', params.admission_year_ids);
    } else if (params.admission_year_id) {
      query = query.eq('admission_year_id', params.admission_year_id);
    }
    if (params.quota_id) query = query.eq('quota_id', params.quota_id);
    if (communityScopedIds) query = query.in('id', communityScopedIds);
    if (params.status) query = query.eq('status', params.status);
    if (params.package_type === 'unclassified') {
      query = query.is('package_type', null);
    } else if (params.package_type) {
      query = query.eq('package_type', params.package_type);
    }
    if (params.search && params.search.trim()) query = query.ilike('name', `%${params.search.trim()}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    interface Joined {
      institution: { name: string } | null;
      degree: { degree_name: string } | null;
      department: { department_name: string } | null;
      programme: { program_name: string } | null;
      quota: { name: string } | null;
      accommodation: { name: string } | null;
      communities: Array<{
        community_category_id: string;
        community_category: { id: string; name: string } | null;
      }>;
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
        accommodation_name: joined.accommodation?.name ?? null,
        // Backwards-compat single-name field — joins all linked communities
        // for legacy table cells. Most consumers should switch to
        // `community_names` (plural) when rendering chips.
        community_name: communityNames.join(', ') || null,
        community_names: communityNames,
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
        '*, items:admission_fee_structure_items(*,' +
        ' schedules:admission_fee_structure_item_schedules(*)),' +
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
      // PostgREST does not order an embedded resource for you, and the whole
      // meaning of an instalment is its position — the engine orders by
      // sequence_no and the bill renders "n/N" from it.
      items: (row.items ?? []).map((it: any) => ({
        ...it,
        schedules: [...(it.schedules ?? [])].sort(
          (a: any, b: any) => a.sequence_no - b.sequence_no,
        ),
      })),
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
        accommodation_name: string | null;
        /** Declared hostel tier. Null on day-scholar structures by design. */
        hostel_category_name: string | null;
        mess_category_name: string | null;
        community_name: string | null;
        community_names: string[];
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
        accommodation:accommodation_types(id, name),
        hostel_category:hostel_categories(id, name),
        mess_category:mess_categories(id, name),
        communities:admission_fee_structure_communities(community_category_id, community_category:community_categories(id, name)),
        admission_year:admission_years(id, admission_year_name),
        items:admission_fee_structure_items(*, billing_category:billing_categories(id, category_name, frequency), schedules:admission_fee_structure_item_schedules(*))
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
      accommodation: { name: string } | null;
      hostel_category: { name: string } | null;
      mess_category: { name: string } | null;
      communities: Array<{
        community_category_id: string;
        community_category: { id: string; name: string } | null;
      }>;
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
      accommodation_name: joined.accommodation?.name ?? null,
      hostel_category_name: joined.hostel_category?.name ?? null,
      mess_category_name: joined.mess_category?.name ?? null,
      community_name: communityNames.join(', ') || null,
      community_names: communityNames,
      admission_year_name: joined.admission_year?.admission_year_name ?? null,
      items: joined.items.map((it) => {
        const withJoin = it as typeof it & {
          billing_category: { category_name: string; frequency: string } | null;
          schedules?: Array<{ sequence_no: number }> | null;
        };
        return {
          ...it,
          category_name: withJoin.billing_category?.category_name ?? null,
          category_frequency: withJoin.billing_category?.frequency ?? null,
          // PostgREST does not order an embedded resource, and an instalment's
          // whole meaning is its position — unordered, the detail page would
          // render "3 / 1 / 2" with the wrong amounts beside each share.
          schedules: [...(withJoin.schedules ?? [])].sort(
            (a, b) => a.sequence_no - b.sequence_no,
          ),
        };
      }),
    };
  }

  /**
   * Find the single active structure matching the 6 hard dims + community,
   * with `gender` and `accommodation_type_id` as OPTIONAL refinements (NULL =
   * "Any"). Fetches all active candidates sharing the hard dims + community
   * (the overlap trigger keeps that set tiny), filters to those whose optional
   * dims match (exact OR wildcard-NULL), then ranks: accommodation-specific >
   * gender-specific > most-recently-updated. This MUST stay in lockstep with
   * admission_resolve_fee_items_for_lead's ORDER BY — preview must equal billed.
   */
  static async findByDimensions(
    d: FeeStructureMatrixDimensions,
    community_category_id: string,
    yearOfStudy: number = 1,
  ): Promise<AdmissionFeeStructureWithItems | null> {
    const supabase = createClientSupabaseClient();
    const gender = d.gender?.toUpperCase() || null;
    const accommodation = d.accommodation_type_id || null;

    const { data: rows, error } = await supabase
      .from('admission_fee_structure_communities')
      .select(
        `fee_structure_id,
         structure:admission_fee_structures!inner(id, status, gender,
           accommodation_type_id, institution_id, degree_id, department_id,
           programme_id, quota_id, admission_year_id, updated_at)`,
      )
      .eq('community_category_id', community_category_id)
      .eq('structure.institution_id', d.institution_id)
      .eq('structure.degree_id', d.degree_id)
      .eq('structure.department_id', d.department_id)
      .eq('structure.programme_id', d.programme_id)
      .eq('structure.quota_id', d.quota_id)
      .eq('structure.admission_year_id', d.admission_year_id)
      .eq('structure.status', 'active');
    if (error) throw error;

    interface Candidate {
      id: string;
      gender: string | null;
      accommodation_type_id: string | null;
      updated_at: string | null;
    }

    // The embedded to-one `structure` comes back as an object (PostgREST FK
    // embed); cast defensively in case the client types it as an array.
    const candidates: Candidate[] = (rows ?? [])
      .map((r: any) => (Array.isArray(r.structure) ? r.structure[0] : r.structure))
      .filter((s: Candidate | null | undefined): s is Candidate => !!s)
      .filter(
        (s) =>
          (s.gender === gender || s.gender === null) &&
          (s.accommodation_type_id === accommodation ||
            s.accommodation_type_id === null),
      );

    if (candidates.length === 0) return null;

    // Rank: accommodation-specific first, then gender-specific, then newest.
    // Mirrors the RPC's `ORDER BY accommodation_type_id IS NOT NULL DESC,
    // gender IS NOT NULL DESC, updated_at DESC`.
    candidates.sort((a, b) => {
      const accA = a.accommodation_type_id !== null ? 1 : 0;
      const accB = b.accommodation_type_id !== null ? 1 : 0;
      if (accA !== accB) return accB - accA;
      const genA = a.gender !== null ? 1 : 0;
      const genB = b.gender !== null ? 1 : 0;
      if (genA !== genB) return genB - genA;
      return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
    });

    // Hydrate the full structure (with items + all linked communities), then
    // filter items to those applicable for the requested year of study,
    // mirroring the server-side filter in admission_resolve_fee_items_for_lead.
    const full = await this.getWithItems(candidates[0].id);
    if (!full) return null;

    const applicableItems = full.items.filter((it) =>
      feeItemAppliesToYear(
        { applies_to: it.applies_to, applies_year_of_study: it.applies_year_of_study },
        yearOfStudy,
      ),
    );

    return { ...full, items: applicableItems };
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
        applies_to: it.applies_to ?? 'every_year',
        applies_year_of_study:
          it.applies_to === 'specific_year' ? it.applies_year_of_study ?? null : null,
        ...scheduleColumnsFor(it),
      }));
      const { data: insertedItems, error: itemError } = await supabase
        .from('admission_fee_structure_items')
        .insert(rows)
        .select('id, billing_category_id');
      if (itemError) {
        // Item failure also rolls back parent + junction (parent cascade).
        await supabase.from('admission_fee_structures').delete().eq('id', created.id);
        throw itemError;
      }

      try {
        await replaceItemSchedules(
          supabase,
          new Map((insertedItems ?? []).map((r: any) => [r.billing_category_id, r.id])),
          items as any
        );
      } catch (scheduleError) {
        // Same rollback as an item failure: a structure whose items exist but
        // whose schedules do not would generate bills on the wrong dates, which
        // is worse than no structure at all.
        await supabase.from('admission_fee_structures').delete().eq('id', created.id);
        throw scheduleError;
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
      applies_to: it.applies_to ?? 'every_year',
      applies_year_of_study:
        it.applies_to === 'specific_year' ? it.applies_year_of_study ?? null : null,
      ...scheduleColumnsFor(it),
    }));
    const { data: upserted, error } = await supabase
      .from('admission_fee_structure_items')
      .upsert(rows, { onConflict: 'fee_structure_id,billing_category_id' })
      .select('id, billing_category_id');
    if (error) throw error;

    await replaceItemSchedules(
      supabase,
      new Map((upserted ?? []).map((r: any) => [r.billing_category_id, r.id])),
      items as any
    );
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
      // Classification rides alongside `dims`, not inside it — package_type is
      // not a matching dimension and must stay out of FeeStructureMatrixDimensions.
      package_type?: FeeStructurePackageType | null;
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
      admission_year_id:     newAcademicYearId,
      gender:                overrides?.gender                ?? source.gender ?? undefined,
      accommodation_type_id: overrides?.accommodation_type_id ?? source.accommodation_type_id ?? undefined,
    };
    // Hostel tier rides along ONLY when the clone keeps the source's
    // accommodation. If the admin retargets the clone to a different
    // accommodation, carrying the categories over would trip
    // trg_fee_structure_hostel_categories_guard (categories are rejected on a
    // non-hostel structure) — so drop them and let the form re-collect before
    // the clone can be activated.
    const keepsAccommodation =
      (dims.accommodation_type_id ?? null) === (source.accommodation_type_id ?? null);

    return this.create({
      ...dims,
      hostel_category_id: keepsAccommodation ? source.hostel_category_id : null,
      mess_category_id:   keepsAccommodation ? source.mess_category_id   : null,
      package_type: overrides?.package_type ?? source.package_type ?? null,
      community_category_ids:
        overrides?.community_category_ids ?? source.community_category_ids,
      name: overrides?.name ?? `${source.name} (cloned)`,
      status: 'draft',
      notes: source.notes,
      // Without this the clone silently falls back to the column default of 30,
      // so a structure customised to (say) 45 days would bill its clone on a
      // different schedule with nothing on screen to explain the difference.
      default_due_offset_days: source.default_due_offset_days ?? 30,
      items: source.items.map(it => ({
        billing_category_id: it.billing_category_id,
        amount: it.amount,
        is_optional: it.is_optional,
        sort_order: it.sort_order,
        applies_to: it.applies_to,
        applies_year_of_study: it.applies_year_of_study,
        // Schedules ride along with the clone. Dropping them would leave a
        // structure that looks identical in the list but silently bills on
        // +30 days with no status rules — the worst kind of divergence,
        // because nothing about the clone announces it.
        schedule_mode: it.schedule_mode,
        due_anchor: it.due_anchor,
        due_offset_days: it.due_offset_days,
        due_date: it.due_date,
        promotes_to_status_code: it.promotes_to_status_code,
        // Strip the identity columns: these are NEW lines under NEW items.
        // Carrying `id` through would make the insert collide with the source's
        // own rows, and fee_structure_item_id is assigned by replaceItemSchedules.
        schedules: (it.schedules ?? []).map(({ id, fee_structure_item_id, ...line }) => line),
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
        quota_id, accommodation_type_id, admission_year_id, gender,
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
          gender: (row as any).gender ?? null,
          has_structure: true,
          item_count: itemCount,
        });
      }
    }
    return rows;
  }

  static async getStats(): Promise<{
    total: number;
    active: number;
    draft: number;
    archived: number;
    institutions_covered: number;
    total_fee_amount: number;
    avg_fee_per_structure: number;
    min_fee: number;
    max_fee: number;
    avg_items_per_structure: number;
    total_optional_items: number;
    total_mandatory_items: number;
    structures_without_items: number;
  }> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('get_fee_structure_stats');
    if (error) throw error;
    return data as any;
  }
}
