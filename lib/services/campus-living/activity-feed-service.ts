import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  CampusLivingActivityEvent,
  ActivityFeedFilters,
  ActivityFeedPaginatedResponse,
  CampusLivingEventType,
} from '@/types/campus-living/activity-feed';

/**
 * ActivityFeedService — unifies the 5 campus-living event tables into a
 * single chronological stream.
 *
 * Source tables (probed on prod 2026-05-20):
 *   - hostel_attendance           → event_type='attendance'
 *   - hostel_leave_requests       → event_type='leave'
 *   - hostel_gate_passes          → event_type='gate_pass'
 *   - hostel_maintenance_requests → event_type='maintenance'
 *   - hostel_incidents            → event_type='incident'
 *
 * Filtering happens at each source query (institution_id, block_id, date
 * range). The union is sorted + paginated in memory because Supabase JS
 * has no cross-table UNION primitive and a Postgres VIEW would require a
 * migration — out of scope for this PR.
 */
export class ActivityFeedService {
  /**
   * Fetch a paginated, chronological feed of campus-living events.
   *
   * Performance note: pulls up to `pageSize * 10` rows from each source
   * table (capped at 500) so the in-memory sort + paginate has a stable
   * window. For institutions with >500 events/day per source table, a
   * server-side UNION view should replace this — file a follow-up before
   * that scale.
   */
  static async getActivityFeed(
    filters?: ActivityFeedFilters,
    page = 1,
    pageSize = 50,
  ): Promise<ActivityFeedPaginatedResponse> {
    try {
      const supabase = createClientSupabaseClient();
      const want = (et: CampusLivingEventType) =>
        !filters?.event_type ||
        filters.event_type === 'all' ||
        filters.event_type === et;

      // Window we pull from each table before in-memory merge. Keeps the
      // sort stable when only one event_type is filtered to.
      const perTableLimit = Math.min(500, pageSize * 10);

      const promises: Array<Promise<CampusLivingActivityEvent[]>> = [];

      if (want('attendance')) {
        promises.push(this.fetchAttendance(supabase, filters, perTableLimit));
      }
      if (want('leave')) {
        promises.push(this.fetchLeave(supabase, filters, perTableLimit));
      }
      if (want('gate_pass')) {
        promises.push(this.fetchGatePasses(supabase, filters, perTableLimit));
      }
      if (want('maintenance')) {
        promises.push(this.fetchMaintenance(supabase, filters, perTableLimit));
      }
      if (want('incident')) {
        promises.push(this.fetchIncidents(supabase, filters, perTableLimit));
      }

      const buckets = await Promise.all(promises);
      const merged = buckets.flat();

      // Sort newest-first by occurred_at
      merged.sort((a, b) =>
        b.occurred_at.localeCompare(a.occurred_at),
      );

      const from = (page - 1) * pageSize;
      const slice = merged.slice(from, from + pageSize);

      return {
        data: slice,
        count: merged.length,
        page,
        page_size: pageSize,
      };
    } catch (error) {
      logger.error(
        'campus-living/activity-feed',
        'Failed to fetch activity feed',
        error,
      );
      throw error;
    }
  }

  // ── Source-specific fetchers ────────────────────────────────────────
  private static applyCommonFilters<T>(
    query: T,
    filters: ActivityFeedFilters | undefined,
    timestampCol: string,
    hasBlockId: boolean,
  ): T {
    let q = query as unknown as {
      eq: (col: string, val: string) => typeof q;
      gte: (col: string, val: string) => typeof q;
      lte: (col: string, val: string) => typeof q;
    };
    if (filters?.institution_id) {
      q = q.eq('institution_id', filters.institution_id);
    }
    if (filters?.block_id && hasBlockId) {
      q = q.eq('block_id', filters.block_id);
    }
    if (filters?.date_from) {
      q = q.gte(timestampCol, filters.date_from);
    }
    if (filters?.date_to) {
      q = q.lte(timestampCol, filters.date_to);
    }
    return q as unknown as T;
  }

