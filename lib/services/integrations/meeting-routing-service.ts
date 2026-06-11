// lib/services/integrations/meeting-routing-service.ts
//
// MyJKKN-side round-robin routing for the public booking form (/book/[slug]).
//
// Cal.com is a HEADLESS ENGINE here — round-robin is NOT Cal.com's paid /ee
// feature; it is implemented in MyJKKN against the REAL counselor load table
// (admission_counselors.current_leads, trigger-maintained from admission_leads).
//
// Pick pipeline (least_loaded strategy):
//   1. Active counselors of the config's institution, not emergency-off today,
//      ordered by current_leads ASC.
//   2. Filtered to counselors who are Path-W provisioned AND have a bookable
//      per-counselor EventType (native meeting_types.host_profile_id
//      = counselor.user_id, internal_kind = 'admission_call', is_active).
//   3. First survivor wins. Pool size + load are snapshotted to
//      meeting_routing_log at booking time for Director accountability.
//
// SECURITY: every method expects a SERVICE-ROLE Supabase client (the callers
// are public, unauthenticated API routes — RLS would return nothing). Routes
// must validate inputs BEFORE calling in, and must re-validate the event type
// against the pool at /book time (validateEventTypeInPool) so a malicious
// client cannot substitute an arbitrary meetingTypeId.
//
// Pattern: mirrors lib/services/integrations/jicate-booking-mirror-service.ts

import type { SupabaseClient } from '@supabase/supabase-js';

const LOG_PREFIX = '[meeting-routing]';

// ============================================================================
// TYPES
// ============================================================================

/** One question in meeting_routing_config.form_schema. */
export interface RoutingQuestion {
  q: string;
  type: 'text' | 'select';
  options?: string[];
}

export interface RoutingConfig {
  id: string;
  institution_id: string;
  purpose: string;
  display_name: string;
  slug: string;
  form_schema: RoutingQuestion[];
  pool_filter: Record<string, unknown>;
  round_robin_strategy: 'least_loaded' | 'random';
  meeting_duration_min: number;
  is_active: boolean;
}

export interface PickedCounselor {
  /** admission_counselors.id */
  counselorId: string;
  /** profiles.id of the counselor (Cal.com host identity) */
  userId: string;
  name: string;
  currentLeads: number;
  /** Native meeting_types.id (uuid) the booking is made against. */
  meetingTypeId: string;
  /** How many counselors were eligible at pick time (audit). */
  poolSize: number;
}

export interface RoutedBookingLogInput {
  config: RoutingConfig;
  pick: PickedCounselor;
  calBookingUid: string;
  startTime: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string | null;
  answers: Record<string, string>;
}

// ============================================================================
// SERVICE
// ============================================================================

export class MeetingRoutingService {
  /**
   * Load an active routing config by its public slug. Returns null when the
   * slug is unknown or the config is disabled (callers 404).
   */
  static async getActiveConfigBySlug(
    supabase: SupabaseClient,
    slug: string,
  ): Promise<RoutingConfig | null> {
    const { data, error } = await supabase
      .from('meeting_routing_config')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error(`${LOG_PREFIX} config load failed for slug=${slug}:`, error.message);
      return null;
    }
    if (!data) return null;

