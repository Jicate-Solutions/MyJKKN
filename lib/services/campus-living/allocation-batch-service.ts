import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  AllocationBatch,
  AllocationBatchRow,
  AllocatePreview,
  ProposedAllocation,
  AutoCategoryOption,
  AcademicYearOption,
} from '@/types/allocation-batch';

const LOG = 'campus-living/allocation-batch';

export class AllocationBatchService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  // The generated Database type doesn't carry these campus-living RPCs; wrap
  // .rpc() loosely (each caller validates/casts the result).
  private static rpcCall(fn: string, args: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.supabase as any).rpc(fn, args) as Promise<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  }

  // ── Auto-allocation engine RPCs ──
  static async preview(
    blockId: string,
    categoryId: string
  ): Promise<AllocatePreview> {
    const { data, error } = await this.rpcCall('fn_auto_allocate_preview', {
      p_block_id: blockId,
      p_category_id: categoryId,
    });
    if (error) {
      logger.error(LOG, 'preview failed', error);
      throw new Error(error.message || 'Failed to preview allocation');
    }
    const row = Array.isArray(data) ? data[0] : data;
    return (row ?? {
      cohort_eligible: 0,
      no_profile: 0,
      already_allocated: 0,
      available_beds: 0,
    }) as AllocatePreview;
  }

  static async generate(
    blockId: string,
    categoryId: string,
    hostelYearId: string
  ): Promise<string> {
    const { data, error } = await this.rpcCall('fn_auto_allocate_classic', {
      p_block_id: blockId,
      p_category_id: categoryId,
      p_hostel_year_id: hostelYearId,
    });
    if (error) {
      logger.error(LOG, 'generate failed', error);
      throw new Error(error.message || 'Failed to generate allocation batch');
    }
    return data as string;
  }

  static async approve(batchId: string): Promise<void> {
    const { error } = await this.rpcCall('fn_approve_allocation_batch', {
      p_batch_id: batchId,
    });
    if (error) {
      logger.error(LOG, 'approve failed', error);
      throw new Error(error.message || 'Failed to approve batch');
    }
  }

  static async reject(batchId: string): Promise<void> {
    const { error } = await this.rpcCall('fn_reject_allocation_batch', {
      p_batch_id: batchId,
    });
    if (error) {
      logger.error(LOG, 'reject failed', error);
      throw new Error(error.message || 'Failed to reject batch');
    }
  }

  // Completely remove a batch (frees beds + deletes its allocations + the batch).
  static async reset(batchId: string): Promise<void> {
    const { error } = await this.rpcCall('fn_reset_allocation_batch', {
      p_batch_id: batchId,
    });
    if (error) {
      logger.error(LOG, 'reset failed', error);
      throw new Error(error.message || 'Failed to reset batch');
    }
  }

  // ── Reads ──
  static async getBatches(institutionId?: string): Promise<AllocationBatchRow[]> {
    let q = this.supabase
      .from('hostel_allocation_batches')
      .select('*, category:hostel_categories(name), institution:institutions(name), block:hostel_blocks(name)')
      .order('created_at', { ascending: false });
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data, error } = await q;
    if (error) {
      logger.error(LOG, 'getBatches failed', error);
      throw new Error(error.message || 'Failed to load batches');
    }
    return (data ?? []).map((r: Record<string, unknown>) => {
      const cat = r.category as { name?: string } | null;
      const inst = r.institution as { name?: string } | null;
      const blk = r.block as { name?: string } | null;
      const { category: _c, institution: _i, block: _b, ...rest } = r;
      return {
        ...(rest as AllocationBatch),
        category_name: cat?.name ?? null,
        institution_name: inst?.name ?? null,
        block_name: blk?.name ?? null,
      };
    });
  }

  static async getBatch(
    batchId: string
  ): Promise<{ batch: AllocationBatchRow | null; allocations: ProposedAllocation[] }> {
    const { data: b, error: bErr } = await this.supabase
      .from('hostel_allocation_batches')
      .select('*, category:hostel_categories(name), institution:institutions(name), block:hostel_blocks(name)')
      .eq('id', batchId)
      .maybeSingle();
    if (bErr) {
      logger.error(LOG, 'getBatch failed', bErr);
      throw new Error(bErr.message || 'Failed to load batch');
    }
    let batch: AllocationBatchRow | null = null;
    if (b) {
      const r = b as Record<string, unknown>;
      const cat = r.category as { name?: string } | null;
      const inst = r.institution as { name?: string } | null;
      const blk = r.block as { name?: string } | null;
      const { category: _c, institution: _i, block: _b, ...rest } = r;
      batch = {
        ...(rest as AllocationBatch),
        category_name: cat?.name ?? null,
        institution_name: inst?.name ?? null,
        block_name: blk?.name ?? null,
      };
    }

    const { data: allocs, error: aErr } = await this.supabase
      .from('hostel_allocations')
      .select(
        `id, status,
         block:hostel_blocks(name),
         room:hostel_rooms(room_number, floor),
         bed:hostel_beds(bed_number),
         learner:profiles!hostel_allocations_learner_id_fkey(full_name, email)`
      )
      .eq('batch_id', batchId);
    if (aErr) {
      logger.error(LOG, 'getBatch allocations failed', aErr);
      throw new Error(aErr.message || 'Failed to load batch allocations');
    }

    const allocations: ProposedAllocation[] = (allocs ?? [])
      .map((a: Record<string, unknown>) => {
        const block = a.block as { name?: string } | null;
        const room = a.room as { room_number?: string; floor?: number } | null;
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
      })
      .sort((x, y) => x.learner_name.localeCompare(y.learner_name));

    return { batch, allocations };
  }

  // ── Loaders ──
  static async getAutoCategories(): Promise<AutoCategoryOption[]> {
    const { data, error } = await this.supabase
      .from('hostel_categories')
      .select('id, name, type')
      .eq('allocation_mode', 'auto')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('type', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to load auto categories');
    return (data ?? []) as AutoCategoryOption[];
  }

  // Blocks to fill (the auto-allocate target). Gender comes from hostel_type.
  static async getBlocks(): Promise<{ id: string; name: string; type: string }[]> {
    const { data, error } = await this.supabase
      .from('hostel_blocks')
      .select('id, name, hostel_type')
      .order('name', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to load blocks');
    return (data ?? []).map((b: Record<string, unknown>) => ({
      id: b.id as string,
      name: b.name as string,
      type: b.hostel_type as string,
    }));
  }

  // Hostel years are global (no institution_id) — the campus-living calendar.
  static async getHostelYears(): Promise<AcademicYearOption[]> {
    const { data, error } = await this.supabase
      .from('hostel_years')
      .select('id, name, is_current')
      .eq('is_active', true)
      .order('start_date', { ascending: false });
    if (error) throw new Error(error.message || 'Failed to load hostel years');
    return (data ?? []).map((y: Record<string, unknown>) => ({
      id: y.id as string,
      label: (y.name as string) + (y.is_current ? ' (current)' : ''),
    }));
  }
}
