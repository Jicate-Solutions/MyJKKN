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
  PipelineAnalytics,
  PipelineStage,
  SourceType,
  SolutionType,
  SourceConversionAnalytics,
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
  proposal_url?: string;
  proposal_filename?: string;
  reopen_date?: string;
  existing_client_id?: string;
  solution_types_interest?: SolutionType[];
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
        converted_client:sh_clients!converted_client_id(id, name),
        existing_client:sh_clients!existing_client_id(id, name)
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
        converted_client:sh_clients!converted_client_id(id, name),
        existing_client:sh_clients!existing_client_id(id, name)
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
        existing_client_id: input.existing_client_id,
        solution_types_interest: input.solution_types_interest,
        is_active: true,
      })
      .select(`
        *,
        assigned_user:profiles!assigned_to(id, full_name, avatar_url),
        converted_client:sh_clients!converted_client_id(id, name),
        existing_client:sh_clients!existing_client_id(id, name)
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
    if (input.proposal_url !== undefined) updateData.proposal_url = input.proposal_url;
    if (input.proposal_filename !== undefined) updateData.proposal_filename = input.proposal_filename;
    if (input.reopen_date !== undefined) updateData.reopen_date = input.reopen_date;
    if (input.existing_client_id !== undefined) updateData.existing_client_id = input.existing_client_id;
    if (input.solution_types_interest !== undefined) updateData.solution_types_interest = input.solution_types_interest;

    const { data, error } = await this.supabase.from('sh_prospects')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        assigned_user:profiles!assigned_to(id, full_name, avatar_url),
        converted_client:sh_clients!converted_client_id(id, name),
        existing_client:sh_clients!existing_client_id(id, name)
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
  static async updatePipelineStage(id: string, stage: PipelineStage, lostReason?: string, reopenDate?: string): Promise<Prospect> {
    const updateData: Record<string, unknown> = {
      pipeline_stage: stage,
      updated_at: new Date().toISOString(),
    };
    if (stage === 'lost' && lostReason) {
      updateData.lost_reason = lostReason;
    }
    if (reopenDate) {
      updateData.reopen_date = reopenDate;
    }

    const { data, error } = await this.supabase.from('sh_prospects')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        assigned_user:profiles!assigned_to(id, full_name, avatar_url),
        converted_client:sh_clients!converted_client_id(id, name),
        existing_client:sh_clients!existing_client_id(id, name)
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
      .select('pipeline_stage, expected_deal_size, next_action_date, created_at, updated_at, is_active, reopen_date')
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

    // Count prospects ready to re-engage (reopen_date <= today AND dormant/lost)
    const today = new Date().toISOString().split('T')[0];
    let readyToReengage = 0;
    for (const p of allProspects) {
      if (p.reopen_date && p.reopen_date <= today && ['dormant', 'lost'].includes(p.pipeline_stage)) {
        readyToReengage++;
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
      readyToReengage,
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
        converted_client:sh_clients!converted_client_id(id, name),
        existing_client:sh_clients!existing_client_id(id, name)
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

  /**
   * Get pipeline analytics for charts (monthly win rate, source breakdown, funnel, trends)
   */
  static async getPipelineAnalytics(): Promise<PipelineAnalytics> {
    const { data, error } = await this.supabase.from('sh_prospects')
      .select('pipeline_stage, source_type, expected_deal_size, created_at, updated_at, is_active')
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to fetch analytics: ${error.message}`);
    const prospects = data || [];

    // Helper: get month key (e.g. "Jan 2026")
    const getMonthKey = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    };

    // Get last 6 months
    const now = new Date();
    const last6Months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      last6Months.push(d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
    }

    // Monthly win rate + monthly prospect trends
    const monthlyMap: Record<string, { won: number; lost: number; new: number }> = {};
    for (const m of last6Months) {
      monthlyMap[m] = { won: 0, lost: 0, new: 0 };
    }

    for (const p of prospects) {
      const createdMonth = getMonthKey(p.created_at);
      if (monthlyMap[createdMonth]) {
        monthlyMap[createdMonth].new++;
      }

      const stage = p.pipeline_stage as PipelineStage;
      if ((stage === 'won' || stage === 'lost') && p.updated_at) {
        const updatedMonth = getMonthKey(p.updated_at);
        if (monthlyMap[updatedMonth]) {
          if (stage === 'won') monthlyMap[updatedMonth].won++;
          if (stage === 'lost') monthlyMap[updatedMonth].lost++;
        }
      }
    }

    const monthlyWinRate = last6Months.map((month) => {
      const d = monthlyMap[month];
      const total = d.won + d.lost;
      return { month, winRate: total > 0 ? Math.round((d.won / total) * 100) : 0, won: d.won, lost: d.lost };
    });

    const monthlyProspects = last6Months.map((month) => {
      const d = monthlyMap[month];
      return { month, new: d.new, won: d.won, lost: d.lost };
    });

    // Source breakdown
    const sourceMap: Record<string, { count: number; won: number; value: number }> = {};
    for (const p of prospects) {
      const src = p.source_type || 'direct';
      if (!sourceMap[src]) sourceMap[src] = { count: 0, won: 0, value: 0 };
      sourceMap[src].count++;
      if (p.pipeline_stage === 'won') sourceMap[src].won++;
      if (p.expected_deal_size) sourceMap[src].value += Number(p.expected_deal_size);
    }
    const sourceBreakdown = Object.entries(sourceMap).map(([source, d]) => ({
      source: source.charAt(0).toUpperCase() + source.slice(1),
      count: d.count,
      won: d.won,
      value: d.value,
    }));

    // Conversion funnel
    const funnelStages: PipelineStage[] = ['lead', 'qualified', 'proposal', 'negotiation', 'won'];
    const stageCounts: Record<string, number> = {};
    for (const p of prospects) {
      const stage = p.pipeline_stage as PipelineStage;
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    }

    // Funnel: count prospects that reached each stage or beyond
    const stageOrder: PipelineStage[] = ['lead', 'qualified', 'proposal', 'negotiation', 'won'];
    const cumulativeCounts: Record<string, number> = {};
    for (const stage of stageOrder) {
      const stageIdx = stageOrder.indexOf(stage);
      let count = 0;
      for (const p of prospects) {
        const pStage = p.pipeline_stage as PipelineStage;
        const pIdx = stageOrder.indexOf(pStage);
        // Count lost/dormant at their last active stage equivalent
        if (pStage === 'lost' || pStage === 'dormant') {
          // These prospects at least reached lead stage
          if (stage === 'lead') count++;
        } else if (pIdx >= stageIdx) {
          count++;
        }
      }
      cumulativeCounts[stage] = count;
    }

    const totalForFunnel = cumulativeCounts['lead'] || 1;
    const conversionFunnel = funnelStages.map((stage) => ({
      stage: stage.charAt(0).toUpperCase() + stage.slice(1),
      count: cumulativeCounts[stage] || 0,
      percentage: Math.round(((cumulativeCounts[stage] || 0) / totalForFunnel) * 100),
    }));

    // Avg days in pipeline
    let totalDays = 0;
    let countForAvg = 0;
    for (const p of prospects) {
      if (['won', 'lost'].includes(p.pipeline_stage) && p.created_at) {
        const days = Math.floor(
          (new Date(p.updated_at || p.created_at).getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        totalDays += days;
        countForAvg++;
      }
    }

    return {
      monthlyWinRate,
      sourceBreakdown,
      avgDaysInPipeline: countForAvg > 0 ? Math.round(totalDays / countForAvg) : 0,
      conversionFunnel,
      monthlyProspects,
    };
  }

  /**
   * Get prospect that was converted to a specific client
   */
  static async getProspectByClientId(clientId: string): Promise<Prospect | null> {
    const { data, error } = await this.supabase.from('sh_prospects')
      .select(`
        *,
        assigned_user:profiles!assigned_to(id, full_name, avatar_url),
        converted_client:sh_clients!converted_client_id(id, name)
      `)
      .eq('converted_client_id', clientId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to fetch prospect by client: ${error.message}`);
    return data as Prospect | null;
  }

  /**
   * Get all prospects linked to a client (converted + repeat business via existing_client_id)
   */
  static async getProspectsByClientId(clientId: string): Promise<Prospect[]> {
    const { data, error } = await this.supabase.from('sh_prospects')
      .select(`
        *,
        assigned_user:profiles!assigned_to(id, full_name, avatar_url),
        converted_client:sh_clients!converted_client_id(id, name)
      `)
      .or(`converted_client_id.eq.${clientId},existing_client_id.eq.${clientId}`)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to fetch prospects for client: ${error.message}`);
    return (data || []) as Prospect[];
  }

  /**
   * Reactivate a dormant/lost prospect back to lead stage
   */
  static async reactivateProspect(id: string): Promise<Prospect> {
    const { data, error } = await this.supabase.from('sh_prospects')
      .update({
        pipeline_stage: 'lead',
        lost_reason: null,
        reopen_date: null,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        assigned_user:profiles!assigned_to(id, full_name, avatar_url),
        converted_client:sh_clients!converted_client_id(id, name),
        existing_client:sh_clients!existing_client_id(id, name)
      `)
      .single();
    if (error) throw new Error(`Failed to reactivate prospect: ${error.message}`);
    return data as Prospect;
  }

  /**
   * Get prospects that are ready to re-engage (reopen_date <= today, dormant/lost)
   */
  static async getReadyToReengage(): Promise<Prospect[]> {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await this.supabase.from('sh_prospects')
      .select(`
        *,
        assigned_user:profiles!assigned_to(id, full_name, avatar_url),
        converted_client:sh_clients!converted_client_id(id, name)
      `)
      .lte('reopen_date', today)
      .in('pipeline_stage', ['dormant', 'lost'])
      .eq('is_active', true)
      .order('reopen_date', { ascending: true });
    if (error) throw new Error(`Failed to fetch re-engage prospects: ${error.message}`);
    return (data || []) as Prospect[];
  }

  /**
   * Get source conversion analytics (win rate, avg deal size, solutions per client, referrals by source)
   */
  static async getSourceConversionAnalytics(): Promise<SourceConversionAnalytics> {
    // Get all prospects
    const { data: prospects, error: pError } = await this.supabase.from('sh_prospects')
      .select('source_type, pipeline_stage, expected_deal_size, converted_client_id');
    if (pError) throw new Error(`Failed to fetch source analytics: ${pError.message}`);

    // Get client solution counts and referral counts for converted clients
    const { data: clients, error: cError } = await this.supabase.from('sh_clients')
      .select('id, referral_count');
    if (cError) throw new Error(`Failed to fetch client data: ${cError.message}`);

    const { data: solutions, error: sError } = await this.supabase.from('sh_solutions')
      .select('client_id');
    if (sError) throw new Error(`Failed to fetch solutions: ${sError.message}`);

    // Build client metrics map
    const clientSolutionCount: Record<string, number> = {};
    for (const s of (solutions || [])) {
      clientSolutionCount[s.client_id] = (clientSolutionCount[s.client_id] || 0) + 1;
    }
    const clientRefMap: Record<string, number> = {};
    for (const c of (clients || [])) {
      clientRefMap[c.id] = c.referral_count || 0;
    }

    // Group by source
    const sourceMap: Record<string, { total: number; won: number; lost: number; dealSizeSum: number; dealSizeCount: number; clientIds: string[] }> = {};
    for (const p of (prospects || [])) {
      const src = p.source_type || 'direct';
      if (!sourceMap[src]) sourceMap[src] = { total: 0, won: 0, lost: 0, dealSizeSum: 0, dealSizeCount: 0, clientIds: [] };
      sourceMap[src].total++;
      if (p.pipeline_stage === 'won') {
        sourceMap[src].won++;
        if (p.converted_client_id) sourceMap[src].clientIds.push(p.converted_client_id);
      }
      if (p.pipeline_stage === 'lost') sourceMap[src].lost++;
      if (p.expected_deal_size) {
        sourceMap[src].dealSizeSum += Number(p.expected_deal_size);
        sourceMap[src].dealSizeCount++;
      }
    }

    const sourceStats = Object.entries(sourceMap).map(([source, d]) => {
      const totalSolutions = d.clientIds.reduce((sum, cid) => sum + (clientSolutionCount[cid] || 0), 0);
      const totalReferrals = d.clientIds.reduce((sum, cid) => sum + (clientRefMap[cid] || 0), 0);
      const clientCount = d.clientIds.length || 1;
      return {
        source: source.charAt(0).toUpperCase() + source.slice(1),
        total: d.total,
        won: d.won,
        lost: d.lost,
        winRate: d.total > 0 ? Math.round((d.won / d.total) * 100) : 0,
        avgDealSize: d.dealSizeCount > 0 ? Math.round(d.dealSizeSum / d.dealSizeCount) : 0,
        avgSolutionsPerClient: Math.round((totalSolutions / clientCount) * 10) / 10,
        avgReferrals: Math.round((totalReferrals / clientCount) * 10) / 10,
      };
    });

    return { sourceStats };
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
  getPipelineAnalytics: ProspectsService.getPipelineAnalytics.bind(ProspectsService),
  getProspectByClientId: ProspectsService.getProspectByClientId.bind(ProspectsService),
  getProspectsByClientId: ProspectsService.getProspectsByClientId.bind(ProspectsService),
  reactivateProspect: ProspectsService.reactivateProspect.bind(ProspectsService),
  getReadyToReengage: ProspectsService.getReadyToReengage.bind(ProspectsService),
  getSourceConversionAnalytics: ProspectsService.getSourceConversionAnalytics.bind(ProspectsService),
};
