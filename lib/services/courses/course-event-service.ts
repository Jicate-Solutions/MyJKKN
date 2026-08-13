import { BaseService } from '@/lib/services/base-service';
import type {
  CourseEvent, CourseEventFilters, CreateCourseEventDto, UpdateCourseEventDto,
} from '@/types/courses';

const SELECT = `
  *,
  institution:institutions!course_events_institution_id_fkey(id, name),
  created_by_profile:profiles!course_events_created_by_fkey(id, full_name)
`;

/** Nullable columns where an empty string from a form must become NULL: four
 *  TEXT columns where '' is legally storable but not the intended value, plus
 *  six columns (date / timestamptz / int / uuid) where Postgres rejects ''
 *  outright with 22P02. Single source of truth for both create() and
 *  update() — do not duplicate this list. */
const NULLABLE_FIELDS = new Set([
  'code', 'description', 'venue_text', 'cover_image_url',
  'start_date', 'end_date', 'application_opens_at', 'application_closes_at',
  'total_seats', 'previous_course_event_id',
]);

/**
 * Converts '' to null for the nullable columns above — but ONLY for keys
 * already present on the input object; it never adds a key. That is what
 * makes it safe for update(): UpdateCourseEventDto is Partial<...>, so
 * update() must receive exactly the keys the caller chose to send. Seeding
 * absent keys with null here would silently wipe every field the user did
 * not touch, turning a 22P02 into worse — a silent data-loss bug.
 */
function normalizeNullableFields<T extends Record<string, any>>(dto: T): T {
  const out: any = { ...dto };
  for (const key of Object.keys(out)) {
    if (NULLABLE_FIELDS.has(key) && out[key] === '') {
      out[key] = null;
    }
  }
  return out;
}

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

  private static applyCommonFilters(q: any, filters: CourseEventFilters) {
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.mode) q = q.eq('mode', filters.mode);
    if (filters.year) q = q.eq('year', filters.year);
    if (filters.search) {
      const s = filters.search.replace(/[%_]/g, '\\$&');
      q = q.or(`title.ilike.%${s}%,code.ilike.%${s}%,slug.ilike.%${s}%`);
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
   * null — see NULLABLE_FIELDS above for which columns and why.
   */
  static async create(dto: CreateCourseEventDto) {
    const payload = normalizeNullableFields({
      ...dto,
      status: dto.status ?? 'draft',
    });
    const { data, error } = await this.supabase
      .from('course_events').insert(payload as any).select(SELECT).single();
    if (error) throw error;
    return data as unknown as CourseEvent;
  }

  /**
   * dto is Partial<CreateCourseEventDto> — only the keys the caller sent are
   * present. normalizeNullableFields preserves that: it rewrites '' -> null
   * on present keys and adds none, so e.g. update(id, { end_date: '' }) sends
   * exactly `{ end_date: null }` and touches no other column.
   */
  static async update(id: string, dto: UpdateCourseEventDto) {
    const payload = normalizeNullableFields(dto);
    const { data, error } = await this.supabase
      .from('course_events').update(payload as any).eq('id', id).select(SELECT).single();
    if (error) throw error;
    return data as unknown as CourseEvent;
  }

  /** Blocked by RLS unless the caller holds courses.delete, and by ON DELETE RESTRICT
   *  if any enrollment exists. Surface the error; do not swallow it. */
  static async remove(id: string) {
    const { error } = await this.supabase.from('course_events').delete().eq('id', id);
    if (error) throw error;
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
