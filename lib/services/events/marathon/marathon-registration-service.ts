// lib/services/events/marathon/marathon-registration-service.ts
// Marathon registration service — participant CRUD, check-in, stats, BIB generation.
// Created: 2026-04-07

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  EventRegistration,
  RegistrationStatus,
  RegistrationFilters,
  PaymentStatus,
  ParticipantType,
} from '@/types/events';
import type { MarathonRegistrationCustomData } from '@/types/events-marathon';

// ============================================================================
// DTOs
// ============================================================================

export interface RegisterParticipantDto {
  event_id: string;
  category_id: string;
  participant_type: ParticipantType;
  participant_name: string;
  participant_phone: string;
  participant_email?: string;
  participant_age?: number;
  participant_gender?: string;
  institution_id?: string;
  institution_name?: string;
  department?: string;
  profile_id?: string;
  learner_id?: string;
  custom_data?: MarathonRegistrationCustomData;
  discount_code?: string;
  source?: string;
  referral_source?: string;
}

export interface TypeBreakdown {
  total: number;
  checked_in: number;
  payment_collected: number;
  payment_paid: number;
  payment_pending: number;
  payment_free: number;
  payment_waived: number;
}

export interface RegistrationStats {
  total: number;
  by_category: { category_name: string; category_code: string; count: number }[];
  by_status: { status: string; count: number }[];
  by_institution: { institution_name: string; count: number }[];
  by_gender: { gender: string; count: number }[];
  internal_count: number;
  external_count: number;
  checked_in_count: number;
  payment_collected: number;
  payment_pending: number;
  // Extended breakdowns
  internal: TypeBreakdown;
  external: TypeBreakdown;
  payment_total_amount: number;
  payment_paid_count: number;
  payment_pending_count: number;
  payment_free_count: number;
  payment_waived_count: number;
  payment_failed_count: number;
}

export interface CollegePenetration {
  institution_name: string;
  registered: number;
  total_students: number;
  percentage: number;
}

// ============================================================================
// Service
// ============================================================================

