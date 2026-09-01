import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelAllocation,
  CreateHostelAllocationDTO,
  UpdateHostelAllocationDTO,
  AllocationFilters,
  VacateReason,
  RoomBedOccupancy,
  AllocatableRoom,
  AllocatableBlock,
} from '@/types/campus-living';

// Row shape returned by fn_cl_transfer_room_options (transfer-modal availability).
export interface TransferRoomOption {
  room_id: string;
  room_number: string;
  room_type: string | null;
  floor: number | null;
  category_id: string | null;
  category_name: string | null;
  category_type: string | null;
  total_beds: number;
  free_beds: number;
  occupied_beds: number;
}

export class HostelAllocationService {
  // ── List allocations with filters ─────────────────────────────────
  static async getAllocations(
    institutionId: string | undefined,
    filters?: AllocationFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_allocations')
        .select('*, learner:profiles!hostel_allocations_learner_id_fkey(id, full_name, email, academic:learners_profiles!profiles_learner_id_fkey(institution_id, program_id, semester_id, hostel_category_id, mess_category_id, institution:institutions!fk_learners_profiles_institution(name), program:programs!fk_learners_profiles_program(program_name), semester:semesters!fk_learners_profiles_semester(semester_name), room_category:hostel_categories!learners_profiles_hostel_category_id_fkey(name), mess_category:mess_categories!learners_profiles_mess_category_id_fkey(name))), hostel_blocks(name, code), hostel_rooms(room_number, floor), hostel_beds(bed_number)', { count: 'exact' });

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.academic_year_id) query = query.eq('academic_year_id', filters.academic_year_id);
      if (filters?.fee_status) query = query.eq('fee_status', filters.fee_status);
      if (filters?.search) {
        query = query.or(`learner_id.eq.${filters.search},emergency_contact_name.ilike.%${filters.search}%`);
      }

      const from = (page - 1) * pageSize;
      query = query.order('allocation_date', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/allocations', 'Failed to fetch allocations', error);
        throw error;
      }
      return { data: data as (HostelAllocation & Record<string, unknown>)[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in getAllocations', error);
      throw error;
    }
  }

