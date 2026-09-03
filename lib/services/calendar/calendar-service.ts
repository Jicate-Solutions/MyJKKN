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
  CalendarFeedSetting,
} from '@/types/calendar';

const ENTRIES = 'calendar_entries';
const CATEGORIES = 'calendar_categories';

/**
 * Hard ceiling on a single listEntries page.
 *
 * The admin screen fetches the WHOLE table in one call and filters in the
 * browser, so the roster, the faceted filter counts and the table all read one
 * array. That is only safe while the table is small: 59 rows today, growing by
 * roughly one academic year's holidays (~40) annually.
 *
 * The default used to be 50 with no pager on the page, so 9 of the 59 live rows
 * could not be reached or edited from the UI at all — and nothing said so,
 * because the component dropped the `totalCount` that would have revealed it.
 * The cap is therefore paired with `totalCount`, which the caller compares
 * against `data.length` to surface truncation instead of silently hiding rows.
 * If that banner ever fires, this page needs server-side filtering, not a
 * bigger number here.
 */
export const CALENDAR_ENTRIES_LIST_CAP = 2000;

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
    const requested = params.limit && params.limit > 0 ? params.limit : CALENDAR_ENTRIES_LIST_CAP;
    const limit = Math.min(requested, CALENDAR_ENTRIES_LIST_CAP);
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

  static async listFeedSettings(): Promise<CalendarFeedSetting[]> {
    const { data, error } = await this.supabase
      .from('calendar_feed_settings')
      .select('*')
      .order('feed_key', { ascending: true });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as CalendarFeedSetting[];
  }

  static async upsertFeedSetting(
    feedKey: string,
    institutionId: string | null,
    isEnabled: boolean,
  ): Promise<void> {
    // calendar_feed_settings uses PARTIAL unique indexes — cannot use .upsert(onConflict).
    // We must check for an existing row and branch on update vs insert.
    let existingQuery = this.supabase
      .from('calendar_feed_settings')
      .select('id')
      .eq('feed_key', feedKey);
    if (institutionId === null) {
      existingQuery = existingQuery.is('institution_id', null);
    } else {
      existingQuery = existingQuery.eq('institution_id', institutionId);
    }
    const { data: existing, error: selectError } = await existingQuery.maybeSingle();
    if (selectError) throw new Error(getErrorMessage(selectError));

    if (existing) {
      const { error: updateError } = await this.supabase
        .from('calendar_feed_settings')
        .update({ is_enabled: isEnabled })
        .eq('id', existing.id);
      if (updateError) throw new Error(getErrorMessage(updateError));
    } else {
      const { error: insertError } = await this.supabase
        .from('calendar_feed_settings')
        .insert({ feed_key: feedKey, institution_id: institutionId, is_enabled: isEnabled });
      if (insertError) throw new Error(getErrorMessage(insertError));
    }
  }

  static async createCategory(input: {
    name: string;
    slug: string;
    color_code?: string;
    applies_to_kinds?: string[];
    sort_order?: number;
  }): Promise<CalendarCategory> {
    const { data, error } = await this.supabase
      .from(CATEGORIES)
      .insert(input)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    return data as CalendarCategory;
  }

  static async updateCategory(
    id: string,
    updates: Partial<{ name: string; slug: string; color_code: string; sort_order: number; is_active: boolean }>,
  ): Promise<CalendarCategory> {
    const { data, error } = await this.supabase
      .from(CATEGORIES)
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    return data as CalendarCategory;
  }

  static async deleteCategory(id: string): Promise<void> {
    const { error } = await this.supabase.from(CATEGORIES).delete().eq('id', id);
    if (error) throw new Error(getErrorMessage(error));
  }

  // ── ICS feed token management ────────────────────────────────────────────

  /** Returns the caller's active ICS feed token, or null if none exists. */
  static async getMyFeedToken(): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('calendar_feed_tokens')
      .select('token')
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    return data?.token ?? null;
  }

  /** Revokes the old token (if any) and issues a fresh one for the caller. */
  static async generateFeedToken(): Promise<string> {
    const { data, error } = await this.supabase.rpc('fn_calendar_generate_feed_token');
    if (error) throw new Error(getErrorMessage(error));
    return data as string;
  }

  /** Revokes the caller's active ICS feed token. */
  static async revokeFeedToken(): Promise<void> {
    const { error } = await this.supabase.rpc('fn_calendar_revoke_feed_token');
    if (error) throw new Error(getErrorMessage(error));
  }
}
