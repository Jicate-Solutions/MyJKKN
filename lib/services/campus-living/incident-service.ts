import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelIncident,
  CreateHostelIncidentDTO,
  HostelIncidentParty,
  IncidentFilters,
  IncidentStatus,
  DisciplinaryAction,
} from '@/types/campus-living';

export class IncidentService {
  // ── List incidents with filters ───────────────────────────────────
  static async getIncidents(
    institutionId: string,
    filters?: IncidentFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_incidents')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.incident_type) query = query.eq('incident_type', filters.incident_type);
      if (filters?.severity) query = query.eq('severity', filters.severity);
      if (filters?.status) query = query.eq('status', filters.status);

      const from = (page - 1) * pageSize;
      query = query.order('incident_date', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/incidents', 'Failed to fetch incidents', error);
        throw error;
      }
      return { data: data as HostelIncident[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/incidents', 'Unexpected error in getIncidents', error);
      throw error;
    }
  }

  // ── Single incident with parties ──────────────────────────────────
  static async getIncident(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_incidents')
        .select('*, hostel_incident_parties(*), hostel_blocks(name, code)')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/incidents', 'Failed to fetch incident', error);
        throw error;
      }
      return data as HostelIncident & { hostel_incident_parties: HostelIncidentParty[]; hostel_blocks: unknown };
    } catch (error) {
      logger.error('campus-living/incidents', 'Unexpected error in getIncident', error);
      throw error;
    }
  }

  // ── Create incident ───────────────────────────────────────────────
  static async createIncident(payload: CreateHostelIncidentDTO) {
    try {
      const supabase = createClientSupabaseClient();

      // Generate incident number
      const incidentNumber = `INC-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const { data, error } = await supabase
        .from('hostel_incidents')
        .insert({
          ...payload,
          incident_number: incidentNumber,
          status: payload.status || 'reported',
        })
        .select()
        .single();

      if (error) {
        logger.error('campus-living/incidents', 'Failed to create incident', error);
        throw error;
      }
      return data as HostelIncident;
    } catch (error) {
      logger.error('campus-living/incidents', 'Unexpected error in createIncident', error);
      throw error;
    }
  }

  // ── Create anonymous report ───────────────────────────────────────
  static async createAnonymousReport(
    institutionId: string,
    blockId: string,
    incidentType: string,
    severity: string,
    title: string,
    description: string,
    location: string,
    incidentDate: string
  ) {
    try {
      const supabase = createClientSupabaseClient();

      const incidentNumber = `ANON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const { data, error } = await supabase
        .from('hostel_incidents')
        .insert({
          institution_id: institutionId,
          block_id: blockId,
          incident_number: incidentNumber,
          incident_type: incidentType,
          severity,
          title,
          description,
          location,
          incident_date: incidentDate,
          reported_by: 'anonymous',
          reported_at: new Date().toISOString(),
          police_complaint_filed: false,
          parent_notified: false,
          status: 'reported',
        } as any)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/incidents', 'Failed to create anonymous report', error);
        throw error;
      }
      return data as HostelIncident;
    } catch (error) {
      logger.error('campus-living/incidents', 'Unexpected error in createAnonymousReport', error);
      throw error;
    }
  }

  // ── Update incident ───────────────────────────────────────────────
  static async updateIncident(id: string, payload: Partial<HostelIncident>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_incidents')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/incidents', 'Failed to update incident', error);
        throw error;
      }
      return data as HostelIncident;
    } catch (error) {
      logger.error('campus-living/incidents', 'Unexpected error in updateIncident', error);
      throw error;
    }
  }

  // ── Delete incident ───────────────────────────────────────────────
  static async deleteIncident(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_incidents')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/incidents', 'Failed to delete incident', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/incidents', 'Unexpected error in deleteIncident', error);
      throw error;
    }
  }

  // ── Add investigation notes ───────────────────────────────────────
  static async addInvestigationNotes(id: string, notes: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_incidents')
        .update({
          investigation_notes: notes,
          status: 'under_investigation' as IncidentStatus,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/incidents', 'Failed to add investigation notes', error);
        throw error;
      }
      return data as HostelIncident;
    } catch (error) {
      logger.error('campus-living/incidents', 'Unexpected error in addInvestigationNotes', error);
      throw error;
    }
  }

  // ── Take action ───────────────────────────────────────────────────
  static async takeAction(
    id: string,
    actionTaken: string,
    disciplinaryAction?: DisciplinaryAction
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const payload: Record<string, unknown> = {
        action_taken: actionTaken,
        status: 'action_taken' as IncidentStatus,
      };
      if (disciplinaryAction) payload.disciplinary_action = disciplinaryAction;

      const { data, error } = await supabase
        .from('hostel_incidents')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/incidents', 'Failed to take action', error);
        throw error;
      }
      return data as HostelIncident;
    } catch (error) {
      logger.error('campus-living/incidents', 'Unexpected error in takeAction', error);
      throw error;
    }
  }

  // ── Close incident ────────────────────────────────────────────────
  static async closeIncident(id: string, closedBy: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_incidents')
        .update({
          status: 'closed' as IncidentStatus,
          closed_by: closedBy,
          closed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/incidents', 'Failed to close incident', error);
        throw error;
      }
      return data as HostelIncident;
    } catch (error) {
      logger.error('campus-living/incidents', 'Unexpected error in closeIncident', error);
      throw error;
    }
  }

  // ── Reopen incident ───────────────────────────────────────────────
  static async reopenIncident(id: string) {
    try {
      return await this.updateIncident(id, { status: 'reopened' as IncidentStatus });
    } catch (error) {
      logger.error('campus-living/incidents', 'Unexpected error in reopenIncident', error);
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // Incident Parties
  // ══════════════════════════════════════════════════════════════════

  // ── Add party to incident ─────────────────────────────────────────
  static async addParty(payload: Omit<HostelIncidentParty, 'id' | 'created_at'>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_incident_parties')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/incidents', 'Failed to add incident party', error);
        throw error;
      }
      return data as HostelIncidentParty;
    } catch (error) {
      logger.error('campus-living/incidents', 'Unexpected error in addParty', error);
      throw error;
    }
  }

  // ── Get parties for an incident ───────────────────────────────────
  static async getParties(incidentId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_incident_parties')
        .select('*')
        .eq('incident_id', incidentId)
        .order('party_type');

      if (error) {
        logger.error('campus-living/incidents', 'Failed to fetch incident parties', error);
        throw error;
      }
      return data as HostelIncidentParty[];
    } catch (error) {
      logger.error('campus-living/incidents', 'Unexpected error in getParties', error);
      throw error;
    }
  }

  // ── Update party statement ────────────────────────────────────────
  static async updatePartyStatement(partyId: string, statement: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_incident_parties')
        .update({ statement })
        .eq('id', partyId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/incidents', 'Failed to update party statement', error);
        throw error;
      }
      return data as HostelIncidentParty;
    } catch (error) {
      logger.error('campus-living/incidents', 'Unexpected error in updatePartyStatement', error);
      throw error;
    }
  }

  // ── Remove party from incident ────────────────────────────────────
  static async removeParty(partyId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_incident_parties')
        .delete()
        .eq('id', partyId);

      if (error) {
        logger.error('campus-living/incidents', 'Failed to remove party', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/incidents', 'Unexpected error in removeParty', error);
      throw error;
    }
  }

  // ── Notify parents ────────────────────────────────────────────────
  static async markParentsNotified(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_incidents')
        .update({
          parent_notified: true,
          parent_notified_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/incidents', 'Failed to mark parents notified', error);
        throw error;
      }
      return data as HostelIncident;
    } catch (error) {
      logger.error('campus-living/incidents', 'Unexpected error in markParentsNotified', error);
      throw error;
    }
  }
}