  // ── All allocations for the admin list (no page cap) ──────────────
  // The /campus-living/allocations page computes summary counts + an advanced
  // client-side table/filters over the WHOLE set, so it must not be capped to
  // one page (the old getAllocations(pageSize=50) under-counted). Soft cap of
  // 5000 rows guards a runaway query; revisit with true server-side pagination
  // if a single institution ever exceeds it.
  static async getAllAllocations(institutionId: string | undefined, filters?: AllocationFilters) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_allocations')
        .select('*, learner:profiles!hostel_allocations_learner_id_fkey(id, full_name, email, academic:learners_profiles!profiles_learner_id_fkey(institution_id, program_id, semester_id, hostel_category_id, mess_category_id, lifecycle_status, gender, institution:institutions!fk_learners_profiles_institution(name), program:programs!fk_learners_profiles_program(program_name), semester:semesters!fk_learners_profiles_semester(semester_name), room_category:hostel_categories!learners_profiles_hostel_category_id_fkey(name), mess_category:mess_categories!learners_profiles_mess_category_id_fkey(name))), hostel_blocks(name, code, hostel_type), hostel_rooms(room_number, floor), hostel_beds(bed_number)');

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.academic_year_id) query = query.eq('academic_year_id', filters.academic_year_id);
      if (filters?.fee_status) query = query.eq('fee_status', filters.fee_status);

      query = query.order('allocation_date', { ascending: false }).range(0, 4999);

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/allocations', 'Failed to fetch all allocations', error);
        throw error;
      }
      // Campus Living shows ACTIVE learners only. Mirror v_learner_hostelites
      // (lifecycle_status = 'active'), so an inactive learner who still holds a
      // bed no longer appears here — this was the sole cause of the
      // Residents-vs-Allocations count mismatch. Rows whose learner has no
      // learners_profiles record (academic null) drop too, as they aren't an
      // active learner either. Filtered in JS (not a PostgREST !inner embed)
      // to avoid silently dropping rows on a null intermediate join.
      const activeOnly = (data ?? []).filter(
        (a: { learner?: { academic?: { lifecycle_status?: string } | null } | null }) =>
          a?.learner?.academic?.lifecycle_status === 'active',
      );
      return activeOnly as (HostelAllocation & Record<string, unknown>)[];
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in getAllAllocations', error);
      throw error;
    }
  }

  // ── Active allocations ────────────────────────────────────────────
  static async getActiveAllocations(institutionId: string | undefined, blockId?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_allocations')
        .select('*, learner:profiles!hostel_allocations_learner_id_fkey(id, full_name, email), hostel_blocks(name, code), hostel_rooms(room_number, floor), hostel_beds(bed_number)')
        .eq('status', 'active');

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (blockId) query = query.eq('block_id', blockId);
      query = query.order('allocation_date', { ascending: false });

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/allocations', 'Failed to fetch active allocations', error);
        throw error;
      }
      return data as (HostelAllocation & Record<string, unknown>)[];
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in getActiveAllocations', error);
      throw error;
    }
  }

  // ── Active allocations for admin list (rooms-v2 PR 4b) ────────────
  // Returns active allocations (check_out_date IS NULL) with all the
  // joined labels the admin table needs in a single query: learner name,
  // block name, room number, bed number. Super-admin friendly — no
  // institution scope by default (RLS handles it).
  static async getActiveAllocationsForAdmin() {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_allocations')
        .select(
          'id, learner_id, block_id, room_id, bed_id, check_in_date, monthly_fee_at_allocation_inr, fee_status, status, learner:profiles!hostel_allocations_learner_id_fkey(id, full_name, email), hostel_blocks(id, name, code), hostel_rooms(id, room_number, floor), hostel_beds(id, bed_number)',
        )
        .is('check_out_date', null)
        .order('check_in_date', { ascending: false });

      if (error) {
        logger.error('campus-living/allocations', 'Failed to fetch active allocations for admin', error);
        throw error;
      }
      return (data ?? []) as unknown as Array<
        HostelAllocation & {
          learner: { id: string; full_name: string | null; email: string | null } | null;
          hostel_blocks: { id: string; name: string; code: string | null } | null;
          hostel_rooms: { id: string; room_number: string; floor: number | null } | null;
          hostel_beds: { id: string; bed_number: string | null } | null;
        }
      >;
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in getActiveAllocationsForAdmin', error);
      throw error;
    }
  }

  // ── Single allocation ─────────────────────────────────────────────
  static async getAllocation(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_allocations')
        .select('*, learner:profiles!hostel_allocations_learner_id_fkey(id, full_name, email, academic:learners_profiles!profiles_learner_id_fkey(institution_id, degree_id, department_id, program_id, semester_id, hostel_category_id, mess_category_id, institution:institutions!fk_learners_profiles_institution(name), degree:degrees!fk_learners_profiles_degree(degree_name), department:departments!fk_learners_profiles_department(department_name), program:programs!fk_learners_profiles_program(program_name), semester:semesters!fk_learners_profiles_semester(semester_name), room_category:hostel_categories!learners_profiles_hostel_category_id_fkey(name), mess_category:mess_categories!learners_profiles_mess_category_id_fkey(name))), allocated_by_profile:profiles!hostel_allocations_allocated_by_fkey(full_name), hostel_blocks(name, code), hostel_rooms(room_number, floor, room_type, ac_status), hostel_beds(bed_number, bed_type)')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/allocations', 'Failed to fetch allocation', error);
        throw error;
      }
      return data as HostelAllocation & Record<string, unknown>;
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in getAllocation', error);
      throw error;
    }
  }

  // ── Allocation by learner ─────────────────────────────────────────
  // learnerId is a profiles.id (hostel_allocations.learner_id FKs to profiles).
  // `statuses` overrides the default active-only filter — pass e.g.
  // ['active','pending_approval','pending_vacate'] for display surfaces that
  // should also surface a not-yet-approved (proposed) allocation. Gating callers
  // (vacate / premium) keep the default active-only behaviour.
  static async getAllocationByLearner(
    learnerId: string,
    activeOnly = true,
    statuses?: string[]
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_allocations')
        .select('*, learner:profiles!hostel_allocations_learner_id_fkey(id, full_name, email), hostel_blocks(name, code), hostel_rooms(room_number, room_type, floor), hostel_beds(bed_number, bed_type)')
        .eq('learner_id', learnerId);

      if (statuses && statuses.length > 0) query = query.in('status', statuses);
      else if (activeOnly) query = query.eq('status', 'active');
      query = query.order('allocation_date', { ascending: false });

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/allocations', 'Failed to fetch allocation by learner', error);
        throw error;
      }
      return data as (HostelAllocation & Record<string, unknown>)[];
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in getAllocationByLearner', error);
      throw error;
    }
  }

  // ── Allocate ──────────────────────────────────────────────────────
  static async allocate(payload: CreateHostelAllocationDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_allocations')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/allocations', 'Failed to allocate', error);
        throw error;
      }
      return data as HostelAllocation;
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in allocate', error);
      throw error;
    }
  }

  // ── Room bed occupancy (fn_cl_room_bed_occupancy) ────────────────
  // Returns one row per bed in the room: is_occupied + occupant details.
  // Used by the manual-allocation dialog to show which beds are free.
  static async getRoomBedOccupancy(roomId: string): Promise<RoomBedOccupancy[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_room_bed_occupancy', { p_room_id: roomId });
    if (error) {
      logger.error('campus-living/allocations', 'Failed to load room occupancy', error);
      throw error;
    }
    return (data ?? []) as RoomBedOccupancy[];
  }

  // ── Allocatable rooms (fn_cl_admin_allocatable_rooms) ─────────────
  // ALL student rooms in a block with per-condition verdict flags (gender,
  // institution-serving, cohort eligibility, category, free beds) computed
  // server-side. is_allocatable rooms drive the dialog's room picker; the
  // failing flags drive its "why not allocatable" diagnostics.
  static async getAllocatableRooms(
    learnerProfileId: string,
    blockId: string,
  ): Promise<AllocatableRoom[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_admin_allocatable_rooms', {
      p_learner_profile_id: learnerProfileId,
      p_block_id: blockId,
    });
    if (error) {
      logger.error('campus-living/allocations', 'Failed to load allocatable rooms', error);
      throw error;
    }
    return (data ?? []) as AllocatableRoom[];
  }

  // ── Allocatable blocks (fn_cl_admin_allocatable_blocks) ───────────
  // Every hostel block with the count of rooms/beds this learner can actually
  // be allocated (same predicates as getAllocatableRooms, aggregated). Ranks
  // the dialog's block picker and drives its auto-select.
  static async getAllocatableBlocks(
    learnerProfileId: string,
  ): Promise<AllocatableBlock[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_admin_allocatable_blocks', {
      p_learner_profile_id: learnerProfileId,
    });
    if (error) {
      logger.error('campus-living/allocations', 'Failed to load allocatable blocks', error);
      throw error;
    }
    return (data ?? []) as AllocatableBlock[];
  }

  // ── Admin allocate bed (fn_cl_admin_allocate_bed) ─────────────────
  // SECURITY DEFINER RPC that creates a new active allocation atomically,
  // updating bed status. Gated on campus_living.upgrades.manage (super-admin +
  // the 5 hostel-admin roles) — NOT .allocations.* / .residents.edit, which are
  // mass-granted to every role and useless as a privilege gate.
  static async adminAllocateBed(args: {
    learnerProfileId: string;
    roomId: string;
    bedId: string;
    messCategoryId?: string | null;
  }): Promise<{ success: boolean; allocation_id: string }> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_admin_allocate_bed', {
      p_learner_profile_id: args.learnerProfileId,
      p_room_id: args.roomId,
      p_bed_id: args.bedId,
      p_mess_category_id: args.messCategoryId ?? null,
    });
    if (error) {
      logger.error('campus-living/allocations', 'Failed to allocate bed', error);
      throw error;
    }
    return data as { success: boolean; allocation_id: string };
  }

  // ── Bulk allocate ─────────────────────────────────────────────────
  static async bulkAllocate(allocations: CreateHostelAllocationDTO[]) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_allocations')
        .insert(allocations)
        .select();

      if (error) {
        logger.error('campus-living/allocations', 'Failed to bulk allocate', error);
        throw error;
      }
      return data as HostelAllocation[];
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in bulkAllocate', error);
      throw error;
    }
  }

  // ── Update allocation ─────────────────────────────────────────────
  static async updateAllocation(id: string, payload: UpdateHostelAllocationDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_allocations')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/allocations', 'Failed to update allocation', error);
        throw error;
      }
      return data as HostelAllocation;
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in updateAllocation', error);
      throw error;
    }
  }

  // ── Transfer to different room/bed ────────────────────────────────
  // Routes through fn_cl_admin_transfer_allocation (SECURITY DEFINER) instead of
  // a bare hostel_allocations UPDATE so the move is atomic AND keeps the bed
  // inventory invariant: the old bed is freed (status='available',
  // current_occupant_id NULL) and the new bed is occupied (status='occupied',
  // current_occupant_id = learner). A plain row update left the old bed stuck
  // 'occupied' and the new bed bookable by someone else. Gated on
  // campus_living.upgrades.manage (super-admin + the 5 hostel-admin roles).
  static async transfer(
    allocationId: string,
    newRoomId: string,
    newBedId: string,
    newBlockId?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc('fn_cl_admin_transfer_allocation', {
        p_allocation_id: allocationId,
        p_room_id: newRoomId,
        p_bed_id: newBedId,
        p_block_id: newBlockId ?? null,
      });

      if (error) {
        logger.error('campus-living/allocations', 'Failed to transfer allocation', error);
        throw error;
      }
      return data as { success: boolean; allocation_id: string; room_id: string; bed_id: string; block_id: string; freed_bed_id: string | null };
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in transfer', error);
      throw error;
    }
  }

  // Category-wise room/bed availability for the transfer modal: every room in
  // the block with its category + free/total bed counts (aggregated server-side
  // via fn_cl_transfer_room_options). Gated on campus_living.upgrades.manage.
  static async getTransferRoomOptions(blockId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc('fn_cl_transfer_room_options', {
        p_block_id: blockId,
      });
      if (error) {
        logger.error('campus-living/allocations', 'Failed to fetch transfer room options', error);
        throw error;
      }
      return (data ?? []) as TransferRoomOption[];
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in getTransferRoomOptions', error);
      throw error;
    }
  }

  // ── Check out (rooms-v2 PR 4b) ────────────────────────────────────
  // Sets check_out_date + actual_vacate_date so the UNIQUE
  // (room_id, bed_id) WHERE check_out_date IS NULL constraint frees up
  // the bed for re-allocation. Status is flipped to 'vacated' so legacy
  // queries (still filtering on status='active') continue to match
  // reality. The optional notes are reused via the existing
  // roommate_preference_notes column to avoid a schema change.
  static async checkOut(
    allocationId: string,
    checkOutDate: string,
    notes?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const payload: Record<string, unknown> = {
        status: 'vacated',
        check_out_date: checkOutDate,
        actual_vacate_date: checkOutDate,
      };
      if (notes && notes.trim().length > 0) {
        payload.roommate_preference_notes = notes.trim();
      }

      const { data, error } = await supabase
        .from('hostel_allocations')
        .update(payload)
        .eq('id', allocationId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/allocations', 'Failed to check out allocation', error);
        throw error;
      }
      return data as HostelAllocation;
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in checkOut', error);
      throw error;
    }
  }

  // ── Vacate ────────────────────────────────────────────────────────
  // Routes through fn_cl_vacate_allocation (SECURITY DEFINER) so flipping the
  // allocation and releasing the bed happen in ONE transaction. This used to be
  // a bare UPDATE of status/vacate_reason/actual_vacate_date, which stranded the
  // bed two ways with no error: hostel_beds kept status='occupied' plus a
  // current_occupant_id pointing at the departed learner (so it vanished from
  // getAvailableBeds and fn_cl_admin_allocatable_rooms), and a NULL
  // check_out_date kept hostel_allocations_room_bed_active_uidx — UNIQUE
  // (room_id, bed_id) WHERE check_out_date IS NULL — holding the slot, so even a
  // forced re-allocation hit 23505. No trigger compensates: none of the nine on
  // hostel_allocations fires on a transition INTO 'vacated'.
  //
  // It must be an RPC rather than a second .update() here because freeing the bed
  // needs campus_living.beds.edit — a DIFFERENT key from the
  // campus_living.allocations.edit that gates the allocation write — so the bed
  // write would be silently refused by RLS for exactly the hostel admins who use
  // this button. The RPC is idempotent on an already-vacated row.
  static async vacate(allocationId: string, reason: VacateReason) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc('fn_cl_vacate_allocation', {
        p_allocation_id: allocationId,
        p_vacate_reason: reason,
      });

      if (error) {
        logger.error('campus-living/allocations', 'Failed to vacate', error);
        throw error;
      }
      return data as {
        success: boolean;
        allocation_id: string;
        already_vacated: boolean;
        freed_bed_id: string | null;
      };
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in vacate', error);
      throw error;
    }
  }

  // ── Reset allocation (room and/or learner categories) ─────────────
  // Routes through fn_cl_admin_reset_allocation (SECURITY DEFINER) so the
  // undo is atomic and keeps the bed inventory invariant: the allocation row
  // is hard-deleted AND its bed freed (status='available', occupant NULL) in
  // one transaction; the learner's room/mess category columns on
  // learners_profiles are cleared through the RPC's own gate (hostel admins
  // can't UPDATE that table directly). Gated on campus_living.upgrades.manage.
  static async resetAllocation(
    allocationId: string,
    opts: { resetRoom: boolean; resetRoomCategory: boolean; resetMessCategory: boolean }
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc('fn_cl_admin_reset_allocation', {
        p_allocation_id: allocationId,
        p_reset_room: opts.resetRoom,
        p_reset_room_category: opts.resetRoomCategory,
        p_reset_mess_category: opts.resetMessCategory,
      });

      if (error) {
        logger.error('campus-living/allocations', 'Failed to reset allocation', error);
        throw error;
      }
      return data as {
        success: boolean;
        allocation_deleted: boolean;
        freed_bed_id: string | null;
        room_category_cleared: boolean;
        mess_category_cleared: boolean;
      };
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in resetAllocation', error);
      throw error;
    }
  }

  // ── Delete allocation ─────────────────────────────────────────────
  static async deleteAllocation(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_allocations')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/allocations', 'Failed to delete allocation', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in deleteAllocation', error);
      throw error;
    }
  }
}
