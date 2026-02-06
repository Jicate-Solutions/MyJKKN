// lib/services/solutions/discovery-service.ts
// CRUD operations for sh_discovery_visits, sh_client_communications

import { BaseService, type BaseListResponse } from '../base-service';
import type {
  DiscoveryVisit,
  ClientCommunication,
  CommunicationType,
  CommunicationDirection,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export interface DiscoveryVisitFilters extends PaginationParams {
  [key: string]: unknown;
  client_id?: string;
  solution_id?: string;
  department_id?: string;
  date_from?: string;
  date_to?: string;
}

export interface CommunicationFilters extends PaginationParams {
  [key: string]: unknown;
  client_id?: string;
  solution_id?: string;
  phase_id?: string;
  communication_type?: CommunicationType;
  direction?: CommunicationDirection;
  date_from?: string;
  date_to?: string;
}

export interface CreateDiscoveryVisitInput {
  client_id: string;
  solution_id?: string;
  department_id: string;
  visit_date: string;
  visitors?: Array<{ name: string; role?: string }>;
  observations: string;
  pain_points?: string;
  photos_urls?: string[];
  follow_up_notes?: string;
  follow_up_required?: boolean;
  created_by: string;
}

export interface UpdateDiscoveryVisitInput {
  solution_id?: string;
  visit_date?: string;
  visitors?: Array<{ name: string; role?: string }>;
  observations?: string;
  pain_points?: string;
  photos_urls?: string[];
  follow_up_notes?: string;
  follow_up_required?: boolean;
}

export interface CreateCommunicationInput {
  client_id: string;
  solution_id?: string;
  phase_id?: string;
  communication_type: CommunicationType;
  direction?: CommunicationDirection;
  subject?: string;
  summary: string;
  participants?: Array<{ name: string; role?: string }>;
  attachments_urls?: string[];
  communication_date?: string;
  recorded_by?: string;
}

export interface UpdateCommunicationInput {
  solution_id?: string;
  phase_id?: string;
  communication_type?: CommunicationType;
  direction?: CommunicationDirection;
  subject?: string;
  summary?: string;
  participants?: Array<{ name: string; role?: string }>;
  attachments_urls?: string[];
  communication_date?: string;
}

// ============================================
// CONSTANTS
// ============================================

export const COMMUNICATION_TYPE_LABELS: Record<CommunicationType, string> = {
  call: 'Phone Call',
  email: 'Email',
  whatsapp: 'WhatsApp',
  meeting: 'Meeting',
  note: 'Note',
};

export const COMMUNICATION_DIRECTION_LABELS: Record<CommunicationDirection, string> = {
  inbound: 'Inbound',
  outbound: 'Outbound',
};

// ============================================
// SERVICE CLASS
// ============================================

export class DiscoveryService extends BaseService {
  // ============================================
  // DISCOVERY VISIT OPERATIONS
  // ============================================

  /**
   * Get all discovery visits with optional filters
   */
  static async getDiscoveryVisits(
    filters?: DiscoveryVisitFilters
  ): Promise<BaseListResponse<DiscoveryVisit>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = (this.supabase as any).from('sh_discovery_visits')
      .select('*', { count: 'exact' })
      .order('visit_date', { ascending: false });

    // Apply filters
    if (filters?.client_id) {
      query = query.eq('client_id', filters.client_id);
    }

    if (filters?.solution_id) {
      query = query.eq('solution_id', filters.solution_id);
    }

    if (filters?.department_id) {
      query = query.eq('department_id', filters.department_id);
    }

    if (filters?.date_from) {
      query = query.gte('visit_date', filters.date_from);
    }

    if (filters?.date_to) {
      query = query.lte('visit_date', filters.date_to);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch discovery visits: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as DiscoveryVisit[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single discovery visit by ID
   */
  static async getDiscoveryVisitById(id: string): Promise<DiscoveryVisit | null> {
    const { data, error } = await (this.supabase as any).from('sh_discovery_visits')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch discovery visit: ${error.message}`);
    }

    return data as DiscoveryVisit;
  }

  /**
   * Get discovery visits for a specific client
   */
  static async getClientDiscoveryVisits(clientId: string): Promise<DiscoveryVisit[]> {
    const result = await this.getDiscoveryVisits({ client_id: clientId });
    return result.data;
  }

  /**
   * Create a new discovery visit
   */
  static async createDiscoveryVisit(input: CreateDiscoveryVisitInput): Promise<DiscoveryVisit> {
    const { data, error } = await (this.supabase as any).from('sh_discovery_visits')
      .insert({
        client_id: input.client_id,
        solution_id: input.solution_id || null,
        department_id: input.department_id,
        visit_date: input.visit_date,
        visitors: input.visitors || [],
        observations: input.observations,
        pain_points: input.pain_points || null,
        photos_urls: input.photos_urls || [],
        follow_up_notes: input.follow_up_notes || null,
        follow_up_required: input.follow_up_required || false,
        created_by: input.created_by,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create discovery visit: ${error.message}`);
    return data as DiscoveryVisit;
  }

  /**
   * Update a discovery visit
   */
  static async updateDiscoveryVisit(
    id: string,
    input: UpdateDiscoveryVisitInput
  ): Promise<DiscoveryVisit> {
    const { data, error } = await (this.supabase as any).from('sh_discovery_visits')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update discovery visit: ${error.message}`);
    return data as DiscoveryVisit;
  }

  /**
   * Delete a discovery visit
   */
  static async deleteDiscoveryVisit(id: string): Promise<void> {
    const { error } = await (this.supabase as any).from('sh_discovery_visits').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete discovery visit: ${error.message}`);
  }

  /**
   * Link a discovery visit to a solution/phase
   */
  static async linkVisitToResult(
    visitId: string,
    solutionId: string
  ): Promise<DiscoveryVisit> {
    return this.updateDiscoveryVisit(visitId, {
      solution_id: solutionId,
    });
  }

  /**
   * Get recent discovery visits (for dashboard)
   */
  static async getRecentDiscoveryVisits(limit: number = 5): Promise<DiscoveryVisit[]> {
    const { data, error } = await (this.supabase as any).from('sh_discovery_visits')
      .select(`
        *,
        client:sh_clients(id, name),
        department:sh_departments(id, name)
      `)
      .order('visit_date', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to fetch recent discovery visits: ${error.message}`);
    return (data || []) as DiscoveryVisit[];
  }

  /**
   * Get discovery visit statistics (for dashboard)
   */
  static async getDiscoveryVisitStats(): Promise<{
    total: number;
    thisMonth: number;
    thisWeek: number;
    pendingFollowUp: number;
    byDepartment: Record<string, number>;
    conversionRate: number;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();

    // Get all visits
    const { data: visits, error } = await (this.supabase as any).from('sh_discovery_visits')
      .select('id, visit_date, department_id, solution_id, follow_up_required, follow_up_notes');

    if (error) throw new Error(`Failed to fetch visit stats: ${error.message}`);

    const allVisits = visits || [];
    const total = allVisits.length;
    const thisMonth = allVisits.filter((v: any) => v.visit_date >= startOfMonth).length;
    const thisWeek = allVisits.filter((v: any) => v.visit_date >= startOfWeek).length;
    const pendingFollowUp = allVisits.filter((v: any) => v.follow_up_required && !v.solution_id).length;
    const converted = allVisits.filter((v: any) => v.solution_id).length;

    // Count by department
    const byDepartment: Record<string, number> = {};
    allVisits.forEach((v: any) => {
      if (v.department_id) {
        byDepartment[v.department_id] = (byDepartment[v.department_id] || 0) + 1;
      }
    });

    return {
      total,
      thisMonth,
      thisWeek,
      pendingFollowUp,
      byDepartment,
      conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
    };
  }

  // ============================================
  // COMMUNICATION OPERATIONS
  // ============================================

  /**
   * Get all communications with optional filters
   */
  static async getCommunications(
    filters?: CommunicationFilters
  ): Promise<BaseListResponse<ClientCommunication>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = (this.supabase as any).from('sh_client_communications')
      .select('*', { count: 'exact' })
      .order('communication_date', { ascending: false });

    // Apply filters
    if (filters?.client_id) {
      query = query.eq('client_id', filters.client_id);
    }

    if (filters?.solution_id) {
      query = query.eq('solution_id', filters.solution_id);
    }

    if (filters?.phase_id) {
      query = query.eq('phase_id', filters.phase_id);
    }

    if (filters?.communication_type) {
      query = query.eq('communication_type', filters.communication_type);
    }

    if (filters?.direction) {
      query = query.eq('direction', filters.direction);
    }

    if (filters?.date_from) {
      query = query.gte('communication_date', filters.date_from);
    }

    if (filters?.date_to) {
      query = query.lte('communication_date', filters.date_to);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch communications: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as ClientCommunication[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single communication by ID
   */
  static async getCommunicationById(id: string): Promise<ClientCommunication | null> {
    const { data, error } = await (this.supabase as any).from('sh_client_communications')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch communication: ${error.message}`);
    }

    return data as ClientCommunication;
  }

  /**
   * Get communications for a specific client
   */
  static async getClientCommunications(clientId: string): Promise<ClientCommunication[]> {
    const result = await this.getCommunications({ client_id: clientId });
    return result.data;
  }

  /**
   * Get communications for a specific solution
   */
  static async getSolutionCommunications(solutionId: string): Promise<ClientCommunication[]> {
    const result = await this.getCommunications({ solution_id: solutionId });
    return result.data;
  }

  /**
   * Create a new communication record
   */
  static async createCommunication(input: CreateCommunicationInput): Promise<ClientCommunication> {
    const { data, error } = await (this.supabase as any).from('sh_client_communications')
      .insert({
        client_id: input.client_id,
        solution_id: input.solution_id || null,
        phase_id: input.phase_id || null,
        communication_type: input.communication_type,
        source: 'manual',
        direction: input.direction || 'outbound',
        subject: input.subject || null,
        summary: input.summary,
        content: input.summary,
        participants: input.participants || [],
        attachments: input.attachments_urls || [],
        communication_date: input.communication_date || new Date().toISOString(),
        created_by: input.recorded_by || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create communication: ${error.message}`);
    return data as ClientCommunication;
  }

  /**
   * Update a communication
   */
  static async updateCommunication(
    id: string,
    input: UpdateCommunicationInput
  ): Promise<ClientCommunication> {
    const { data, error } = await (this.supabase as any).from('sh_client_communications')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update communication: ${error.message}`);
    return data as ClientCommunication;
  }

  /**
   * Delete a communication
   */
  static async deleteCommunication(id: string): Promise<void> {
    const { error } = await (this.supabase as any).from('sh_client_communications').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete communication: ${error.message}`);
  }

  /**
   * Get communication type display label
   */
  static getCommunicationTypeLabel(type: CommunicationType): string {
    return COMMUNICATION_TYPE_LABELS[type] || type;
  }

  /**
   * Get communication direction display label
   */
  static getCommunicationDirectionLabel(direction: CommunicationDirection): string {
    return COMMUNICATION_DIRECTION_LABELS[direction] || direction;
  }
}

// Export singleton instance methods
export const discoveryService = {
  getDiscoveryVisits: DiscoveryService.getDiscoveryVisits.bind(DiscoveryService),
  getDiscoveryVisitById: DiscoveryService.getDiscoveryVisitById.bind(DiscoveryService),
  getClientDiscoveryVisits: DiscoveryService.getClientDiscoveryVisits.bind(DiscoveryService),
  createDiscoveryVisit: DiscoveryService.createDiscoveryVisit.bind(DiscoveryService),
  updateDiscoveryVisit: DiscoveryService.updateDiscoveryVisit.bind(DiscoveryService),
  deleteDiscoveryVisit: DiscoveryService.deleteDiscoveryVisit.bind(DiscoveryService),
  linkVisitToResult: DiscoveryService.linkVisitToResult.bind(DiscoveryService),
  getRecentDiscoveryVisits: DiscoveryService.getRecentDiscoveryVisits.bind(DiscoveryService),
  getDiscoveryVisitStats: DiscoveryService.getDiscoveryVisitStats.bind(DiscoveryService),
  getCommunications: DiscoveryService.getCommunications.bind(DiscoveryService),
  getCommunicationById: DiscoveryService.getCommunicationById.bind(DiscoveryService),
  getClientCommunications: DiscoveryService.getClientCommunications.bind(DiscoveryService),
  getSolutionCommunications: DiscoveryService.getSolutionCommunications.bind(DiscoveryService),
  createCommunication: DiscoveryService.createCommunication.bind(DiscoveryService),
  updateCommunication: DiscoveryService.updateCommunication.bind(DiscoveryService),
  deleteCommunication: DiscoveryService.deleteCommunication.bind(DiscoveryService),
  getCommunicationTypeLabel: DiscoveryService.getCommunicationTypeLabel.bind(DiscoveryService),
  getCommunicationDirectionLabel: DiscoveryService.getCommunicationDirectionLabel.bind(DiscoveryService),
  COMMUNICATION_TYPE_LABELS,
  COMMUNICATION_DIRECTION_LABELS,
};
