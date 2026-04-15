import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Local types (table: hostel_laundry_orders) ─────────────────────────
export type LaundryStatus =
  | 'pending'
  | 'received'
  | 'washing'
  | 'drying'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export interface HostelLaundryOrder {
  id: string;
  institution_id: string;
  block_id?: string | null;
  learner_id?: string | null;
  status: LaundryStatus;
  service_type?: string | null;
  garment_count?: number | null;
  received_at?: string | null;
  delivered_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface LaundryFilters {
  status?: LaundryStatus | string;
  block_id?: string;
  learner_id?: string;
  service_type?: string;
  date_from?: string;
  date_to?: string;
}

export type CreateLaundryOrderDTO = Omit<
  HostelLaundryOrder,
  'id' | 'created_at' | 'updated_at'
> & { institution_id: string };

export class LaundryService {
  static async getOrders(
    institutionId: string,
    filters?: LaundryFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from('hostel_laundry_orders')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters?.service_type) query = query.eq('service_type', filters.service_type);
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
        .single();
      if (error) {
        logger.error('campus-living/laundry', 'Failed to fetch laundry order', error);
        throw error;
      }
      return data as HostelLaundryOrder;
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
