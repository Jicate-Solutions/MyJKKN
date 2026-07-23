import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelWaitlist,
  WaitlistStatus,
  RoomType,
  AcStatus,
} from '@/types/campus-living';

// hostel_waitlist.learner_id is a FK to profiles(id) (NOT learners_profiles).
// The list view enriches each row with the learner's display name (profiles.
// full_name) + roll number (learners_profiles.roll_number, via the
// profiles.learner_id bridge) so the UI shows a name instead of the raw UUID.
export interface HostelWaitlistRow extends HostelWaitlist {
  learner_name: string;
  roll_number: string | null;
  // Enriched display fields (resolved by getWaitlist):
  target_category_name: string | null;   // the category the entry is waiting/upgrading to
  target_category_type: string | null;    // boys | girls
  held_room_number: string | null;        // the bed-held room (room-reservation upgrades)
  held_room_floor: number | null;
  held_block_name: string | null;
  institution_name: string | null;
  semester_name: string | null;
}

export class HostelWaitlistService {
  // ── List waitlist entries ──────────────────────────────────────────
  static async getWaitlist(
    institutionId: string | undefined,
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
      // Left embed (no !inner) so a row whose profile is missing still shows
      // (degrades to '—') instead of being silently dropped.
      let query = supabase
        .from('hostel_waitlist')
        .select(
          '*, learner:profiles!hostel_waitlist_learner_id_fkey(full_name, email, learner_profile:learners_profiles!profiles_learner_id_fkey(roll_number, semester_id))',
          { count: 'exact' }
        );

      if (institutionId) query = query.eq('institution_id', institutionId);
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
      const raw = (data ?? []) as Record<string, unknown>[];

      // Resolve the FK display names in batch lookups (robust to missing PostgREST FK
      // metadata): target category, the bed-held room + its block, institution, semester.
      const catIds = new Set<string>(), roomIds = new Set<string>(),
        instIds = new Set<string>(), semIds = new Set<string>();
      for (const r of raw) {
        if (r.target_hostel_category_id) catIds.add(r.target_hostel_category_id as string);
        if (r.held_room_id) roomIds.add(r.held_room_id as string);
        if (r.institution_id) instIds.add(r.institution_id as string);
        const sem = (r.learner as { learner_profile?: { semester_id?: string } | null } | null)?.learner_profile?.semester_id;
        if (sem) semIds.add(sem);
      }
      const catMap = new Map<string, { name: string; type: string | null }>();
      if (catIds.size) {
        const { data: c } = await supabase.from('hostel_categories').select('id, name, type').in('id', [...catIds]);
        (c ?? []).forEach((x: Record<string, unknown>) => catMap.set(x.id as string, { name: x.name as string, type: (x.type as string) ?? null }));
      }
      const roomMap = new Map<string, { room_number: string; floor: number | null; block_name: string | null }>();
      if (roomIds.size) {
        const { data: rm } = await supabase.from('hostel_rooms').select('id, room_number, floor, block:hostel_blocks(name)').in('id', [...roomIds]);
        (rm ?? []).forEach((x: Record<string, unknown>) => roomMap.set(x.id as string, {
          room_number: x.room_number as string,
          floor: (x.floor as number) ?? null,
          block_name: ((x.block as { name?: string } | null)?.name) ?? null,
        }));
      }
      const instMap = new Map<string, string>();
      if (instIds.size) {
        const { data: it } = await supabase.from('institutions').select('id, name').in('id', [...instIds]);
        (it ?? []).forEach((x: Record<string, unknown>) => instMap.set(x.id as string, x.name as string));
      }
      const semMap = new Map<string, string>();
      if (semIds.size) {
        const { data: sm } = await supabase.from('semesters').select('id, semester_name').in('id', [...semIds]);
        (sm ?? []).forEach((x: Record<string, unknown>) => semMap.set(x.id as string, x.semester_name as string));
      }

      const rows: HostelWaitlistRow[] = raw.map((r) => {
        const learner = r.learner as {
          full_name?: string;
          email?: string;
          learner_profile?: { roll_number?: string; semester_id?: string } | null;
        } | null;
        const { learner: _learner, ...rest } = r;
        const cat = r.target_hostel_category_id ? catMap.get(r.target_hostel_category_id as string) : undefined;
        const room = r.held_room_id ? roomMap.get(r.held_room_id as string) : undefined;
        const semId = learner?.learner_profile?.semester_id;
        return {
          ...(rest as HostelWaitlist),
          learner_name: learner?.full_name || learner?.email || '—',
          roll_number: learner?.learner_profile?.roll_number ?? null,
          target_category_name: cat?.name ?? null,
          target_category_type: cat?.type ?? null,
          held_room_number: room?.room_number ?? null,
          held_room_floor: room?.floor ?? null,
          held_block_name: room?.block_name ?? null,
          institution_name: r.institution_id ? instMap.get(r.institution_id as string) ?? null : null,
          semester_name: semId ? semMap.get(semId) ?? null : null,
        };
      });
      return { data: rows, count: count ?? 0 };
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
        .maybeSingle();

      if (error) {
        logger.error('campus-living/waitlist', 'Failed to fetch waitlist entry', error);
        throw error;
      }
      return data as HostelWaitlist | null;
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

  // ── Admin: cancel a waiting/offered upgrade request (full revert) ──
  static async cancelUpgrade(waitlistId: string) {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('fn_cl_admin_cancel_upgrade', {
        p_waitlist_id: waitlistId,
      });
      if (error) {
        logger.error('campus-living/waitlist', 'Failed to cancel upgrade', error);
        throw error;
      }
      return data as { success: boolean; waitlist_id: string; category_reverted: boolean };
    } catch (error) {
      logger.error('campus-living/waitlist', 'Unexpected error in cancelUpgrade', error);
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
  static async markExpiredOffers(institutionId: string | undefined) {
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
    institutionId: string | undefined,
    academicYearId: string,
    preferredBlockId?: string,
    preferredRoomType?: RoomType
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_waitlist')
        .select('*')
        .eq('academic_year_id', academicYearId)
        .eq('status', 'waiting');

      if (institutionId) query = query.eq('institution_id', institutionId);
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
  static async getWaitlistSummary(institutionId: string | undefined, academicYearId: string) {
    try {
      const supabase = createClientSupabaseClient();
      let q = supabase
        .from('hostel_waitlist')
        .select('status, preferred_room_type')
        .eq('academic_year_id', academicYearId);
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { data, error } = await q;

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
