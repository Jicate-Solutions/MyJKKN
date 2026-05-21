import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Local types (table: hostel_laundry_orders) ─────────────────────────
// Schema-of-truth (prod, verified 2026-05-19 via information_schema):
//   hostel_laundry_orders columns: id, institution_id, learner_id, block_id,
//     config_id, order_number, items (jsonb), total_items, total_returned,
//     total_damaged, total_missing, status (enum laundry_order_status_enum),
//     collected_at, ready_at, delivered_at, student_confirmed, dispute_reason,
//     notes, created_at, updated_at
// Type drift fixed: enum was ['pending','received','washing','drying','ready',
//   'delivered','cancelled'] — actual prod enum is laundry_order_status_enum
//   ['submitted','collected','washing','ready','delivered','disputed'].
//   Renamed `garment_count` -> `total_items` (real column). Renamed
//   `received_at` -> `collected_at`. Added missing real columns. Removed
//   `service_type` (lives on hostel_laundry_config row referenced by config_id,
//   not on the order).
// 2026-05-20: Removed `service_type` from LaundryFilters + getOrders. Prior
//   code emitted `.eq('service_type', filters.service_type)` against
//   hostel_laundry_orders — a column that does not exist on that table; the
//   filter was silently inert (Supabase ignores unknown column eqs without
//   erroring on simple `.eq` clauses). No callers in the codebase passed
//   service_type (verified by grep across app/, hooks/, lib/). Re-add as a
//   joined filter via hostel_laundry_config.config_id when a real caller
//   needs it.
export type LaundryStatus =
  | 'submitted'
  | 'collected'
  | 'washing'
  | 'ready'
  | 'delivered'
  | 'disputed';

export interface HostelLaundryOrder {
  id: string;
  institution_id: string;
  learner_id: string;
  block_id: string;
  config_id?: string | null;
  order_number: string;
  items: unknown;
  total_items: number;
  total_returned?: number | null;
  total_damaged?: number | null;
  total_missing?: number | null;
  status: LaundryStatus | string;
  collected_at?: string | null;
  ready_at?: string | null;
  delivered_at?: string | null;
  student_confirmed?: boolean | null;
  dispute_reason?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface LaundryFilters {
  status?: LaundryStatus | string;
  block_id?: string;
  learner_id?: string;
  date_from?: string;
  date_to?: string;
}

export type CreateLaundryOrderDTO = Omit<
  HostelLaundryOrder,
  'id' | 'created_at' | 'updated_at'
> & { institution_id: string };

export class LaundryService {
  static async getOrders(
    institutionId: string | undefined,
    filters?: LaundryFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from('hostel_laundry_orders')
        .select('*', { count: 'exact' });

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters?.date_from) query = query.gte('created_at', filters.date_from);
      if (filters?.date_to) query = query.lte('created_at', filters.date_to);

      const from = (page - 1) * pageSize;
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/laundry', 'Failed to fetch laundry orders', error);
        throw error;
      }
      return { data: (data ?? []) as HostelLaundryOrder[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in getOrders', error);
      throw error;
    }
  }

  static async getOrder(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_laundry_orders')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        logger.error('campus-living/laundry', 'Failed to fetch laundry order', error);
        throw error;
      }
      return data as HostelLaundryOrder | null;
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in getOrder', error);
      throw error;
    }
  }

  static async createOrder(payload: CreateLaundryOrderDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_laundry_orders')
        .insert(payload as never)
        .select()
        .single();
      if (error) {
        logger.error('campus-living/laundry', 'Failed to create laundry order', error);
        throw error;
      }
      return data as HostelLaundryOrder;
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in createOrder', error);
      throw error;
    }
  }

  static async updateOrder(id: string, payload: Partial<HostelLaundryOrder>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_laundry_orders')
        .update(payload as never)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        logger.error('campus-living/laundry', 'Failed to update laundry order', error);
        throw error;
      }
      return data as HostelLaundryOrder;
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in updateOrder', error);
      throw error;
    }
  }

  static async deleteOrder(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_laundry_orders')
        .delete()
        .eq('id', id);
      if (error) {
        logger.error('campus-living/laundry', 'Failed to delete laundry order', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in deleteOrder', error);
      throw error;
    }
  }
}
