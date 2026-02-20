// lib/services/solutions/prospects-service.ts
// CRUD operations for sh_prospects and sh_prospect_activities tables

import { BaseService, type BaseListResponse } from '../base-service';
import { sanitizeSearch } from '@/lib/config/pagination';
import type {
  Prospect,
  ProspectActivity,
  CreateProspectInput,
  CreateProspectActivityInput,
  ProspectStats,
  PipelineStage,
  SourceType,
  SolutionType,
} from './types';

// ============================================
// TYPES
// ============================================

export interface ProspectFilters {
  page?: number;
  limit?: number;
  search?: string;
  pipeline_stage?: PipelineStage;
  assigned_to?: string;
  source_type?: SourceType;
  solution_type_interest?: SolutionType;
  is_active?: boolean;
  overdue_only?: boolean;
}

export interface UpdateProspectInput {
  company_name?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  source_type?: SourceType;
  source_detail?: string;
  pipeline_stage?: PipelineStage;
  expected_deal_size?: number;
  expected_close_date?: string;
  solution_type_interest?: SolutionType;
  assigned_to?: string;
  next_action?: string;
  next_action_date?: string;
  notes?: string;
  tags?: string[];
  lost_reason?: string;
}

// ============================================
// CONSTANTS
// ============================================

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  lead: 'Lead',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
  dormant: 'Dormant',
};

