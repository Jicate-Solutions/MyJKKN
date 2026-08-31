import { BaseService } from '@/lib/services/base-service';
import { sanitizeSearch } from '@/lib/config/pagination';
import type {
  CourseEvent, CourseEventFilters, CreateCourseEventDto, UpdateCourseEventDto,
  CourseDeleteBlockers, CourseDeleteResult,
} from '@/types/courses';

const SELECT = `
  *,
  institution:institutions!course_events_institution_id_fkey(id, name),
  created_by_profile:profiles!course_events_created_by_fkey(id, full_name)
`;

/** Nullable columns where an empty string from a form must become NULL: four
 *  TEXT columns where '' is legally storable but not the intended value, plus
 *  six columns (date / timestamptz / int / uuid) where Postgres rejects ''
 *  outright with 22P02. Single source of truth for CourseEventService.nullifyBlanks
 *  and for create()'s absent-key defaulting below — do not duplicate this list. */
const NULLABLE_FIELDS = new Set([
  'code', 'description', 'venue_text', 'cover_image_url',
  'start_date', 'end_date', 'application_opens_at', 'application_closes_at',
  'total_seats', 'previous_course_event_id',
]);

export class CourseEventService extends BaseService {
  /**
   * Multi-institution users pass `institution_ids`; single-institution users pass
   * `institution_id`. NEVER branch on isSuperAdmin to decide which — that silently
   * strips access from secondary roles carrying scope='all'. RLS gates the rows either
   * way; this only decides the query filter.
   *
   * BaseService.executeListQuery requires a single institution_id, so the multi-
   * institution path uses its own query rather than fighting that contract.
   */
  static async list(filters: CourseEventFilters) {
    const ids = filters.institution_ids;

    if (ids && ids.length > 0) {
      const page = filters.page ?? 1;
      const limit = filters.limit ?? 10;
      let q = this.supabase
        .from('course_events')
        .select(SELECT, { count: 'exact' })
        .in('institution_id', ids);

      q = this.applyCommonFilters(q, filters);
      q = q
        .order(filters.sortBy ?? 'created_at', { ascending: filters.sortDirection === 'asc' })
        .range((page - 1) * limit, page * limit - 1);

      const { data, count, error } = await q;
      if (error) throw error;

      return {
        data: (data ?? []) as unknown as CourseEvent[],
        metadata: {
          total: count ?? 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    }

    return this.executeListQuery<CourseEvent>(
      'course_events',
      filters,
      SELECT,
      (q) => this.applyCommonFilters(q, filters),
    );
  }

  /**
   * CORRECTED 2026-08-13 (flagged by automated security review) — the first draft
   * escaped only [%_], the LIKE wildcards. PostgREST's `or=(...)` grammar has its
   * own metacharacters — `,` separates conditions, `(`/`)` group, `.` separates
   * column.operator.value — so a search containing a comma broke out of the ilike
   * and injected a sibling condition into the or-group.
   *
   * Use the repo's own sanitizeSearch (lib/config/pagination.ts), which strips
   * % \ ' " ( ) , . * — do not invent escaping here.
   *
   * Called explicitly rather than relied on from BaseService: executeListQuery
   * auto-sanitizes at base-service.ts:143, but the multi-institution path in
   * list() bypasses that method entirely, so it would otherwise have no
   * sanitization at all. Calling it here covers both paths from one place; it's
   * idempotent (strips rather than escapes), so double-sanitizing the
   * single-institution path is harmless.
   */
  private static applyCommonFilters(q: any, filters: CourseEventFilters) {
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.mode) q = q.eq('mode', filters.mode);
    if (filters.year) q = q.eq('year', filters.year);
    if (filters.search) {
      const s = sanitizeSearch(filters.search);
      // sanitizeSearch can return '' (e.g. a search of only punctuation). An empty
      // ilike pattern matches everything, which would silently become a no-op filter.
      if (s) q = q.or(`title.ilike.%${s}%,code.ilike.%${s}%,slug.ilike.%${s}%`);
    }
    return q;
  }

  static async getById(id: string) {
    const { data, error } = await this.supabase
      .from('course_events').select(SELECT).eq('id', id).single();
    if (error) throw error;
    return data as unknown as CourseEvent;
  }

  /**
   * Nullable fields arrive from react-hook-form as '' and must be normalised to
   * null (NULLABLE_FIELDS above). This is an INSERT, so absent nullable keys are
   * also explicitly defaulted to null here, not left undefined — nullifyBlanks
   * itself never adds a key (see its docstring), so that defaulting has to
   * happen in create() specifically, before nullifyBlanks runs.
   */
  static async create(dto: CreateCourseEventDto) {
    // created_by is nullable with no default/trigger — un-backfillable once real
    // courses exist, so set it at create time rather than leaving it permanently
    // NULL. this.supabase is the request-scoped client (dual-client trick,
    // BaseService), so auth.getUser() resolves the real caller; same pattern as
    // billing-invoice-service.ts and timetable-service.ts.
    const { data: { user } } = await this.supabase.auth.getUser();
    const payload: any = { ...dto, status: dto.status ?? 'draft', created_by: user?.id ?? null };
    for (const field of NULLABLE_FIELDS) {
      if (!(field in payload)) payload[field] = null;
    }
    const { data, error } = await this.supabase
      .from('course_events').insert(this.nullifyBlanks(payload) as any).select(SELECT).single();
    if (error) throw error;
    return data as unknown as CourseEvent;
  }

  /**
   * CORRECTED 2026-08-13 — the first draft passed `dto` straight through, which
   * was a live 22P02 waiting for the edit form (see nullifyBlanks below for which
   * columns and why). dto is Partial<CreateCourseEventDto>, so update() only ever
   * receives the keys the caller sent; nullifyBlanks preserves that — it rewrites
   * '' -> null on present keys and adds none, so e.g. update(id, { end_date: '' })
   * sends exactly `{ end_date: null }` and touches no other column.
   */
  static async update(id: string, dto: UpdateCourseEventDto) {
    const { data, error } = await this.supabase
      .from('course_events')
      .update(this.nullifyBlanks(dto) as any)
      .eq('id', id).select(SELECT).single();
    if (error) throw error;
    return data as unknown as CourseEvent;
  }

  /**
   * Shared by create() and update() — do not fork a second field list; both read
   * NULLABLE_FIELDS above. Converts '' AND undefined to null, but ONLY for keys
   * already present on the input object; it never adds a key. That is what makes
   * it safe for update(): UpdateCourseEventDto is Partial<...>, so seeding absent
   * keys with null here would silently wipe every field the user did not touch —
   * silent data loss, worse than the 22P02 this fixes.
   *
   * The undefined case (CORRECTED 2026-08-13, final branch review): a cleared
   * number input (total_seats) emits undefined out of CourseForm's zod
   * preprocess by design — z.coerce.number() would otherwise coerce '' to 0 and
   * fail .positive(), breaking "leave blank for unlimited" (see course-form.tsx).
   * That undefined used to survive all the way to PostgREST's JSON.stringify,
   * which drops undefined-valued keys entirely — the column was silently left
   * unchanged instead of cleared. Object.keys(out) already includes keys
   * explicitly set to undefined (it only excludes genuinely absent ones), so
   * checking `out[key] === undefined` inside the existing loop preserves the
   * absent-vs-present distinction without widening what nullifyBlanks touches.
   *
   * Convention this establishes for UpdateCourseEventDto: an ABSENT key leaves
   * the column unchanged; a PRESENT key valued '' or undefined clears it to NULL.
   */
  private static nullifyBlanks<T extends Record<string, any>>(dto: T): T {
    const out: any = { ...dto };
    for (const key of Object.keys(out)) {
      if (NULLABLE_FIELDS.has(key) && (out[key] === '' || out[key] === undefined)) {
        out[key] = null;
      }
    }
    return out;
  }

  /**
   * What a delete would destroy — read this before offering the confirm.
   *
   * Goes through fn_course_delete_blockers rather than counting the child tables
   * here: both are RLS-gated, so a client-side count returns 0 for any caller who
   * cannot see the bills and would report "nothing will be lost" on the exact rows
   * the preview exists to protect. The RPC self-authorizes on super admin, so a
   * caller without it gets 42501 rather than a count.
   *
   * `.rpc` is typed against the generated Database map, which doesn't carry this
   * function yet; the narrow structural cast mirrors
   * lib/services/events/core/event-base-service.ts.
   */
  static async getDeleteBlockers(id: string): Promise<CourseDeleteBlockers> {
    const client = this.supabase as unknown as {
      rpc: (
        fn: string,
        args?: Record<string, unknown>
      ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
    };

    const { data, error } = await client.rpc('fn_course_delete_blockers', {
      p_course_event_id: id,
    });
    if (error) throw new Error(error.message || 'Could not check what this delete would remove');
    return data as CourseDeleteBlockers;
  }

  /**
   * Delete a course and its ENTIRE subtree, super admin only.
   *
   * Not a plain `.from('course_events').delete()` — that fails on the six
   * ON DELETE RESTRICT constraints in the money half of the graph (enrollments,
   * bills, payments, and enrollments.package_id). Those RESTRICTs are kept
   * deliberately as the backstop against accidental deletes; the RPC clears the
   * children in dependency order so RESTRICT is satisfied rather than bypassed.
   * See supabase/migrations/20260820020000_course_delete_cascade_super_admin.sql.
   *
   * Runs as one transaction — a failure part-way leaves nothing half-deleted.
   */
  static async remove(id: string): Promise<CourseDeleteResult> {
    const client = this.supabase as unknown as {
      rpc: (
        fn: string,
        args?: Record<string, unknown>
      ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
    };

    const { data, error } = await client.rpc('fn_course_delete_cascade', {
      p_course_event_id: id,
    });
    if (error) throw new Error(error.message || 'Failed to delete course');
    return data as CourseDeleteResult;
  }

  /** UNIQUE (institution_id, slug). Check before submit so the user gets a field
   *  error instead of a raw 23505. */
  static async slugAvailable(institutionId: string, slug: string, excludeId?: string) {
    let q = this.supabase
      .from('course_events').select('id')
      .eq('institution_id', institutionId).eq('slug', slug);
    if (excludeId) q = q.neq('id', excludeId);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return !data;
  }
}
