import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Local types (table: hostel_health_cases) ───────────────────────────
export type HealthSeverity = 'low' | 'medium' | 'high' | 'critical' | string;
export type HealthStatus = 'open' | 'under_treatment' | 'recovered' | 'referred' | 'closed' | string;

export interface HostelHealthCase {
  id: string;
  institution_id: string;
  learner_id?: string | null;
  block_id?: string | null;
  symptoms?: string | null;
  severity: HealthSeverity;
  status: HealthStatus;
  reported_at?: string | null;
  recovered_on?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface HealthFilters {
  status?: string;
  severity?: string;
  block_id?: string;
  learner_id?: string;
  date_from?: string;
  date_to?: string;
}

export type CreateHealthCaseDTO = Omit<
  HostelHealthCase,
  'id' | 'created_at' | 'updated_at'
> & { institution_id: string };

export class HealthService {
  static async getCases(
    institutionId: string | undefined,
    filters?: HealthFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from('hostel_health_cases')
        .select('*', { count: 'exact' });

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.severity) query = query.eq('severity', filters.severity);
      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters?.date_from) query = query.gte('created_at', filters.date_from);
      if (filters?.date_to) query = query.lte('created_at', filters.date_to);

      const from = (page - 1) * pageSize;
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/health', 'Failed to fetch health cases', error);
        throw error;
      }
      return { data: (data ?? []) as HostelHealthCase[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in getCases', error);
      throw error;
    }
  }

  static async getCase(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_health_cases')
        .select('*')
        .eq('id', id)
        .single();
      if (error) {
        logger.error('campus-living/health', 'Failed to fetch case', error);
        throw error;
      }
      return data as HostelHealthCase;
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in getCase', error);
      throw error;
    }
  }

  static async createCase(payload: CreateHealthCaseDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_health_cases')
        .insert(payload as never)
        .select()
        .single();
      if (error) {
        logger.error('campus-living/health', 'Failed to create case', error);
        throw error;
      }
      return data as HostelHealthCase;
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in createCase', error);
      throw error;
    }
  }

  static async updateCase(id: string, payload: Partial<HostelHealthCase>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_health_cases')
        .update(payload as never)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        logger.error('campus-living/health', 'Failed to update case', error);
        throw error;
      }
      return data as HostelHealthCase;
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in updateCase', error);
      throw error;
    }
  }

  static async deleteCase(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_health_cases')
        .delete()
        .eq('id', id);
      if (error) {
        logger.error('campus-living/health', 'Failed to delete case', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in deleteCase', error);
      throw error;
    }
  }
}
