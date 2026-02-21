import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelAllocation,
  CreateHostelAllocationDTO,
  UpdateHostelAllocationDTO,
  AllocationFilters,
  VacateReason,
} from '@/types/campus-living';

export class HostelAllocationService {
  // ── List allocations with filters ─────────────────────────────────
  static async getAllocations(
    institutionId: string,
    filters?: AllocationFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_allocations')
        .select('*, learner:profiles!hostel_allocations_learner_id_fkey(id, full_name, email), hostel_blocks(name, code), hostel_rooms(room_number, floor), hostel_beds(bed_number)', { count: 'exact' })
        .eq('institution_id', institutionId);

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

  // ── Active allocations ────────────────────────────────────────────
  static async getActiveAllocations(institutionId: string, blockId?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_allocations')
        .select('*, learner:profiles!hostel_allocations_learner_id_fkey(id, full_name, email), hostel_blocks(name, code), hostel_rooms(room_number, floor), hostel_beds(bed_number)')
        .eq('institution_id', institutionId)
        .eq('status', 'active');

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

  // ── Single allocation ─────────────────────────────────────────────
  static async getAllocation(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_allocations')
        .select('*, learner:profiles!hostel_allocations_learner_id_fkey(id, full_name, email), hostel_blocks(name, code), hostel_rooms(room_number, floor, room_type, ac_status), hostel_beds(bed_number, bed_type)')
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
  static async getAllocationByLearner(learnerId: string, activeOnly = true) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_allocations')
        .select('*, learner:profiles!hostel_allocations_learner_id_fkey(id, full_name, email), hostel_blocks(name, code), hostel_rooms(room_number, floor), hostel_beds(bed_number)')
        .eq('learner_id', learnerId);

      if (activeOnly) query = query.eq('status', 'active');
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
  static async transfer(
    allocationId: string,
    newRoomId: string,
    newBedId: string,
    newBlockId?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const updatePayload: Record<string, unknown> = {
        room_id: newRoomId,
        bed_id: newBedId,
        allocation_type: 'transfer',
      };
      if (newBlockId) updatePayload.block_id = newBlockId;

      const { data, error } = await supabase
        .from('hostel_allocations')
        .update(updatePayload)
        .eq('id', allocationId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/allocations', 'Failed to transfer allocation', error);
        throw error;
      }
      return data as HostelAllocation;
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in transfer', error);
      throw error;
    }
  }

  // ── Vacate ────────────────────────────────────────────────────────
  static async vacate(allocationId: string, reason: VacateReason) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_allocations')
        .update({
          status: 'vacated',
          vacate_reason: reason,
          actual_vacate_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', allocationId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/allocations', 'Failed to vacate', error);
        throw error;
      }
      return data as HostelAllocation;
    } catch (error) {
      logger.error('campus-living/allocations', 'Unexpected error in vacate', error);
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
