// lib/services/admission/expo-service.ts
// Service layer for Education Expo / Fair Events module following MyJKKN patterns

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { sanitizeSearch } from '@/lib/config/pagination';
import type {
  ExpoMaster,
  CreateExpoMasterInput,
  UpdateExpoMasterInput,
  ExpoMasterFilters,
  ExpoEvent,
  CreateExpoEventInput,
  UpdateExpoEventInput,
  ExpoEventFilters,
  ExpoEventListResponse,
  ExpoEventTeamMember,
  CreateExpoTeamMemberInput,
  ExpoDailyReport,
  CreateDailyReportInput,
  UpdateDailyReportInput,
  ExpoSummaryStats,
  ExpoExpenseBreakdown,
  ExpoLeadFunnel,
  ExpoComparisonItem,
  ExpoDailyTrend,
} from '@/types/admission';

// ═══════════════════════════════════════════════════════════════════════════
// STATUS TRANSITION MAP
// ═══════════════════════════════════════════════════════════════════════════

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  planned:     ['confirmed', 'cancelled'],
  confirmed:   ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed:   [],
  cancelled:   ['planned'],
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPO SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class ExpoService {
  // Allowlist for sort_by to prevent column injection
  private static readonly EVENT_SORTABLE_COLUMNS = new Set([
    'event_name', 'city', 'start_date', 'end_date', 'event_status',
    'total_expenses', 'total_leads_collected', 'total_team_members',
    'created_at', 'updated_at',
  ]);

  private static readonly MASTER_SORTABLE_COLUMNS = new Set([
    'event_name', 'city', 'organizer_name', 'frequency', 'is_active',
    'created_at', 'updated_at',
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // EXPO MASTERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get paginated list of expo master records (reusable event catalog).
   */
  static async getExpoMasters(filters: ExpoMasterFilters): Promise<{
    data: ExpoMaster[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const supabase = createClientSupabaseClient();
    const {
      search,
      is_active,
      page = 1,
      limit = 20,
    } = filters;

    const from = (page - 1) * limit;

    let query = (supabase as any)
      .from('expo_masters')
      .select('*', { count: 'exact' });

    if (search) {
      const safe = sanitizeSearch(search);
      query = query.or(`event_name.ilike.%${safe}%,organizer_name.ilike.%${safe}%,city.ilike.%${safe}%`);
    }

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active);
    }

    query = query.order('event_name', { ascending: true });
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[admission/expos] Failed to fetch expo masters:', error);
      throw new Error(error.message);
    }

    return {
      data: (data || []) as ExpoMaster[],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Get a single expo master by ID.
   */
  static async getExpoMaster(id: string): Promise<ExpoMaster> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('expo_masters')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[admission/expos] Failed to fetch expo master:', error);
      throw new Error(error.message);
    }

    return data as ExpoMaster;
  }

  /**
   * Create a new expo master record.
   */
  static async createExpoMaster(input: CreateExpoMasterInput): Promise<ExpoMaster> {
    const supabase = createClientSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await (supabase as any)
      .from('expo_masters')
      .insert({
        ...input,
        created_by: user?.id ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('[admission/expos] Failed to create expo master:', error);
      throw new Error(error.message);
    }

    return data as ExpoMaster;
  }

  /**
   * Update an existing expo master record.
   */
  static async updateExpoMaster(id: string, input: UpdateExpoMasterInput): Promise<ExpoMaster> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('expo_masters')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/expos] Failed to update expo master:', error);
      throw new Error(error.message);
    }

    return data as ExpoMaster;
  }

  /**
   * Delete an expo master record.
   */
  static async deleteExpoMaster(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('expo_masters')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admission/expos] Failed to delete expo master:', error);
      throw new Error(error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EXPO EVENTS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get paginated list of expo events with summary joins.
   */
  static async getExpoEvents(filters: ExpoEventFilters): Promise<ExpoEventListResponse> {
    const supabase = createClientSupabaseClient();
    const {
      status,
      city,
      date_from,
      date_to,
      expo_master_id,
      search,
      page = 1,
      limit = 20,
      sort_by = 'start_date',
      sort_order = 'desc',
    } = filters;

    const safeSortBy = ExpoService.EVENT_SORTABLE_COLUMNS.has(sort_by ?? '') ? sort_by! : 'start_date';
    const from = (page - 1) * limit;

    let query = (supabase as any)
      .from('expo_events')
      .select(
        `*,
        expo_master:expo_masters(id, event_name),
        team_leader:profiles!expo_events_team_leader_id_fkey(id, full_name),
        approved_by:profiles!expo_events_approved_by_id_fkey(id, full_name)`,
        { count: 'exact' }
      );

    if (search) {
      const safe = sanitizeSearch(search);
      query = query.or(`event_name.ilike.%${safe}%,city.ilike.%${safe}%,organizer_name.ilike.%${safe}%`);
    }

    if (status) {
      query = query.eq('event_status', status);
    }

    if (city) {
      query = query.ilike('city', `%${sanitizeSearch(city)}%`);
    }

    if (date_from) {
      query = query.gte('start_date', date_from);
    }

    if (date_to) {
      query = query.lte('end_date', date_to);
    }

    if (expo_master_id) {
      query = query.eq('expo_master_id', expo_master_id);
    }

    query = query.order(safeSortBy, { ascending: sort_order === 'asc' });
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[admission/expos] Failed to fetch expo events:', error);
      throw new Error(error.message);
    }

    return {
      data: (data || []) as ExpoEvent[],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Get a single expo event with full detail joins including team members and daily reports.
   */
  static async getExpoEvent(id: string): Promise<ExpoEvent> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('expo_events')
      .select(
        `*,
        expo_master:expo_masters(id, event_name, organizer_name, city, venue_name),
        team_leader:profiles!expo_events_team_leader_id_fkey(id, full_name),
        approved_by:profiles!expo_events_approved_by_id_fkey(id, full_name),
        team_members:expo_event_team_members(*),
        daily_reports:expo_daily_reports(*)`
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('[admission/expos] Failed to fetch expo event:', error);
      throw new Error(error.message);
    }

    return data as ExpoEvent;
  }

  /**
   * Create a new expo event, then bulk-insert any provided team members.
   */
  static async createExpoEvent(input: CreateExpoEventInput): Promise<ExpoEvent> {
    const supabase = createClientSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Extract team_members before inserting the event row
    const { team_members, ...eventFields } = input;

    const { data: eventData, error: eventError } = await (supabase as any)
      .from('expo_events')
      .insert({
        ...eventFields,
        created_by: user?.id ?? null,
      })
      .select()
      .single();

    if (eventError) {
      console.error('[admission/expos] Failed to create expo event:', eventError);
      throw new Error(eventError.message);
    }

    // Insert team members if provided
    if (team_members && team_members.length > 0) {
      const memberRows = team_members.map((m) => ({
        ...m,
        expo_event_id: eventData.id,
      }));

      const { error: memberError } = await (supabase as any)
        .from('expo_event_team_members')
        .insert(memberRows);

      if (memberError) {
        console.error('[admission/expos] Failed to insert team members for event:', memberError);
        // Event already created — surface the error but do not roll back automatically
        throw new Error(memberError.message);
      }
    }

    // Return the full event detail
    return ExpoService.getExpoEvent(eventData.id);
  }

  /**
   * Update an existing expo event's fields (does not manage team members).
   */
  static async updateExpoEvent(id: string, input: UpdateExpoEventInput): Promise<ExpoEvent> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('expo_events')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/expos] Failed to update expo event:', error);
      throw new Error(error.message);
    }

    return data as ExpoEvent;
  }

  /**
   * Transition an event's status, validating the move against the allowed map.
   */
  static async updateEventStatus(id: string, status: string): Promise<ExpoEvent> {
    const supabase = createClientSupabaseClient();

    // Fetch current status before updating
    const { data: current, error: fetchError } = await (supabase as any)
      .from('expo_events')
      .select('event_status')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[admission/expos] Failed to fetch event for status update:', fetchError);
      throw new Error(fetchError.message);
    }

    const currentStatus: string = current.event_status;
    const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(status)) {
      throw new Error(
        `Invalid status transition: cannot move from '${currentStatus}' to '${status}'. ` +
          `Allowed transitions: ${allowed.length > 0 ? allowed.join(', ') : 'none'}.`
      );
    }

    const { data, error } = await (supabase as any)
      .from('expo_events')
      .update({ event_status: status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/expos] Failed to update event status:', error);
      throw new Error(error.message);
    }

    return data as ExpoEvent;
  }

  /**
   * Delete an expo event by ID.
   */
  static async deleteExpoEvent(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('expo_events')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admission/expos] Failed to delete expo event:', error);
      throw new Error(error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEAM MEMBERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * List all team members for a given expo event.
   */
  static async getTeamMembers(eventId: string): Promise<ExpoEventTeamMember[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('expo_event_team_members')
      .select('*')
      .eq('expo_event_id', eventId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[admission/expos] Failed to fetch team members:', error);
      throw new Error(error.message);
    }

    return (data || []) as ExpoEventTeamMember[];
  }

  /**
   * Add a single team member to an expo event.
   */
  static async addTeamMember(
    eventId: string,
    input: CreateExpoTeamMemberInput
  ): Promise<ExpoEventTeamMember> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('expo_event_team_members')
      .insert({ ...input, expo_event_id: eventId })
      .select()
      .single();

    if (error) {
      console.error('[admission/expos] Failed to add team member:', error);
      throw new Error(error.message);
    }

    return data as ExpoEventTeamMember;
  }

  /**
   * Remove a team member by their row ID.
   */
  static async removeTeamMember(memberId: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('expo_event_team_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      console.error('[admission/expos] Failed to remove team member:', error);
      throw new Error(error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DAILY REPORTS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all daily reports for a given expo event, ordered by report date.
   */
  static async getDailyReports(eventId: string): Promise<ExpoDailyReport[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('expo_daily_reports')
      .select('*')
      .eq('expo_event_id', eventId)
      .order('report_date', { ascending: true });

    if (error) {
      console.error('[admission/expos] Failed to fetch daily reports:', error);
      throw new Error(error.message);
    }

    return (data || []) as ExpoDailyReport[];
  }

  /**
   * Get a single daily report by ID.
   */
  static async getDailyReport(id: string): Promise<ExpoDailyReport> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('expo_daily_reports')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[admission/expos] Failed to fetch daily report:', error);
      throw new Error(error.message);
    }

    return data as ExpoDailyReport;
  }

  /**
   * Create a new daily report entry for an expo event.
   */
  static async createDailyReport(input: CreateDailyReportInput): Promise<ExpoDailyReport> {
    const supabase = createClientSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await (supabase as any)
      .from('expo_daily_reports')
      .insert({
        ...input,
        submitted_by: user?.id ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('[admission/expos] Failed to create daily report:', error);
      throw new Error(error.message);
    }

    return data as ExpoDailyReport;
  }

  /**
   * Update an existing daily report.
   */
  static async updateDailyReport(
    id: string,
    input: UpdateDailyReportInput
  ): Promise<ExpoDailyReport> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('expo_daily_reports')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/expos] Failed to update daily report:', error);
      throw new Error(error.message);
    }

    return data as ExpoDailyReport;
  }

  /**
   * Delete a daily report by ID.
   */
  static async deleteDailyReport(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('expo_daily_reports')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admission/expos] Failed to delete daily report:', error);
      throw new Error(error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYTICS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Aggregate high-level summary stats for all expos (global, not institution-scoped).
   *
   * Queries expo_events for status/count data, then expo_daily_reports for
   * expense and visitor/lead totals. Computes avg_cost_per_lead and
   * conversion_rate (leads / visitors) in-memory.
   */
  static async getSummaryStats(): Promise<ExpoSummaryStats> {
    const supabase = createClientSupabaseClient();

    // Fetch all events (global)
    const { data: events, error: eventsError } = await (supabase as any)
      .from('expo_events')
      .select('id, event_status, total_expenses, total_leads_collected');

    if (eventsError) {
      console.error('[admission/expos] Failed to fetch events for summary stats:', eventsError);
      throw new Error(eventsError.message);
    }

    const eventList: {
      id: string;
      event_status: string;
      total_expenses: number;
      total_leads_collected: number;
    }[] = events || [];

    // Fetch all daily reports to get visitor totals
    const eventIds: string[] = eventList.map((e) => e.id);

    let totalVisitors = 0;

    if (eventIds.length > 0) {
      const { data: reports, error: reportsError } = await (supabase as any)
        .from('expo_daily_reports')
        .select('total_visitors')
        .in('expo_event_id', eventIds);

      if (reportsError) {
        console.error('[admission/expos] Failed to fetch reports for summary stats:', reportsError);
        throw new Error(reportsError.message);
      }

      totalVisitors = (reports || []).reduce(
        (sum: number, r: { total_visitors: number }) => sum + (r.total_visitors || 0),
        0
      );
    }

    const total_expos = eventList.length;
    const active_expos = eventList.filter(
      (e) => e.event_status === 'in_progress' || e.event_status === 'confirmed'
    ).length;
    const total_leads = eventList.reduce(
      (sum, e) => sum + (e.total_leads_collected || 0),
      0
    );
    const total_expenses = eventList.reduce(
      (sum, e) => sum + (e.total_expenses || 0),
      0
    );
    const avg_cost_per_lead = total_leads > 0 ? total_expenses / total_leads : 0;
    const conversion_rate = totalVisitors > 0 ? (total_leads / totalVisitors) * 100 : 0;

    return {
      total_expos,
      active_expos,
      total_leads,
      total_expenses,
      avg_cost_per_lead,
      total_visitors: totalVisitors,
      conversion_rate,
    };
  }

  /**
   * Summarise expenses by category across all daily reports for an institution.
   *
   * Sums each expense column and returns a breakdown with percentages.
   */
  static async getExpenseBreakdown(): Promise<ExpoExpenseBreakdown[]> {
    const supabase = createClientSupabaseClient();

    const { data: reports, error } = await (supabase as any)
      .from('expo_daily_reports')
      .select(
        'stall_fee, travel_expense, accommodation_expense, food_expense, printing_materials, miscellaneous_expense'
      );

    if (error) {
      console.error('[admission/expos] Failed to fetch expense breakdown:', error);
      throw new Error(error.message);
    }

    const reportList: {
      stall_fee: number;
      travel_expense: number;
      accommodation_expense: number;
      food_expense: number;
      printing_materials: number;
      miscellaneous_expense: number;
    }[] = reports || [];

    const categories: { key: keyof typeof reportList[0]; label: string }[] = [
      { key: 'stall_fee', label: 'Stall Fee' },
      { key: 'travel_expense', label: 'Travel' },
      { key: 'accommodation_expense', label: 'Accommodation' },
      { key: 'food_expense', label: 'Food' },
      { key: 'printing_materials', label: 'Printing & Materials' },
      { key: 'miscellaneous_expense', label: 'Miscellaneous' },
    ];

    const totals = categories.map(({ key, label }) => ({
      category: label,
      amount: reportList.reduce((sum, r) => sum + (r[key] || 0), 0),
    }));

    const grandTotal = totals.reduce((sum, t) => sum + t.amount, 0);

    return totals.map((t) => ({
      category: t.category,
      amount: t.amount,
      percentage: grandTotal > 0 ? (t.amount / grandTotal) * 100 : 0,
    }));
  }

  /**
   * Aggregate the visitor-to-lead funnel across all daily reports (global).
   */
  static async getLeadFunnel(): Promise<ExpoLeadFunnel> {
    const supabase = createClientSupabaseClient();

    const { data: reports, error } = await (supabase as any)
      .from('expo_daily_reports')
      .select('total_visitors, counselling_done, interested_students, leads_collected');

    if (error) {
      console.error('[admission/expos] Failed to fetch lead funnel data:', error);
      throw new Error(error.message);
    }

    const reportList: {
      total_visitors: number;
      counselling_done: number;
      interested_students: number;
      leads_collected: number;
    }[] = reports || [];

    return {
      total_visitors: reportList.reduce((sum, r) => sum + (r.total_visitors || 0), 0),
      counselling_done: reportList.reduce((sum, r) => sum + (r.counselling_done || 0), 0),
      interested_students: reportList.reduce((sum, r) => sum + (r.interested_students || 0), 0),
      leads_collected: reportList.reduce((sum, r) => sum + (r.leads_collected || 0), 0),
    };
  }

  /**
   * Compare completed or in-progress expos by cost efficiency and conversion.
   *
   * Returns one item per event with computed cost_per_lead and conversion_rate.
   */
  static async getExpoComparison(): Promise<ExpoComparisonItem[]> {
    const supabase = createClientSupabaseClient();

    const { data: events, error: eventsError } = await (supabase as any)
      .from('expo_events')
      .select(
        `id, event_name, city, total_leads_collected, total_expenses,
        daily_reports:expo_daily_reports(total_visitors)`
      )
      .in('event_status', ['completed', 'in_progress'])
      .order('start_date', { ascending: false });

    if (eventsError) {
      console.error('[admission/expos] Failed to fetch expo comparison data:', eventsError);
      throw new Error(eventsError.message);
    }

    const eventList: {
      id: string;
      event_name: string;
      city: string;
      total_leads_collected: number;
      total_expenses: number;
      daily_reports: { total_visitors: number }[];
    }[] = events || [];

    return eventList.map((event) => {
      const total_visitors = (event.daily_reports || []).reduce(
        (sum, r) => sum + (r.total_visitors || 0),
        0
      );
      const total_leads = event.total_leads_collected || 0;
      const total_expenses = event.total_expenses || 0;

      return {
        id: event.id,
        event_name: event.event_name,
        city: event.city,
        total_leads,
        total_expenses,
        total_visitors,
        cost_per_lead: total_leads > 0 ? total_expenses / total_leads : 0,
        conversion_rate: total_visitors > 0 ? (total_leads / total_visitors) * 100 : 0,
      };
    });
  }

  /**
   * Return day-by-day visitor, lead, expense, and counselling data for a single event.
   *
   * Used to render timeline charts on the event detail page.
   */
  static async getDailyTrends(eventId: string): Promise<ExpoDailyTrend[]> {
    const supabase = createClientSupabaseClient();

    const { data: reports, error } = await (supabase as any)
      .from('expo_daily_reports')
      .select('report_date, total_visitors, leads_collected, total_expense, counselling_done')
      .eq('expo_event_id', eventId)
      .order('report_date', { ascending: true });

    if (error) {
      console.error('[admission/expos] Failed to fetch daily trends:', error);
      throw new Error(error.message);
    }

    return ((reports || []) as {
      report_date: string;
      total_visitors: number;
      leads_collected: number;
      total_expense: number;
      counselling_done: number;
    }[]).map((r) => ({
      date: r.report_date,
      visitors: r.total_visitors || 0,
      leads: r.leads_collected || 0,
      expense: r.total_expense || 0,
      counselling: r.counselling_done || 0,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EXPO BRIDGE — ANALYTICS ENHANCEMENTS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get actual CRM lead count for an expo event (from admission_leads, not the manual counter).
   */
  static async getActualLeadCount(eventId: string): Promise<number> {
    const supabase = createClientSupabaseClient();
    const { count, error } = await (supabase as any)
      .from('admission_leads')
      .select('id', { count: 'exact', head: true })
      .eq('expo_event_id', eventId);

    if (error) {
      console.error('[admission/expos] Failed to get actual lead count:', error);
      return 0;
    }
    return count ?? 0;
  }

  /**
   * Get top lead capturers for an event — ranked by number of leads captured.
   * Returns team member name + capture count.
   */
  static async getTopCapturers(eventId: string): Promise<{ userId: string; name: string; count: number }[]> {
    const supabase = createClientSupabaseClient();

    // Get all leads captured at this event with captured_by
    const { data: leads, error } = await (supabase as any)
      .from('admission_leads')
      .select('captured_by')
      .eq('expo_event_id', eventId)
      .not('captured_by', 'is', null);

    if (error || !leads) {
      console.error('[admission/expos] Failed to fetch capturers:', error);
      return [];
    }

    // Count per captured_by
    const countMap = new Map<string, number>();
    for (const lead of leads) {
      countMap.set(lead.captured_by, (countMap.get(lead.captured_by) || 0) + 1);
    }

    if (countMap.size === 0) return [];

    // Fetch profile names for the captured_by user IDs
    const userIds = Array.from(countMap.keys());
    const { data: profiles, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);

    if (profileError) {
      console.error('[admission/expos] Failed to fetch capturer profiles:', profileError);
    }

    const profileMap = new Map<string, string>();
    for (const p of (profiles || [])) {
      profileMap.set(p.id, p.full_name || 'Unknown');
    }

    // Build sorted result
    return Array.from(countMap.entries())
      .map(([userId, count]) => ({
        userId,
        name: profileMap.get(userId) || 'Unknown',
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }
}