  private static async fetchAttendance(
    supabase: ReturnType<typeof createClientSupabaseClient>,
    filters: ActivityFeedFilters | undefined,
    limit: number,
  ): Promise<CampusLivingActivityEvent[]> {
    let query = supabase
      .from('hostel_attendance')
      .select(
        'id, institution_id, block_id, learner_id, check_in_time, check_out_time, created_at',
      );
    query = this.applyCommonFilters(query, filters, 'created_at', true) as typeof query;
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r: any) => {
      const occurred = r.check_in_time ?? r.created_at;
      const checkedOut = !!r.check_out_time;
      return {
        id: `attendance:${r.id}`,
        source_id: r.id,
        event_type: 'attendance' as const,
        title: checkedOut ? 'Resident checked out' : 'Resident checked in',
        description: checkedOut
          ? `Check-out recorded at ${formatTime(r.check_out_time)}`
          : `Check-in recorded at ${formatTime(r.check_in_time ?? r.created_at)}`,
        status: null,
        institution_id: r.institution_id,
        block_id: r.block_id ?? null,
        actor_id: r.learner_id ?? null,
        occurred_at: occurred,
      };
    });
  }

  private static async fetchLeave(
    supabase: ReturnType<typeof createClientSupabaseClient>,
    filters: ActivityFeedFilters | undefined,
    limit: number,
  ): Promise<CampusLivingActivityEvent[]> {
    let query = supabase
      .from('hostel_leave_requests')
      .select(
        'id, institution_id, block_id, learner_id, status, created_at, updated_at',
      );
    query = this.applyCommonFilters(query, filters, 'created_at', true) as typeof query;
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: `leave:${r.id}`,
      source_id: r.id,
      event_type: 'leave' as const,
      title: 'Leave request',
      description: `Leave request currently ${r.status ?? 'pending'}`,
      status: r.status ?? null,
      institution_id: r.institution_id,
      block_id: r.block_id ?? null,
      actor_id: r.learner_id ?? null,
      occurred_at: r.created_at,
    }));
  }

  private static async fetchGatePasses(
    supabase: ReturnType<typeof createClientSupabaseClient>,
    filters: ActivityFeedFilters | undefined,
    limit: number,
  ): Promise<CampusLivingActivityEvent[]> {
    let query = supabase
      .from('hostel_gate_passes')
      .select(
        'id, institution_id, learner_id, pass_type, pass_number, status, created_at',
      );
    // gate_passes has no block_id column — pass hasBlockId=false
    query = this.applyCommonFilters(query, filters, 'created_at', false) as typeof query;
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: `gate_pass:${r.id}`,
      source_id: r.id,
      event_type: 'gate_pass' as const,
      title: `Gate pass ${r.pass_number ?? ''}`.trim(),
      description: `${humanise(r.pass_type)} gate pass currently ${r.status ?? 'pending'}`,
      status: r.status ?? null,
      institution_id: r.institution_id,
      block_id: null,
      actor_id: r.learner_id ?? null,
      occurred_at: r.created_at,
    }));
  }

  private static async fetchMaintenance(
    supabase: ReturnType<typeof createClientSupabaseClient>,
    filters: ActivityFeedFilters | undefined,
    limit: number,
  ): Promise<CampusLivingActivityEvent[]> {
    let query = supabase
      .from('hostel_maintenance_requests')
      .select(
        'id, institution_id, block_id, learner_id, request_number, title, description, status, created_at',
      );
    query = this.applyCommonFilters(query, filters, 'created_at', true) as typeof query;
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: `maintenance:${r.id}`,
      source_id: r.id,
      event_type: 'maintenance' as const,
      title: r.title
        ? `Maintenance: ${r.title}`
        : `Maintenance request ${r.request_number ?? ''}`.trim(),
      description: r.description ?? `Request currently ${r.status ?? 'pending'}`,
      status: r.status ?? null,
      institution_id: r.institution_id,
      block_id: r.block_id ?? null,
      actor_id: r.learner_id ?? null,
      occurred_at: r.created_at,
    }));
  }

  private static async fetchIncidents(
    supabase: ReturnType<typeof createClientSupabaseClient>,
    filters: ActivityFeedFilters | undefined,
    limit: number,
  ): Promise<CampusLivingActivityEvent[]> {
    let query = supabase
      .from('hostel_incidents')
      .select(
        'id, institution_id, block_id, reported_by, incident_number, incident_type, severity, title, description, status, incident_date, created_at',
      );
    query = this.applyCommonFilters(query, filters, 'incident_date', true) as typeof query;
    const { data, error } = await query
      .order('incident_date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: `incident:${r.id}`,
      source_id: r.id,
      event_type: 'incident' as const,
      title: r.title
        ? `Incident: ${r.title}`
        : `Incident ${r.incident_number ?? ''}`.trim(),
      description: r.description
        ? r.description
        : `${humanise(r.incident_type)} incident — severity ${r.severity ?? 'unknown'}`,
      status: r.status ?? null,
      institution_id: r.institution_id,
      block_id: r.block_id ?? null,
      actor_id: r.reported_by ?? null,
      occurred_at: r.incident_date ?? r.created_at,
    }));
  }
}

// ── helpers ──────────────────────────────────────────────────────────
function formatTime(iso: string | null | undefined): string {
  if (!iso) return 'unknown time';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function humanise(snake: string | null | undefined): string {
  if (!snake) return 'Event';
  return snake
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
