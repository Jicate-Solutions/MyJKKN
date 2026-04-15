import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelWaitlist,
  WaitlistStatus,
  RoomType,
  AcStatus,
} from '@/types/campus-living';

export class HostelWaitlistService {
  // ── List waitlist entries ──────────────────────────────────────────
  static async getWaitlist(
    institutionId: string,
    filters?: {
      academic_year_id?: string;
      status?: WaitlistStatus;
      preferred_block_id?: string;
      preferred_room_type?: RoomType;
    },
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_waitlist')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.academic_year_id) query = query.eq('academic_year_id', filters.academic_year_id);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.preferred_block_id) query = query.eq('preferred_block_id', filters.preferred_block_id);
      if (filters?.preferred_room_type) query = query.eq('preferred_room_type', filters.preferred_room_type);

      const from = (page - 1) * pageSize;
      query = query.order('priority_score', { ascending: false }).order('created_at').range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/waitlist', 'Failed to fetch waitlist', error);
        throw error;
      }
      return { data: data as HostelWaitlist[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/waitlist', 'Unexpected error in getWaitlist', error);
      throw error;
    }
  }

  // ── Single waitlist entry ─────────────────────────────────────────
  static async getWaitlistEntry(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_waitlist')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/waitlist', 'Failed to fetch waitlist entry', error);
        throw error;
      }
      return data as HostelWaitlist;
    } catch (error) {
      logger.error('campus-living/waitlist', 'Unexpected error in getWaitlistEntry', error);
      throw error;
    }
  }

  // ── Get waitlist entry by learner ─────────────────────────────────
  static async getWaitlistByLearner(learnerId: string, academicYearId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_waitlist')
        .select('*')
        .eq('learner_id', learnerId)
        .eq('academic_year_id', academicYearId)
        .in('status', ['waiting', 'offered'])
        .maybeSingle();

      if (error) {
        logger.error('campus-living/waitlist', 'Failed to fetch waitlist by learner', error);
        throw error;
      }
      return data as HostelWaitlist | null;
    } catch (error) {
      logger.error('campus-living/waitlist', 'Unexpected error in getWaitlistByLearner', error);
      throw error;
    }
  }

  // ── Create waitlist entry ─────────────────────────────────────────
  static async addToWaitlist(payload: Omit<HostelWaitlist, 'id' | 'offered_at' | 'offer_expires_at' | 'allocated_allocation_id' | 'created_at' | 'updated_at'>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_waitlist')
        .insert({
          ...payload,
          status: payload.status || 'waiting',
        })
        .select()
        .single();

      if (error) {
        logger.error('campus-living/waitlist', 'Failed to add to waitlist', error);
        throw error;
      }
      return data as HostelWaitlist;
    } catch (error) {
      logger.error('campus-living/waitlist', 'Unexpected error in addToWaitlist', error);
      throw error;
    }
  }

  // ── Update waitlist entry ─────────────────────────────────────────
  static async updateWaitlistEntry(id: string, payload: Partial<HostelWaitlist>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_waitlist')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/waitlist', 'Failed to update waitlist entry', error);
        throw error;
      }
      return data as HostelWaitlist;
    } catch (error) {
      logger.error('campus-living/waitlist', 'Unexpected error in updateWaitlistEntry', error);
      throw error;
    }
  }

  // ── Delete waitlist entry ─────────────────────────────────────────
  static async deleteWaitlistEntry(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_waitlist')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/waitlist', 'Failed to delete waitlist entry', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/waitlist', 'Unexpected error in deleteWaitlistEntry', error);
      throw error;
    }
  }

  // ── Offer a spot to next in line ──────────────────────────────────
  static async offerSpot(id: string, expiresInHours = 48) {
    try {
      const supabase = createClientSupabaseClient();
      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('hostel_waitlist')
        .update({
          status: 'offered' as WaitlistStatus,
          offered_at: new Date().toISOString(),
          offer_expires_at: expiresAt,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/waitlist', 'Failed to offer spot', error);
        throw error;
      }
      return data as HostelWaitlist;
    } catch (error) {
      logger.error('campus-living/waitlist', 'Unexpected error in offerSpot', error);
      throw error;
    }
  }

  // ── Accept offer ──────────────────────────────────────────────────
  static async acceptOffer(id: string, allocationId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_waitlist')
        .update({
          status: 'accepted' as WaitlistStatus,
          allocated_allocation_id: allocationId,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/waitlist', 'Failed to accept offer', error);
        throw error;
      }
      return data as HostelWaitlist;
    } catch (error) {
      logger.error('campus-living/waitlist', 'Unexpected error in acceptOffer', error);
      throw error;
    }
  }

  // ── Decline offer ─────────────────────────────────────────────────
  static async declineOffer(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_waitlist')
        .update({
          status: 'declined' as WaitlistStatus,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/waitlist', 'Failed to decline offer', error);
        throw error;
      }
      return data as HostelWaitlist;
    } catch (error) {
      logger.error('campus-living/waitlist', 'Unexpected error in declineOffer', error);
      throw error;
    }
  }

  // ── Mark expired offers ───────────────────────────────────────────
  static async markExpiredOffers(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('hostel_waitlist')
        .update({ status: 'expired' as WaitlistStatus })
        .eq('institution_id', institutionId)
        .eq('status', 'offered')
        .lt('offer_expires_at', now)
        .select();

      if (error) {
        logger.error('campus-living/waitlist', 'Failed to mark expired offers', error);
        throw error;
      }
      return data as HostelWaitlist[];
    } catch (error) {
      logger.error('campus-living/waitlist', 'Unexpected error in markExpiredOffers', error);
      throw error;
    }
  }

  // ── Mark allocated ────────────────────────────────────────────────
  static async markAllocated(id: string, allocationId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_waitlist')
        .update({
          status: 'allocated' as WaitlistStatus,
          allocated_allocation_id: allocationId,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/waitlist', 'Failed to mark allocated', error);
        throw error;
      }
      return data as HostelWaitlist;
    } catch (error) {
      logger.error('campus-living/waitlist', 'Unexpected error in markAllocated', error);
      throw error;
    }
  }

  // ── Get next in line (highest priority waiting) ───────────────────
  static async getNextInLine(
    institutionId: string,
    academicYearId: string,
    preferredBlockId?: string,
    preferredRoomType?: RoomType
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_waitlist')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('academic_year_id', academicYearId)
        .eq('status', 'waiting');

      if (preferredBlockId) query = query.eq('preferred_block_id', preferredBlockId);
      if (preferredRoomType) query = query.eq('preferred_room_type', preferredRoomType);

      query = query.order('priority_score', { ascending: false }).order('created_at').limit(1);

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/waitlist', 'Failed to get next in line', error);
        throw error;
      }
      return (data && data.length > 0) ? data[0] as HostelWaitlist : null;
    } catch (error) {
      logger.error('campus-living/waitlist', 'Unexpected error in getNextInLine', error);
      throw error;
    }
  }

  // ── Waitlist summary ──────────────────────────────────────────────
  static async getWaitlistSummary(institutionId: string, academicYearId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_waitlist')
        .select('status, preferred_room_type')
        .eq('institution_id', institutionId)
        .eq('academic_year_id', academicYearId);

      if (error) {
        logger.error('campus-living/waitlist', 'Failed to fetch waitlist summary', error);
        throw error;
      }

      const entries = data ?? [];
      return {
        total: entries.length,
        waiting: entries.filter((e) => e.status === 'waiting').length,
        offered: entries.filter((e) => e.status === 'offered').length,
        accepted: entries.filter((e) => e.status === 'accepted').length,
        declined: entries.filter((e) => e.status === 'declined').length,
        expired: entries.filter((e) => e.status === 'expired').length,
        allocated: entries.filter((e) => e.status === 'allocated').length,
        by_room_type: entries.reduce((acc, e) => {
          const rt = e.preferred_room_type || 'any';
          acc[rt] = (acc[rt] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };
    } catch (error) {
      logger.error('campus-living/waitlist', 'Unexpected error in getWaitlistSummary', error);
      throw error;
    }
  }
}
