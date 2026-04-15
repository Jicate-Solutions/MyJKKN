import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelVisitor,
  CreateHostelVisitorDTO,
  HostelKnownVisitor,
  VisitorFilters,
  VisitorStatus,
} from '@/types/campus-living';

export class VisitorService {
  // ── List visitors with filters ────────────────────────────────────
  static async getVisitors(
    institutionId: string,
    filters?: VisitorFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_visitors')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.date) {
        query = query.gte('check_in_time', `${filters.date}T00:00:00`)
                     .lte('check_in_time', `${filters.date}T23:59:59`);
      }

      const from = (page - 1) * pageSize;
      query = query.order('check_in_time', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/visitors', 'Failed to fetch visitors', error);
        throw error;
      }
      return { data: data as HostelVisitor[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/visitors', 'Unexpected error in getVisitors', error);
      throw error;
    }
  }

  // ── Single visitor record ─────────────────────────────────────────
  static async getVisitor(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_visitors')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/visitors', 'Failed to fetch visitor', error);
        throw error;
      }
      return data as HostelVisitor;
    } catch (error) {
      logger.error('campus-living/visitors', 'Unexpected error in getVisitor', error);
      throw error;
    }
  }

  // ── Register visitor (check-in) ───────────────────────────────────
  static async registerVisitor(payload: CreateHostelVisitorDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_visitors')
        .insert({
          ...payload,
          check_in_time: payload.check_in_time || new Date().toISOString(),
          status: payload.status || 'checked_in',
        })
        .select()
        .single();

      if (error) {
        logger.error('campus-living/visitors', 'Failed to register visitor', error);
        throw error;
      }
      return data as HostelVisitor;
    } catch (error) {
      logger.error('campus-living/visitors', 'Unexpected error in registerVisitor', error);
      throw error;
    }
  }

  // ── Check-out visitor ─────────────────────────────────────────────
  static async checkOut(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_visitors')
        .update({
          check_out_time: new Date().toISOString(),
          status: 'checked_out' as VisitorStatus,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/visitors', 'Failed to check out visitor', error);
        throw error;
      }
      return data as HostelVisitor;
    } catch (error) {
      logger.error('campus-living/visitors', 'Unexpected error in checkOut', error);
      throw error;
    }
  }

  // ── Reject visitor ────────────────────────────────────────────────
  static async rejectVisitor(id: string, reason: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_visitors')
        .update({
          status: 'rejected' as VisitorStatus,
          rejection_reason: reason,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/visitors', 'Failed to reject visitor', error);
        throw error;
      }
      return data as HostelVisitor;
    } catch (error) {
      logger.error('campus-living/visitors', 'Unexpected error in rejectVisitor', error);
      throw error;
    }
  }

  // ── Update visitor record ─────────────────────────────────────────
  static async updateVisitor(id: string, payload: Partial<HostelVisitor>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_visitors')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/visitors', 'Failed to update visitor', error);
        throw error;
      }
      return data as HostelVisitor;
    } catch (error) {
      logger.error('campus-living/visitors', 'Unexpected error in updateVisitor', error);
      throw error;
    }
  }

  // ── Delete visitor record ─────────────────────────────────────────
  static async deleteVisitor(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_visitors')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/visitors', 'Failed to delete visitor', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/visitors', 'Unexpected error in deleteVisitor', error);
      throw error;
    }
  }

  // ── Currently checked-in visitors ─────────────────────────────────
  static async getCurrentVisitors(institutionId: string, blockId?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_visitors')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('status', 'checked_in');

      if (blockId) query = query.eq('block_id', blockId);
      query = query.order('check_in_time', { ascending: false });

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/visitors', 'Failed to fetch current visitors', error);
        throw error;
      }
      return data as HostelVisitor[];
    } catch (error) {
      logger.error('campus-living/visitors', 'Unexpected error in getCurrentVisitors', error);
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // Known Visitor Management
  // ══════════════════════════════════════════════════════════════════

  // ── Get known visitors for a learner ──────────────────────────────
  static async getKnownVisitors(learnerId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_known_visitors')
        .select('*')
        .eq('learner_id', learnerId)
        .eq('is_active', true)
        .order('visitor_name');

      if (error) {
        logger.error('campus-living/visitors', 'Failed to fetch known visitors', error);
        throw error;
      }
      return data as HostelKnownVisitor[];
    } catch (error) {
      logger.error('campus-living/visitors', 'Unexpected error in getKnownVisitors', error);
      throw error;
    }
  }

  // ── Add known visitor ─────────────────────────────────────────────
  static async addKnownVisitor(payload: Omit<HostelKnownVisitor, 'id' | 'visit_count' | 'last_visit_at' | 'created_at' | 'updated_at'>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_known_visitors')
        .insert({
          ...payload,
          visit_count: 0,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        logger.error('campus-living/visitors', 'Failed to add known visitor', error);
        throw error;
      }
      return data as HostelKnownVisitor;
    } catch (error) {
      logger.error('campus-living/visitors', 'Unexpected error in addKnownVisitor', error);
      throw error;
    }
  }

  // ── Update known visitor ──────────────────────────────────────────
  static async updateKnownVisitor(id: string, payload: Partial<HostelKnownVisitor>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_known_visitors')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/visitors', 'Failed to update known visitor', error);
        throw error;
      }
      return data as HostelKnownVisitor;
    } catch (error) {
      logger.error('campus-living/visitors', 'Unexpected error in updateKnownVisitor', error);
      throw error;
    }
  }

  // ── Deactivate known visitor ──────────────────────────────────────
  static async deactivateKnownVisitor(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_known_visitors')
        .update({ is_active: false })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/visitors', 'Failed to deactivate known visitor', error);
        throw error;
      }
      return data as HostelKnownVisitor;
    } catch (error) {
      logger.error('campus-living/visitors', 'Unexpected error in deactivateKnownVisitor', error);
      throw error;
    }
  }

  // ── Record visit for known visitor ────────────────────────────────
  static async recordKnownVisit(knownVisitorId: string) {
    try {
      const supabase = createClientSupabaseClient();

      // Fetch current record first
      const { data: current, error: fetchError } = await supabase
        .from('hostel_known_visitors')
        .select('visit_count')
        .eq('id', knownVisitorId)
        .single();

      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from('hostel_known_visitors')
        .update({
          visit_count: (current?.visit_count ?? 0) + 1,
          last_visit_at: new Date().toISOString(),
        })
        .eq('id', knownVisitorId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/visitors', 'Failed to record known visit', error);
        throw error;
      }
      return data as HostelKnownVisitor;
    } catch (error) {
      logger.error('campus-living/visitors', 'Unexpected error in recordKnownVisit', error);
      throw error;
    }
  }
}