    return {
      ...data,
      form_schema: Array.isArray(data.form_schema) ? data.form_schema : [],
    } as RoutingConfig;
  }

  /**
   * Eligible pool for a config: active, institution-scoped, not emergency-off,
   * Path-W provisioned with a bookable admission_call event type. Ordered by
   * current_leads ASC (the least_loaded strategy's pick order).
   */
  private static async eligiblePool(
    supabase: SupabaseClient,
    config: RoutingConfig,
  ): Promise<Array<{
    counselorId: string;
    userId: string;
    name: string;
    currentLeads: number;
    meetingTypeId: string;
  }>> {
    const { data: counselors, error: cErr } = await supabase
      .from('admission_counselors')
      .select('id, user_id, name, current_leads')
      .eq('institution_id', config.institution_id)
      .eq('is_active', true)
      .eq('emergency_off_today', false)
      .order('current_leads', { ascending: true });

    if (cErr) {
      console.error(`${LOG_PREFIX} counselor query failed:`, cErr.message);
      return [];
    }
    if (!counselors?.length) return [];

    const userIds = counselors.map((c) => c.user_id).filter(Boolean);
    if (!userIds.length) return [];

    // Phase N2: bookable types now come from the NATIVE engine
    // (meeting_types, migration 20260611190000) instead of the Cal.com
    // mapping table. Counselors are provisioned with slug 'admission-counseling'.
    const { data: mappings, error: mErr } = await supabase
      .from('meeting_types')
      .select('id, host_profile_id')
      .in('host_profile_id', userIds)
      .eq('slug', 'admission-counseling')
      .eq('is_active', true);

    if (mErr) {
      console.error(`${LOG_PREFIX} event-type mapping query failed:`, mErr.message);
      return [];
    }

    const typeByUser = new Map<string, string>();
    for (const m of mappings ?? []) {
      if (m.host_profile_id && !typeByUser.has(m.host_profile_id)) {
        typeByUser.set(m.host_profile_id, m.id);
      }
    }

    // Preserve current_leads ASC order from the counselor query.
    return counselors
      .filter((c) => typeByUser.has(c.user_id))
      .map((c) => ({
        counselorId: c.id,
        userId: c.user_id,
        name: c.name,
        currentLeads: c.current_leads ?? 0,
        meetingTypeId: typeByUser.get(c.user_id)!,
      }));
  }

  /**
   * Round-robin pick. least_loaded: first of the load-ordered pool.
   * random: uniform pick (kept simple; strategy column allows it).
   * Returns null when no counselor is eligible — callers surface an explicit
   * "no counselors available" state (rule #27: never fail silently).
   */
  static async pickCounselor(
    supabase: SupabaseClient,
    config: RoutingConfig,
  ): Promise<PickedCounselor | null> {
    const pool = await this.eligiblePool(supabase, config);
    if (!pool.length) {
      console.warn(`${LOG_PREFIX} empty pool for slug=${config.slug} (institution=${config.institution_id})`);
      return null;
    }

    const idx =
      config.round_robin_strategy === 'random'
        ? Math.floor(Math.random() * pool.length)
        : 0;

    return { ...pool[idx], poolSize: pool.length };
  }

  /**
   * Re-validate at /book time that the client-supplied meetingTypeId belongs to
   * the config's eligible pool. Prevents meetingTypeId substitution between the
   * slots step and the confirm step. Returns the pool entry or null.
   */
  static async validateMeetingTypeInPool(
    supabase: SupabaseClient,
    config: RoutingConfig,
    meetingTypeId: string,
  ): Promise<PickedCounselor | null> {
    const pool = await this.eligiblePool(supabase, config);
    const match = pool.find((p) => p.meetingTypeId === meetingTypeId);
    if (!match) return null;
    return { ...match, poolSize: pool.length };
  }

  /**
   * Audit row for a successful routed booking. Failures are logged but NOT
   * thrown — the booking already exists in Cal.com; losing the audit row must
   * not surface as a booking failure to the visitor.
   */
  static async logRoutedBooking(
    supabase: SupabaseClient,
    input: RoutedBookingLogInput,
  ): Promise<void> {
    const { error } = await supabase.from('meeting_routing_log').insert({
      config_id: input.config.id,
      institution_id: input.config.institution_id,
      counselor_id: input.pick.counselorId,
      counselor_user_id: input.pick.userId,
      counselor_name: input.pick.name,
      pick_strategy: input.config.round_robin_strategy,
      pick_load: input.pick.currentLeads,
      pool_size: input.pick.poolSize,
      meeting_type_id: input.pick.meetingTypeId,
      // column name is historic; stores the NATIVE booking uid post-N2
      cal_booking_uid: input.calBookingUid,
      start_time: input.startTime,
      attendee_name: input.attendeeName,
      attendee_email: input.attendeeEmail,
      attendee_phone: input.attendeePhone ?? null,
      answers: input.answers,
    });

    if (error) {
      console.error(
        `${LOG_PREFIX} routing-log insert failed for booking=${input.calBookingUid}:`,
        error.message,
      );
    }
  }
}
