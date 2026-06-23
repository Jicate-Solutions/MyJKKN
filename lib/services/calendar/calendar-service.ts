// lib/services/calendar/calendar-service.ts
// Global Calendar module — reads via the fn_calendar_items resolver RPC and
// CRUDs the global-owned calendar_entries table. calendar_entries uses
// scope_institution_ids (uuid[]), so the admin list does NOT use
// executeListQuery (which requires a scalar institution_id) — it runs a
// direct paginated query instead.

import { BaseService } from '../base-service';
import { getErrorMessage } from '@/lib/utils';
import type {
  CalendarItem,
  CalendarItemsQuery,
  CalendarEntry,
  CreateCalendarEntryInput,
  UpdateCalendarEntryInput,
  CalendarCategory,
} from '@/types/calendar';

const ENTRIES = 'calendar_entries';
const CATEGORIES = 'calendar_categories';

export class CalendarService extends BaseService {
  /** Unified calendar feed for the grid (holiday/event sources, scoped server-side). */
  static async getCalendarItems(query: CalendarItemsQuery): Promise<CalendarItem[]> {
    const { data, error } = await this.supabase.rpc('fn_calendar_items', {
      p_institution_ids: query.institutionIds ?? null,
      p_start: query.start,
      p_end: query.end,
      p_feeds: query.feeds ?? null,
      p_kinds: query.kinds ?? null,
    });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as CalendarItem[];
  }

  /** Paginated list of global-owned entries for the admin table. */
  static async listEntries(params: {
    page?: number;
    limit?: number;
    search?: string;
    kind?: string;
  } = {}): Promise<{ data: CalendarEntry[]; totalCount: number }> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from(ENTRIES)
      .select('*', { count: 'exact' })
      .order('start_at', { ascending: false })
      .range(from, to);

    if (params.kind) query = query.eq('kind', params.kind);
    if (params.search) {
      const s = this.sanitize(params.search);
      query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(getErrorMessage(error));
    return { data: (data ?? []) as CalendarEntry[], totalCount: count ?? 0 };
  }

  static async createEntry(input: CreateCalendarEntryInput): Promise<CalendarEntry> {
    // normalize empty arrays/strings to null for the "common" sentinel + nullable FKs
    const payload = {
      ...input,
      scope_institution_ids:
        input.scope_institution_ids && input.scope_institution_ids.length > 0
          ? input.scope_institution_ids
          : null,
      category_id: input.category_id || null,
    };
    const { data, error } = await this.supabase
      .from(ENTRIES)
      .insert(payload)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    return data as CalendarEntry;
  }

  static async updateEntry(id: string, updates: UpdateCalendarEntryInput): Promise<CalendarEntry> {
    const { id: _omit, ...safe } = updates as UpdateCalendarEntryInput & { id?: string };
    const payload: Record<string, unknown> = { ...safe };
    if ('scope_institution_ids' in safe) {
      payload.scope_institution_ids =
        safe.scope_institution_ids && safe.scope_institution_ids.length > 0
          ? safe.scope_institution_ids
          : null;
    }
    if ('category_id' in safe) payload.category_id = safe.category_id || null;

    const { data, error } = await this.supabase
      .from(ENTRIES)
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    return data as CalendarEntry;
  }

  static async deleteEntry(id: string): Promise<void> {
    const { error } = await this.supabase.from(ENTRIES).delete().eq('id', id);
    if (error) throw new Error(getErrorMessage(error));
  }

  static async getCategories(): Promise<CalendarCategory[]> {
    const { data, error } = await this.supabase
      .from(CATEGORIES)
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as CalendarCategory[];
  }
}
