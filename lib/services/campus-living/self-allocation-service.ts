import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { ProposedAllocation } from '@/types/allocation-batch';

const LOG = 'campus-living/self-allocation';

export interface ManualCategoryOption {
  id: string;
  name: string;
  type: string;
}
export interface RoomOption {
  bed_id: string;
  room_id: string;
  room_number: string;
  floor: number;
  block_name: string;
  bed_number: string;
}

export class SelfAllocationService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  // The generated Database type doesn't carry these RPCs; wrap loosely.
  private static rpcCall(fn: string, args: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.supabase as any).rpc(fn, args) as Promise<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  }

  static async getMyManualCategories(): Promise<ManualCategoryOption[]> {
    const { data, error } = await this.rpcCall('fn_my_manual_categories', {});
    if (error) throw new Error(error.message || 'Failed to load categories');
    return (data as ManualCategoryOption[]) ?? [];
  }

  static async getMyRoomOptions(categoryId: string): Promise<RoomOption[]> {
    const { data, error } = await this.rpcCall('fn_my_room_options', {
      p_category_id: categoryId,
    });
    if (error) throw new Error(error.message || 'Failed to load rooms');
    return (data as RoomOption[]) ?? [];
  }

  static async requestRoom(
    categoryId: string,
    roomId: string,
    bedId: string
  ): Promise<string> {
    const { data, error } = await this.rpcCall('fn_self_request_room', {
      p_category_id: categoryId,
      p_room_id: roomId,
      p_bed_id: bedId,
    });
    if (error) throw new Error(error.message || 'Failed to submit request');
    return data as string;
  }

  static async approve(allocationId: string): Promise<void> {
    const { error } = await this.rpcCall('fn_approve_allocation', {
      p_allocation_id: allocationId,
    });
    if (error) throw new Error(error.message || 'Failed to approve');
  }

  static async reject(allocationId: string): Promise<void> {
    const { error } = await this.rpcCall('fn_reject_allocation', {
      p_allocation_id: allocationId,
    });
    if (error) throw new Error(error.message || 'Failed to reject');
  }

  // Individual (non-batch) pending requests, scoped to the warden's block by RLS.
  static async getPendingRequests(): Promise<ProposedAllocation[]> {
    const { data, error } = await this.supabase
      .from('hostel_allocations')
      .select(
        `id, status,
         block:hostel_blocks(name),
         room:hostel_rooms(room_number),
         bed:hostel_beds(bed_number),
         learner:profiles!hostel_allocations_learner_id_fkey(full_name, email)`
      )
      .eq('status', 'pending_approval')
      .is('batch_id', null)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error(LOG, 'getPendingRequests failed', error);
      throw new Error(error.message || 'Failed to load pending requests');
    }
    return (data ?? []).map((a: Record<string, unknown>) => {
      const block = a.block as { name?: string } | null;
      const room = a.room as { room_number?: string } | null;
      const bed = a.bed as { bed_number?: string } | null;
      const learner = a.learner as { full_name?: string; email?: string } | null;
      return {
        id: a.id as string,
        learner_name: learner?.full_name || learner?.email || '—',
        block_name: block?.name ?? null,
        room_number: room?.room_number ?? null,
        bed_number: bed?.bed_number ?? null,
        status: a.status as string,
      };
    });
  }
}
