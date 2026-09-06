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

// ── Local types (table: hostel_laundry_configs) ────────────────────────
// Schema-of-truth (prod, verified 2026-05-21 via information_schema):
//   hostel_laundry_configs columns: id, institution_id, block_id (nullable —
//     global config when null), service_type (laundry_service_type_enum:
//     'in_house'|'vendor'), vendor_name, vendor_phone, vendor_contract_start,
//     vendor_contract_end, collection_days (int[] — ISO weekday 1=Mon..7=Sun),
//     delivery_days (int[]), max_items_per_student, cost_per_item (numeric),
//     is_included_in_fees, is_active, created_at, updated_at
// Note: spec called this `hostel_laundry_config` (singular) but reality is
//   plural `hostel_laundry_configs`. service_type enum is the delivery model
//   (in_house vs vendor), NOT the offering (wash/iron/dry-clean) — turnaround
//   commitments + offering mix live elsewhere if needed; this table holds the
//   block-scoped vendor contract + weekly cadence.
export type LaundryServiceType = 'in_house' | 'vendor';

export interface HostelLaundryConfig {
  id: string;
  institution_id: string;
  block_id?: string | null;
  service_type: LaundryServiceType | string;
  vendor_name?: string | null;
  vendor_phone?: string | null;
  vendor_contract_start?: string | null;
  vendor_contract_end?: string | null;
  collection_days?: number[] | null;
  delivery_days?: number[] | null;
  max_items_per_student?: number | null;
  cost_per_item?: number | string | null;
  is_included_in_fees?: boolean | null;
  is_active?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

export interface LaundryConfigFilters {
  block_id?: string;
  service_type?: LaundryServiceType | string;
  is_active?: boolean;
}

export type CreateLaundryConfigDTO = Omit<
  HostelLaundryConfig,
  'id' | 'created_at' | 'updated_at'
> & { institution_id: string; service_type: LaundryServiceType | string };

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

  // ── Config CRUD (hostel_laundry_configs) ─────────────────────────────
  // These configs are the unit of "laundry program" inside Campus Living —
  // each row binds a vendor contract + weekly cadence (collection_days /
  // delivery_days) to either a single block (block_id set) or the whole
  // institution (block_id NULL = global config).

  static async getConfigs(
    institutionId: string | undefined,
    filters?: LaundryConfigFilters
  ) {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from('hostel_laundry_configs')
        .select('*', { count: 'exact' });

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.service_type) query = query.eq('service_type', filters.service_type);
      if (typeof filters?.is_active === 'boolean') {
        query = query.eq('is_active', filters.is_active);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/laundry', 'Failed to fetch laundry configs', error);
        throw error;
      }
      return { data: (data ?? []) as HostelLaundryConfig[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in getConfigs', error);
      throw error;
    }
  }

  static async getConfig(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_laundry_configs')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        logger.error('campus-living/laundry', 'Failed to fetch laundry config', error);
        throw error;
      }
      return data as HostelLaundryConfig | null;
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in getConfig', error);
      throw error;
    }
  }

  static async createConfig(payload: CreateLaundryConfigDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_laundry_configs')
        .insert(payload as never)
        .select()
        .single();
      if (error) {
        logger.error('campus-living/laundry', 'Failed to create laundry config', error);
        throw error;
      }
      return data as HostelLaundryConfig;
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in createConfig', error);
      throw error;
    }
  }

  static async updateConfig(id: string, payload: Partial<HostelLaundryConfig>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_laundry_configs')
        .update(payload as never)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        logger.error('campus-living/laundry', 'Failed to update laundry config', error);
        throw error;
      }
      return data as HostelLaundryConfig;
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in updateConfig', error);
      throw error;
    }
  }

  static async deleteConfig(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_laundry_configs')
        .delete()
        .eq('id', id);
      if (error) {
        logger.error('campus-living/laundry', 'Failed to delete laundry config', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in deleteConfig', error);
      throw error;
    }
  }
}