export const PIPELINE_STAGE_COLORS: Record<PipelineStage, { bg: string; border: string; text: string }> = {
  lead: { bg: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-700' },
  qualified: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  proposal: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  negotiation: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  won: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  lost: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
  dormant: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-500' },
};

// Active pipeline stages (for board columns)
export const ACTIVE_STAGES: PipelineStage[] = ['lead', 'qualified', 'proposal', 'negotiation', 'won'];

// ============================================
// SERVICE CLASS
// ============================================

export class ProspectsService extends BaseService {

  /**
   * Generate prospect code: JKKN-PRO-YYYY-NNN
   */
  static async generateProspectCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `JKKN-PRO-${year}-`;
    const { data } = await this.supabase
      .from('sh_prospects')
      .select('prospect_code')
      .like('prospect_code', `${prefix}%`)
      .order('prospect_code', { ascending: false })
      .limit(1);
    const lastNum = data?.[0]?.prospect_code
      ? parseInt(data[0].prospect_code.replace(prefix, ''), 10)
      : 0;
    return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
  }

  /**
   * Get all prospects with optional filters and pagination
   */
  static async getProspects(filters?: ProspectFilters): Promise<BaseListResponse<Prospect>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase.from('sh_prospects')
      .select(`
        *,
        assigned_user:profiles!assigned_to(id, full_name, avatar_url),
        converted_client:sh_clients!converted_client_id(id, name)
      `, { count: 'exact' })
      .order('updated_at', { ascending: false });

    if (filters?.pipeline_stage) {
      query = query.eq('pipeline_stage', filters.pipeline_stage);
    }
    if (filters?.assigned_to) {
      query = query.eq('assigned_to', filters.assigned_to);
    }
    if (filters?.source_type) {
      query = query.eq('source_type', filters.source_type);
    }
    if (filters?.solution_type_interest) {
      query = query.eq('solution_type_interest', filters.solution_type_interest);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters?.overdue_only) {
      query = query.lt('next_action_date', new Date().toISOString().split('T')[0]);
    }
    if (filters?.search) {
      const escaped = sanitizeSearch(filters.search);
      query = query.or(
        `company_name.ilike.%${escaped}%,contact_person.ilike.%${escaped}%,contact_email.ilike.%${escaped}%,prospect_code.ilike.%${escaped}%`
      );
    }

    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch prospects: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as Prospect[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single prospect by ID
   */
  static async getProspectById(id: string): Promise<Prospect | null> {
    const { data, error } = await this.supabase.from('sh_prospects')
      .select(`
        *,
        assigned_user:profiles!assigned_to(id, full_name, avatar_url),
        converted_client:sh_clients!converted_client_id(id, name)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch prospect: ${error.message}`);
    }
    return data as Prospect;
  }

  /**
   * Create a new prospect
   */
  static async createProspect(input: CreateProspectInput): Promise<Prospect> {
    const prospectCode = await this.generateProspectCode();

    const { data, error } = await this.supabase.from('sh_prospects')
      .insert({
        prospect_code: prospectCode,
        company_name: input.company_name,
        contact_person: input.contact_person,
        contact_email: input.contact_email,
        contact_phone: input.contact_phone,
        source_type: input.source_type || 'direct',
        source_detail: input.source_detail,
        pipeline_stage: input.pipeline_stage || 'lead',
        expected_deal_size: input.expected_deal_size,
        expected_close_date: input.expected_close_date,
        solution_type_interest: input.solution_type_interest,
        assigned_to: input.assigned_to,
        next_action: input.next_action,
        next_action_date: input.next_action_date,
        notes: input.notes,
        tags: input.tags,
        is_active: true,
      })
      .select(`
        *,
        assigned_user:profiles!assigned_to(id, full_name, avatar_url),
        converted_client:sh_clients!converted_client_id(id, name)
      `)
      .single();

    if (error) throw new Error(`Failed to create prospect: ${error.message}`);
    return data as Prospect;
  }

  /**
   * Update an existing prospect
   */
  static async updateProspect(id: string, input: UpdateProspectInput): Promise<Prospect> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (input.company_name !== undefined) updateData.company_name = input.company_name;
    if (input.contact_person !== undefined) updateData.contact_person = input.contact_person;
    if (input.contact_email !== undefined) updateData.contact_email = input.contact_email;
    if (input.contact_phone !== undefined) updateData.contact_phone = input.contact_phone;
    if (input.source_type !== undefined) updateData.source_type = input.source_type;
    if (input.source_detail !== undefined) updateData.source_detail = input.source_detail;
    if (input.pipeline_stage !== undefined) updateData.pipeline_stage = input.pipeline_stage;
    if (input.expected_deal_size !== undefined) updateData.expected_deal_size = input.expected_deal_size;
    if (input.expected_close_date !== undefined) updateData.expected_close_date = input.expected_close_date;
    if (input.solution_type_interest !== undefined) updateData.solution_type_interest = input.solution_type_interest;
    if (input.assigned_to !== undefined) updateData.assigned_to = input.assigned_to;
    if (input.next_action !== undefined) updateData.next_action = input.next_action;
    if (input.next_action_date !== undefined) updateData.next_action_date = input.next_action_date;
    if (input.notes !== undefined) updateData.notes = input.notes;
    if (input.tags !== undefined) updateData.tags = input.tags;
    if (input.lost_reason !== undefined) updateData.lost_reason = input.lost_reason;

    const { data, error } = await this.supabase.from('sh_prospects')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        assigned_user:profiles!assigned_to(id, full_name, avatar_url),
        converted_client:sh_clients!converted_client_id(id, name)
      `)
      .single();

    if (error) throw new Error(`Failed to update prospect: ${error.message}`);
    return data as Prospect;
  }

  /**
   * Delete a prospect
   */
  static async deleteProspect(id: string): Promise<void> {
    const { error } = await this.supabase.from('sh_prospects')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`Failed to delete prospect: ${error.message}`);
  }

  /**
   * Update pipeline stage (with optional lost_reason)
   * Note: won→client conversion is handled by DB trigger
   */
  static async updatePipelineStage(id: string, stage: PipelineStage, lostReason?: string): Promise<Prospect> {
    const updateData: Record<string, unknown> = {
      pipeline_stage: stage,
      updated_at: new Date().toISOString(),
    };
    if (stage === 'lost' && lostReason) {
      updateData.lost_reason = lostReason;
    }

    const { data, error } = await this.supabase.from('sh_prospects')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        assigned_user:profiles!assigned_to(id, full_name, avatar_url),
        converted_client:sh_clients!converted_client_id(id, name)
      `)
      .single();

    if (error) throw new Error(`Failed to update pipeline stage: ${error.message}`);
    return data as Prospect;
  }

  /**
   * Get prospect activities
   */
  static async getProspectActivities(prospectId: string): Promise<ProspectActivity[]> {
    const { data, error } = await this.supabase.from('sh_prospect_activities')
      .select(`
        *,
        created_by_user:profiles!created_by(id, full_name)
      `)
      .eq('prospect_id', prospectId)
      .order('activity_date', { ascending: false });

    if (error) throw new Error(`Failed to fetch activities: ${error.message}`);
    return (data || []) as ProspectActivity[];
  }

  /**
   * Log a prospect activity
   */
  static async logActivity(input: CreateProspectActivityInput): Promise<ProspectActivity> {
    const { data, error } = await this.supabase.from('sh_prospect_activities')
      .insert({
        prospect_id: input.prospect_id,
        activity_type: input.activity_type || 'other',
        subject: input.subject,
        summary: input.summary,
        activity_date: input.activity_date || new Date().toISOString(),
        next_action: input.next_action,
        next_action_date: input.next_action_date,
      })
      .select(`
        *,
        created_by_user:profiles!created_by(id, full_name)
      `)
      .single();

    if (error) throw new Error(`Failed to log activity: ${error.message}`);
    return data as ProspectActivity;
  }

  /**
   * Get prospect statistics
   */
  static async getProspectStats(): Promise<ProspectStats> {
    const { data: prospects, error } = await this.supabase.from('sh_prospects')
      .select('pipeline_stage, expected_deal_size, next_action_date, created_at, updated_at, is_active')
      .eq('is_active', true);

    if (error) throw new Error(`Failed to fetch prospect stats: ${error.message}`);

    const allProspects = prospects || [];
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const byStage: Record<PipelineStage, number> = {
      lead: 0, qualified: 0, proposal: 0, negotiation: 0, won: 0, lost: 0, dormant: 0,
    };

    let totalPipelineValue = 0;
    let overdueFollowUps = 0;
    let wonThisMonth = 0;
    let lostThisMonth = 0;
    let totalDays = 0;
    let countForAvg = 0;

    for (const p of allProspects) {
      const stage = p.pipeline_stage as PipelineStage;
      byStage[stage] = (byStage[stage] || 0) + 1;

      if (p.expected_deal_size && !['won', 'lost', 'dormant'].includes(stage)) {
        totalPipelineValue += Number(p.expected_deal_size);
      }

      if (p.next_action_date && new Date(p.next_action_date) < now && !['won', 'lost', 'dormant'].includes(stage)) {
        overdueFollowUps++;
      }

      if (stage === 'won' && p.updated_at >= startOfMonth) wonThisMonth++;
      if (stage === 'lost' && p.updated_at >= startOfMonth) lostThisMonth++;

      if (['won', 'lost'].includes(stage) && p.created_at) {
        const days = Math.floor((new Date(p.updated_at || p.created_at).getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24));
        totalDays += days;
        countForAvg++;
      }
    }

    return {
      total: allProspects.filter(p => !['won', 'lost', 'dormant'].includes(p.pipeline_stage)).length,
      byStage,
      totalPipelineValue,
      overdueFollowUps,
      wonThisMonth,
      lostThisMonth,
      avgDaysInPipeline: countForAvg > 0 ? Math.round(totalDays / countForAvg) : 0,
    };
  }

  /**
   * Get pipeline board data grouped by stage
   */
  static async getPipelineBoard(): Promise<Record<PipelineStage, Prospect[]>> {
    const { data, error } = await this.supabase.from('sh_prospects')
      .select(`
        *,
        assigned_user:profiles!assigned_to(id, full_name, avatar_url),
        converted_client:sh_clients!converted_client_id(id, name)
      `)
      .eq('is_active', true)
      .order('next_action_date', { ascending: true, nullsFirst: false });

    if (error) throw new Error(`Failed to fetch pipeline board: ${error.message}`);

    const board: Record<PipelineStage, Prospect[]> = {
      lead: [], qualified: [], proposal: [], negotiation: [], won: [], lost: [], dormant: [],
    };

    for (const prospect of (data || []) as Prospect[]) {
      const stage = prospect.pipeline_stage;
      if (board[stage]) {
        board[stage].push(prospect);
      }
    }

    return board;
  }
}

// Singleton export
export const prospectsService = {
  generateProspectCode: ProspectsService.generateProspectCode.bind(ProspectsService),
  getProspects: ProspectsService.getProspects.bind(ProspectsService),
  getProspectById: ProspectsService.getProspectById.bind(ProspectsService),
  createProspect: ProspectsService.createProspect.bind(ProspectsService),
  updateProspect: ProspectsService.updateProspect.bind(ProspectsService),
  deleteProspect: ProspectsService.deleteProspect.bind(ProspectsService),
  updatePipelineStage: ProspectsService.updatePipelineStage.bind(ProspectsService),
  getProspectActivities: ProspectsService.getProspectActivities.bind(ProspectsService),
  logActivity: ProspectsService.logActivity.bind(ProspectsService),
  getProspectStats: ProspectsService.getProspectStats.bind(ProspectsService),
  getPipelineBoard: ProspectsService.getPipelineBoard.bind(ProspectsService),
};
