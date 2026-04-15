import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelAccessLog,
  AccessLogPersonType,
  AccessLogDirection,
  AccessLogMethod,
} from '@/types/campus-living';

export class CampusLivingAccessLog {
  // ── List access logs ──────────────────────────────────────────────
  static async getAccessLogs(
    institutionId: string,
    filters?: {
      block_id?: string;
      person_type?: AccessLogPersonType;
      direction?: AccessLogDirection;
      is_flagged?: boolean;
      date_from?: string;
      date_to?: string;
    },
    page = 1,
    pageSize = 100
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_access_log')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.person_type) query = query.eq('person_type', filters.person_type);
      if (filters?.direction) query = query.eq('direction', filters.direction);
      if (filters?.is_flagged !== undefined) query = query.eq('is_flagged', filters.is_flagged);
      if (filters?.date_from) query = query.gte('timestamp', `${filters.date_from}T00:00:00`);
      if (filters?.date_to) query = query.lte('timestamp', `${filters.date_to}T23:59:59`);

      const from = (page - 1) * pageSize;
      query = query.order('timestamp', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/access-log', 'Failed to fetch access logs', error);
        throw error;
      }
      return { data: data as HostelAccessLog[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/access-log', 'Unexpected error in getAccessLogs', error);
      throw error;
    }
  }

  // ── Single access log entry ───────────────────────────────────────
  static async getAccessLog(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_access_log')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/access-log', 'Failed to fetch access log entry', error);
        throw error;
      }
      return data as HostelAccessLog;
    } catch (error) {
      logger.error('campus-living/access-log', 'Unexpected error in getAccessLog', error);
      throw error;
    }
  }

  // ── Create access log entry ───────────────────────────────────────
  static async createEntry(payload: Omit<HostelAccessLog, 'id' | 'created_at'>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_access_log')
        .insert({
          ...payload,
          timestamp: payload.timestamp || new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error('campus-living/access-log', 'Failed to create access log entry', error);
        throw error;
      }
      return data as HostelAccessLog;
    } catch (error) {
      logger.error('campus-living/access-log', 'Unexpected error in createEntry', error);
      throw error;
    }
  }

  // ── Bulk create entries (batch from device) ───────────────────────
  static async bulkCreateEntries(entries: Omit<HostelAccessLog, 'id' | 'created_at'>[]) {
    try {
      const supabase = createClientSupabaseClient();
      const enriched = entries.map((e) => ({
        ...e,
        timestamp: e.timestamp || new Date().toISOString(),
      }));

      const { data, error } = await supabase
        .from('hostel_access_log')
        .insert(enriched)
        .select();

      if (error) {
        logger.error('campus-living/access-log', 'Failed to bulk create entries', error);
        throw error;
      }
      return data as HostelAccessLog[];
    } catch (error) {
      logger.error('campus-living/access-log', 'Unexpected error in bulkCreateEntries', error);
      throw error;
    }
  }

  // ── Update access log entry ───────────────────────────────────────
  static async updateEntry(id: string, payload: Partial<HostelAccessLog>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_access_log')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/access-log', 'Failed to update access log entry', error);
        throw error;
      }
      return data as HostelAccessLog;
    } catch (error) {
      logger.error('campus-living/access-log', 'Unexpected error in updateEntry', error);
      throw error;
    }
  }

  // ── Delete access log entry ───────────────────────────────────────
  static async deleteEntry(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_access_log')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/access-log', 'Failed to delete access log entry', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/access-log', 'Unexpected error in deleteEntry', error);
      throw error;
    }
  }

  // ── Flag an entry ─────────────────────────────────────────────────
  static async flagEntry(id: string, reason: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_access_log')
        .update({ is_flagged: true, flag_reason: reason })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/access-log', 'Failed to flag entry', error);
        throw error;
      }
      return data as HostelAccessLog;
    } catch (error) {
      logger.error('campus-living/access-log', 'Unexpected error in flagEntry', error);
      throw error;
    }
  }

  // ── Unflag an entry ───────────────────────────────────────────────
  static async unflagEntry(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_access_log')
        .update({ is_flagged: false, flag_reason: null })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/access-log', 'Failed to unflag entry', error);
        throw error;
      }
      return data as HostelAccessLog;
    } catch (error) {
      logger.error('campus-living/access-log', 'Unexpected error in unflagEntry', error);
      throw error;
    }
  }

  // ── Flagged entries ───────────────────────────────────────────────
  static async getFlaggedEntries(institutionId: string, page = 1, pageSize = 50) {
    try {
      const supabase = createClientSupabaseClient();
      const from = (page - 1) * pageSize;

      const { data, error, count } = await supabase
        .from('hostel_access_log')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId)
        .eq('is_flagged', true)
        .order('timestamp', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        logger.error('campus-living/access-log', 'Failed to fetch flagged entries', error);
        throw error;
      }
      return { data: data as HostelAccessLog[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/access-log', 'Unexpected error in getFlaggedEntries', error);
      throw error;
    }
  }

  // ── Access log for a person ───────────────────────────────────────
  static async getPersonAccessLog(
    personId: string,
    dateFrom?: string,
    dateTo?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_access_log')
        .select('*')
        .eq('person_id', personId);

      if (dateFrom) query = query.gte('timestamp', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('timestamp', `${dateTo}T23:59:59`);
      query = query.order('timestamp', { ascending: false });

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/access-log', 'Failed to fetch person access log', error);
        throw error;
      }
      return data as HostelAccessLog[];
    } catch (error) {
      logger.error('campus-living/access-log', 'Unexpected error in getPersonAccessLog', error);
      throw error;
    }
  }

  // ── Daily access summary ──────────────────────────────────────────
  static async getDailyAccessSummary(institutionId: string, date: string, blockId?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_access_log')
        .select('direction, person_type, method, is_flagged')
        .eq('institution_id', institutionId)
        .gte('timestamp', `${date}T00:00:00`)
        .lte('timestamp', `${date}T23:59:59`);

      if (blockId) query = query.eq('block_id', blockId);

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/access-log', 'Failed to fetch daily access summary', error);
        throw error;
      }

      const logs = data ?? [];
      return {
        date,
        total_entries: logs.filter((l) => l.direction === 'entry').length,
        total_exits: logs.filter((l) => l.direction === 'exit').length,
        flagged: logs.filter((l) => l.is_flagged).length,
        by_person_type: logs.reduce((acc, l) => {
          acc[l.person_type] = (acc[l.person_type] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        by_method: logs.reduce((acc, l) => {
          acc[l.method] = (acc[l.method] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };
    } catch (error) {
      logger.error('campus-living/access-log', 'Unexpected error in getDailyAccessSummary', error);
      throw error;
    }
  }
}