export class MarathonRegistrationService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // Read Operations
  // --------------------------------------------------------------------------

  /**
   * List registrations with optional filters and category join.
   */
  static async getRegistrations(
    eventId: string,
    filters?: Partial<RegistrationFilters>
  ): Promise<EventRegistration[]> {
    try {
      let query = (this.supabase as any)
        .from('events_registrations')
        .select('*, category:event_categories(*)')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.participant_type) {
        query = query.eq('participant_type', filters.participant_type);
      }
      if (filters?.payment_status) {
        query = query.eq('payment_status', filters.payment_status);
      }
      if (filters?.category_id) {
        query = query.eq('category_id', filters.category_id);
      }
      if (filters?.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }
      if (filters?.search) {
        query = query.or(
          `participant_name.ilike.%${filters.search}%,participant_phone.ilike.%${filters.search}%,bib_number.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query;

      if (error) {
        logger.error('events/marathon-registration', 'Failed to fetch registrations', error);
        throw error;
      }

      return (data as unknown as EventRegistration[]) ?? [];
    } catch (error) {
      logger.error('events/marathon-registration', 'Unexpected error in getRegistrations', error);
      throw error;
    }
  }

  /**
   * Fetch a single registration with category join.
   */
  static async getRegistration(id: string): Promise<EventRegistration | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('events_registrations')
        .select('*, category:event_categories(*)')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        logger.error('events/marathon-registration', 'Failed to fetch registration', { id, error });
        throw error;
      }

      return data as unknown as EventRegistration;
    } catch (error) {
      logger.error('events/marathon-registration', 'Unexpected error in getRegistration', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Write Operations
  // --------------------------------------------------------------------------

  /**
   * Register a participant — auto-generates BIB, sets payment based on category fee.
   */
  static async registerParticipant(dto: RegisterParticipantDto): Promise<EventRegistration> {
    try {
      // Fetch the category to determine fee and code
      const { data: category, error: catError } = await (this.supabase as any)
        .from('event_categories')
        .select('*')
        .eq('id', dto.category_id)
        .single();

      if (catError || !category) {
        throw new Error(`Category not found: ${dto.category_id}`);
      }

      // Fetch event for BIB generation context
      const { data: event, error: eventError } = await (this.supabase as any)
        .from('events')
        .select('id, name, year, config')
        .eq('id', dto.event_id)
        .single();

      if (eventError || !event) {
        throw new Error(`Event not found: ${dto.event_id}`);
      }

      // Determine payment status and amount
      const feeAmount = category.fee_amount ?? 0;
      const paymentStatus: PaymentStatus = feeAmount > 0 ? 'pending' : 'not_required';

      // Generate BIB number (needs paymentStatus to determine prefix)
      const eventCode =
        (event.config as Record<string, unknown>)?.event_code as string ??
        event.name.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
      const categoryCode = category.code ?? 'GEN';
      const sequence = await this.getNextBibSequence(dto.event_id, categoryCode, paymentStatus);
      const bibNumber = this.generateBibNumber(eventCode, event.year ?? new Date().getFullYear(), categoryCode, sequence, paymentStatus);

      const insertPayload = {
        event_id: dto.event_id,
        category_id: dto.category_id,
        participant_type: dto.participant_type,
        participant_name: dto.participant_name,
        participant_phone: dto.participant_phone,
        participant_email: dto.participant_email ?? null,
        participant_age: dto.participant_age ?? null,
        participant_gender: dto.participant_gender ?? null,
        institution_id: dto.institution_id ?? null,
        institution_name: dto.institution_name ?? null,
        department: dto.department ?? null,
        profile_id: dto.profile_id ?? null,
        learner_id: dto.learner_id ?? null,
        custom_data: dto.custom_data ?? {},
        discount_code: dto.discount_code ?? null,
        discount_amount: 0,
        source: dto.source ?? 'admin',
        referral_source: dto.referral_source ?? null,
        bib_number: bibNumber,
        status: 'registered' as RegistrationStatus,
        payment_status: paymentStatus,
        payment_amount: feeAmount,
        checked_in: false,
      };

      const { data, error } = await (this.supabase as any)
        .from('events_registrations')
        .insert([insertPayload])
        .select('*, category:event_categories(*)')
        .single();

      if (error) {
        logger.error('events/marathon-registration', 'Failed to register participant', error);
        throw error;
      }

      logger.info('events/marathon-registration', 'Participant registered', {
        eventId: dto.event_id,
        bib: bibNumber,
        name: dto.participant_name,
      });

      return data as unknown as EventRegistration;
    } catch (error) {
      logger.error('events/marathon-registration', 'Unexpected error in registerParticipant', error);
      throw error;
    }
  }

  /**
   * Update registration status.
   */
  static async updateRegistrationStatus(
    id: string,
    status: RegistrationStatus
  ): Promise<EventRegistration> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('events_registrations')
        .update({ status })
        .eq('id', id)
        .select('*, category:event_categories(*)')
        .single();

      if (error) {
        logger.error('events/marathon-registration', 'Failed to update registration status', { id, status, error });
        throw error;
      }

      return data as unknown as EventRegistration;
    } catch (error) {
      logger.error('events/marathon-registration', 'Unexpected error in updateRegistrationStatus', error);
      throw error;
    }
  }

  /**
   * Check in participant at venue.
   */
  static async checkInParticipant(id: string, checkedInBy: string): Promise<EventRegistration> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('events_registrations')
        .update({
          checked_in: true,
          checked_in_at: new Date().toISOString(),
          checked_in_by: checkedInBy,
          status: 'checked_in' as RegistrationStatus,
        })
        .eq('id', id)
        .select('*, category:event_categories(*)')
        .single();

      if (error) {
        logger.error('events/marathon-registration', 'Failed to check in participant', { id, error });
        throw error;
      }

      logger.info('events/marathon-registration', 'Participant checked in', { id });
      return data as unknown as EventRegistration;
    } catch (error) {
      logger.error('events/marathon-registration', 'Unexpected error in checkInParticipant', error);
      throw error;
    }
  }

  /**
   * Cancel a registration.
   */
  static async cancelRegistration(id: string): Promise<EventRegistration> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('events_registrations')
        .update({ status: 'cancelled' as RegistrationStatus })
        .eq('id', id)
        .select('*, category:event_categories(*)')
        .single();

      if (error) {
        logger.error('events/marathon-registration', 'Failed to cancel registration', { id, error });
        throw error;
      }

      logger.info('events/marathon-registration', 'Registration cancelled', { id });
      return data as unknown as EventRegistration;
    } catch (error) {
      logger.error('events/marathon-registration', 'Unexpected error in cancelRegistration', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  /**
   * Get registration statistics for an event.
   */
  static async getRegistrationStats(eventId: string): Promise<RegistrationStats> {
    try {
      // Fetch all registrations for this event with category join
      const { data: registrations, error } = await (this.supabase as any)
        .from('events_registrations')
        .select('status, participant_type, participant_gender, payment_status, payment_amount, checked_in, category_id, institution_name, category:event_categories(name, code)')
        .eq('event_id', eventId);

      if (error) {
        logger.error('events/marathon-registration', 'Failed to fetch registration stats', error);
        throw error;
      }

      const regs = (registrations ?? []) as any[];
      const total = regs.length;

      // By category
      const catMap = new Map<string, { category_name: string; category_code: string; count: number }>();
      for (const r of regs) {
        const catName = r.category?.name ?? 'Unknown';
        const catCode = r.category?.code ?? '-';
        const key = r.category_id ?? 'unknown';
        const existing = catMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          catMap.set(key, { category_name: catName, category_code: catCode, count: 1 });
        }
      }

      // By status
      const statusMap = new Map<string, number>();
      for (const r of regs) {
        statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + 1);
      }

      // By institution
      const instMap = new Map<string, number>();
      for (const r of regs) {
        const name = r.institution_name ?? 'External';
        instMap.set(name, (instMap.get(name) ?? 0) + 1);
      }

      // By gender
      const genderMap = new Map<string, number>();
      for (const r of regs) {
        const g = r.participant_gender ?? 'Not specified';
        genderMap.set(g, (genderMap.get(g) ?? 0) + 1);
      }

      // Counts
      const internalRegs = regs.filter((r: any) => r.participant_type === 'internal');
      const externalRegs = regs.filter((r: any) => r.participant_type === 'external');
      const internal_count = internalRegs.length;
      const external_count = externalRegs.length;
      const checked_in_count = regs.filter((r: any) => r.checked_in).length;
      const payment_collected = regs
        .filter((r: any) => r.payment_status === 'paid')
        .reduce((sum: number, r: any) => sum + (r.payment_amount ?? 0), 0);
      const payment_pending = regs.filter((r: any) => r.payment_status === 'pending').length;

      // Type breakdown helper
      const buildBreakdown = (subset: any[]): TypeBreakdown => ({
        total: subset.length,
        checked_in: subset.filter((r) => r.checked_in).length,
        payment_collected: subset
          .filter((r) => r.payment_status === 'paid')
          .reduce((sum: number, r) => sum + (r.payment_amount ?? 0), 0),
        payment_paid: subset.filter((r) => r.payment_status === 'paid').length,
        payment_pending: subset.filter((r) => r.payment_status === 'pending').length,
        payment_free: subset.filter((r) => r.payment_status === 'not_required').length,
        payment_waived: subset.filter((r) => r.payment_status === 'waived').length,
      });

      // Payment totals
      const payment_total_amount = regs.reduce((sum: number, r: any) => sum + (r.payment_amount ?? 0), 0);
      const payment_paid_count = regs.filter((r: any) => r.payment_status === 'paid').length;
      const payment_pending_count = payment_pending;
      const payment_free_count = regs.filter((r: any) => r.payment_status === 'not_required').length;
      const payment_waived_count = regs.filter((r: any) => r.payment_status === 'waived').length;
      const payment_failed_count = regs.filter((r: any) => r.payment_status === 'failed').length;

      return {
        total,
        by_category: Array.from(catMap.values()),
        by_status: Array.from(statusMap.entries()).map(([status, count]) => ({ status, count })),
        by_institution: Array.from(instMap.entries()).map(([institution_name, count]) => ({ institution_name, count })),
        by_gender: Array.from(genderMap.entries()).map(([gender, count]) => ({ gender, count })),
        internal_count,
        external_count,
        checked_in_count,
        payment_collected,
        payment_pending,
        internal: buildBreakdown(internalRegs),
        external: buildBreakdown(externalRegs),
        payment_total_amount,
        payment_paid_count,
        payment_pending_count,
        payment_free_count,
        payment_waived_count,
        payment_failed_count,
      };
    } catch (error) {
      logger.error('events/marathon-registration', 'Unexpected error in getRegistrationStats', error);
      throw error;
    }
  }

  /**
   * College penetration — % of each JKKN college that has registered.
   * Note: total_students is fetched from the institutions table.
   */
  static async getCollegePenetration(eventId: string): Promise<CollegePenetration[]> {
    try {
      // Get registrations grouped by institution
      const { data: regs, error: regError } = await (this.supabase as any)
        .from('events_registrations')
        .select('institution_id, institution_name')
        .eq('event_id', eventId)
        .eq('participant_type', 'internal')
        .not('institution_id', 'is', null);

      if (regError) {
        logger.error('events/marathon-registration', 'Failed to fetch college penetration registrations', regError);
        throw regError;
      }

      // Group by institution
      const instCounts = new Map<string, { name: string; count: number }>();
      for (const r of (regs ?? []) as any[]) {
        const key = r.institution_id;
        const existing = instCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          instCounts.set(key, { name: r.institution_name ?? 'Unknown', count: 1 });
        }
      }

      // Fetch total students per institution
      const institutionIds = Array.from(instCounts.keys());
      if (institutionIds.length === 0) return [];

      const { data: institutions, error: instError } = await (this.supabase as any)
        .from('institutions')
        .select('id, name, total_students')
        .in('id', institutionIds);

      if (instError) {
        logger.warn('events/marathon-registration', 'Could not fetch institution totals, using 0', instError);
      }

      const instTotals = new Map<string, number>();
      for (const inst of (institutions ?? []) as any[]) {
        instTotals.set(inst.id, inst.total_students ?? 0);
      }

      const results: CollegePenetration[] = [];
      for (const [id, { name, count }] of instCounts) {
        const total = instTotals.get(id) ?? 0;
        results.push({
          institution_name: name,
          registered: count,
          total_students: total,
          percentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
        });
      }

      return results.sort((a, b) => b.percentage - a.percentage);
    } catch (error) {
      logger.error('events/marathon-registration', 'Unexpected error in getCollegePenetration', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // BIB Number Generation
  // --------------------------------------------------------------------------

  /**
   * Generate a BIB number based on category and payment status.
   * Format:
   *   10K (all)   → T001-T500
   *   5K (paid)   → F0501-F2000
   *   5K (free)   → K2001-K2600
   */
  static generateBibNumber(
    _eventCode: string,
    _year: number,
    categoryCode: string,
    sequence: number,
    paymentStatus?: string
  ): string {
    const upperCat = categoryCode.toUpperCase();
    if (upperCat === '10K') {
      // T series: T001-T500
      return `T${String(sequence).padStart(3, '0')}`;
    } else if (upperCat === '5K') {
      if (paymentStatus === 'not_required') {
        // K series: K2001-K2600 (free/school students)
        return `K${String(sequence + 2000).padStart(4, '0')}`;
      }
      // F series: F0501-F2000 (paid adults)
      return `F${String(sequence + 500).padStart(4, '0')}`;
    }
    // Fallback for unknown categories
    return `X${String(sequence).padStart(4, '0')}`;
  }

  /**
   * Get next sequence number for BIB generation by counting existing registrations
   * matching the same BIB prefix (T, F, or K).
   */
  static async getNextBibSequence(eventId: string, categoryCode: string, paymentStatus?: string): Promise<number> {
    try {
      const prefix = this.getBibPrefix(categoryCode, paymentStatus);
      const { count, error } = await (this.supabase as any)
        .from('events_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .like('bib_number', `${prefix}%`);

      if (error) {
        logger.warn('events/marathon-registration', 'Failed to get BIB sequence count, defaulting to 1', error);
        return 1;
      }

      return (count ?? 0) + 1;
    } catch (error) {
      logger.warn('events/marathon-registration', 'Unexpected error in getNextBibSequence, defaulting to 1', error);
      return 1;
    }
  }

  /**
   * Get BIB prefix based on category and payment status.
   */
  static getBibPrefix(categoryCode: string, paymentStatus?: string): string {
    const upperCat = categoryCode.toUpperCase();
    if (upperCat === '10K') return 'T';
    if (upperCat === '5K' && paymentStatus === 'not_required') return 'K';
    if (upperCat === '5K') return 'F';
    return 'X';
  }
}
