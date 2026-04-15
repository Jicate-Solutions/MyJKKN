import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelMaintenanceRequest,
  CreateHostelMaintenanceRequestDTO,
  HostelMaintenanceSlaConfig,
  MaintenanceFilters,
  MaintenanceStatus,
  MaintenancePriority,
  SlaStatus,
} from '@/types/campus-living';

export class MaintenanceService {
  // ── List maintenance requests with filters ────────────────────────
  static async getRequests(
    institutionId: string,
    filters?: MaintenanceFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_maintenance_requests')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.category) query = query.eq('category', filters.category);
      if (filters?.priority) query = query.eq('priority', filters.priority);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.sla_status) query = query.eq('sla_status', filters.sla_status);

      const from = (page - 1) * pageSize;
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/maintenance', 'Failed to fetch requests', error);
        throw error;
      }
      return { data: data as HostelMaintenanceRequest[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/maintenance', 'Unexpected error in getRequests', error);
      throw error;
    }
  }

  // ── Single request ────────────────────────────────────────────────
  static async getRequest(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_maintenance_requests')
        .select('*, hostel_blocks(name, code), hostel_rooms(room_number)')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/maintenance', 'Failed to fetch request', error);
        throw error;
      }
      return data as HostelMaintenanceRequest & Record<string, unknown>;
    } catch (error) {
      logger.error('campus-living/maintenance', 'Unexpected error in getRequest', error);
      throw error;
    }
  }

  // ── Create request with SLA engine ────────────────────────────────
  static async createRequest(payload: CreateHostelMaintenanceRequestDTO) {
    try {
      const supabase = createClientSupabaseClient();

      // Look up SLA config to auto-set deadline
      const { data: slaConfig } = await supabase
        .from('hostel_maintenance_sla_config')
        .select('sla_hours')
        .eq('institution_id', payload.institution_id)
        .eq('category', payload.category)
        .eq('priority', payload.priority)
        .eq('is_active', true)
        .maybeSingle();

      const slaHours = slaConfig?.sla_hours ?? payload.sla_hours;
      const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();

      // Generate request number
      const requestNumber = `MR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const { data, error } = await supabase
        .from('hostel_maintenance_requests')
        .insert({
          ...payload,
          request_number: requestNumber,
          sla_hours: slaHours,
          sla_deadline: payload.sla_deadline || slaDeadline,
          sla_status: 'on_track' as SlaStatus,
          status: payload.status || 'open',
          escalation_level: 0,
        })
        .select()
        .single();

      if (error) {
        logger.error('campus-living/maintenance', 'Failed to create request', error);
        throw error;
      }
      return data as HostelMaintenanceRequest;
    } catch (error) {
      logger.error('campus-living/maintenance', 'Unexpected error in createRequest', error);
      throw error;
    }
  }

  // ── Update request ────────────────────────────────────────────────
  static async updateRequest(id: string, payload: Partial<HostelMaintenanceRequest>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_maintenance_requests')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/maintenance', 'Failed to update request', error);
        throw error;
      }
      return data as HostelMaintenanceRequest;
    } catch (error) {
      logger.error('campus-living/maintenance', 'Unexpected error in updateRequest', error);
      throw error;
    }
  }

  // ── Delete request ────────────────────────────────────────────────
  static async deleteRequest(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_maintenance_requests')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/maintenance', 'Failed to delete request', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/maintenance', 'Unexpected error in deleteRequest', error);
      throw error;
    }
  }

  // ── Assign to worker ──────────────────────────────────────────────
  static async assign(id: string, assigneeName: string, assigneePhone: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_maintenance_requests')
        .update({
          assigned_to_name: assigneeName,
          assigned_to_phone: assigneePhone,
          assigned_at: new Date().toISOString(),
          status: 'assigned' as MaintenanceStatus,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/maintenance', 'Failed to assign request', error);
        throw error;
      }
      return data as HostelMaintenanceRequest;
    } catch (error) {
      logger.error('campus-living/maintenance', 'Unexpected error in assign', error);
      throw error;
    }
  }

  // ── Mark in progress ──────────────────────────────────────────────
  static async markInProgress(id: string) {
    try {
      return await this.updateRequest(id, { status: 'in_progress' as MaintenanceStatus });
    } catch (error) {
      logger.error('campus-living/maintenance', 'Unexpected error in markInProgress', error);
      throw error;
    }
  }

  // ── Mark resolved with notes ──────────────────────────────────────
  static async resolve(id: string, resolutionNotes: string, actualCost?: number, vendorName?: string) {
    try {
      const supabase = createClientSupabaseClient();
      const payload: Record<string, unknown> = {
        status: 'pending_verification' as MaintenanceStatus,
        resolution_notes: resolutionNotes,
        resolved_at: new Date().toISOString(),
      };
      if (actualCost !== undefined) payload.actual_cost = actualCost;
      if (vendorName) payload.vendor_name = vendorName;

      const { data, error } = await supabase
        .from('hostel_maintenance_requests')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/maintenance', 'Failed to resolve request', error);
        throw error;
      }
      return data as HostelMaintenanceRequest;
    } catch (error) {
      logger.error('campus-living/maintenance', 'Unexpected error in resolve', error);
      throw error;
    }
  }

  // ── Verify resolution with photo ──────────────────────────────────
  static async verify(
    id: string,
    verifiedBy: string,
    satisfaction: number,
    photoUrlsAfter?: string[]
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const payload: Record<string, unknown> = {
        status: 'resolved' as MaintenanceStatus,
        verified_by: verifiedBy,
        verified_at: new Date().toISOString(),
        student_satisfaction: satisfaction,
      };
      if (photoUrlsAfter) payload.photo_urls_after = photoUrlsAfter;

      const { data, error } = await supabase
        .from('hostel_maintenance_requests')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/maintenance', 'Failed to verify request', error);
        throw error;
      }
      return data as HostelMaintenanceRequest;
    } catch (error) {
      logger.error('campus-living/maintenance', 'Unexpected error in verify', error);
      throw error;
    }
  }

  // ── Close request ─────────────────────────────────────────────────
  static async close(id: string) {
    try {
      return await this.updateRequest(id, { status: 'closed' as MaintenanceStatus });
    } catch (error) {
      logger.error('campus-living/maintenance', 'Unexpected error in close', error);
      throw error;
    }
  }

  // ── Reopen request ────────────────────────────────────────────────
  static async reopen(id: string) {
    try {
      return await this.updateRequest(id, { status: 'reopened' as MaintenanceStatus });
    } catch (error) {
      logger.error('campus-living/maintenance', 'Unexpected error in reopen', error);
      throw error;
    }
  }

  // ── Escalation ────────────────────────────────────────────────────
  static async escalate(id: string) {
    try {
      const supabase = createClientSupabaseClient();

      // Fetch current escalation level
      const { data: current, error: fetchError } = await supabase
        .from('hostel_maintenance_requests')
        .select('escalation_level')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from('hostel_maintenance_requests')
        .update({
          escalation_level: (current?.escalation_level ?? 0) + 1,
          sla_status: 'breached' as SlaStatus,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/maintenance', 'Failed to escalate request', error);
        throw error;
      }
      return data as HostelMaintenanceRequest;
    } catch (error) {
      logger.error('campus-living/maintenance', 'Unexpected error in escalate', error);
      throw error;
    }
  }

  // ── SLA breach check (batch) ──────────────────────────────────────
  static async checkSlaBreaches(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const now = new Date().toISOString();

      // Find requests where SLA is breached
      const { data: breached, error: fetchError } = await supabase
        .from('hostel_maintenance_requests')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('sla_status', 'on_track')
        .in('status', ['open', 'assigned', 'in_progress'])
        .lt('sla_deadline', now);

      if (fetchError) {
        logger.error('campus-living/maintenance', 'Failed to check SLA breaches', fetchError);
        throw fetchError;
      }

      // Mark as breached
      if (breached && breached.length > 0) {
        const ids = breached.map((r) => r.id);
        await supabase
          .from('hostel_maintenance_requests')
          .update({ sla_status: 'breached' as SlaStatus })
          .in('id', ids);
      }

      // Find at-risk requests (within 2 hours of deadline)
      const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const { data: atRisk } = await supabase
        .from('hostel_maintenance_requests')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('sla_status', 'on_track')
        .in('status', ['open', 'assigned', 'in_progress'])
        .gt('sla_deadline', now)
        .lt('sla_deadline', twoHoursFromNow);

      if (atRisk && atRisk.length > 0) {
        const ids = atRisk.map((r) => r.id);
        await supabase
          .from('hostel_maintenance_requests')
          .update({ sla_status: 'at_risk' as SlaStatus })
          .in('id', ids);
      }

      return {
        breached: breached as HostelMaintenanceRequest[],
        at_risk: (atRisk ?? []) as HostelMaintenanceRequest[],
      };
    } catch (error) {
      logger.error('campus-living/maintenance', 'Unexpected error in checkSlaBreaches', error);
      throw error;
    }
  }

  // ── Get SLA config ────────────────────────────────────────────────
  static async getSlaConfig(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_maintenance_sla_config')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('category')
        .order('priority');

      if (error) {
        logger.error('campus-living/maintenance', 'Failed to fetch SLA config', error);
        throw error;
      }
      return data as HostelMaintenanceSlaConfig[];
    } catch (error) {
      logger.error('campus-living/maintenance', 'Unexpected error in getSlaConfig', error);
      throw error;
    }
  }
}
