// lib/services/admission/assignment-rules-service.ts
// Admission CRM Assignment Rules Service - Supabase interactions

import { createClientSupabaseClient } from '@/lib/supabase/client';

// Types
export type AssignmentRuleType =
  | 'program'
  | 'round_robin'
  | 'location'
  | 'score'
  | 'source'
  | 'workload';

export interface AssignmentCriterion {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'in';
  value: string | number | string[];
}

export interface AssignmentAction {
  type: 'assign_to_counselor' | 'assign_to_pool' | 'round_robin';
  counselor_ids?: string[];
  pool_id?: string;
  fallback?: 'round_robin' | 'unassigned';
}

export interface AssignmentRule {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  priority: number;
  is_active: boolean;
  criteria: AssignmentCriterion[];
  action: AssignmentAction;
  created_at: string;
  updated_at: string;
  // Virtual fields for display
  type?: AssignmentRuleType;
  assignee_count?: number;
  leads_processed?: number;
}

export interface CreateAssignmentRuleInput {
  institution_id: string;
  name: string;
  description?: string;
  priority?: number;
  is_active?: boolean;
  criteria: AssignmentCriterion[];
  action: AssignmentAction;
}

export interface UpdateAssignmentRuleInput {
  name?: string;
  description?: string;
  priority?: number;
  is_active?: boolean;
  criteria?: AssignmentCriterion[];
  action?: AssignmentAction;
}

export interface AssignmentStats {
  totalRules: number;
  activeRules: number;
  leadsAssignedToday: number;
  avgAssignmentTime: string;
  unassignedLeads: number;
}

export class AssignmentRulesService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // CRUD METHODS
  // ============================================================================

  /**
   * Get all assignment rules for an institution
   */
  static async getAssignmentRules(institutionId: string): Promise<AssignmentRule[]> {
    const { data, error } = await this.supabase
      .from('admission_assignment_rules')
      .select('*')
      .eq('institution_id', institutionId)
      .order('priority', { ascending: true });

    if (error) {
      console.error('[admission/assignment-rules] Failed to fetch rules:', error);
      throw new Error('Failed to fetch assignment rules');
    }

    return (data || []).map(this.enrichRule);
  }

  /**
   * Get active assignment rules for an institution (for processing)
   */
  static async getActiveAssignmentRules(institutionId: string): Promise<AssignmentRule[]> {
    const { data, error } = await this.supabase
      .from('admission_assignment_rules')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('priority', { ascending: true });

    if (error) {
      console.error('[admission/assignment-rules] Failed to fetch active rules:', error);
      throw new Error('Failed to fetch active assignment rules');
    }

    return (data || []).map(this.enrichRule);
  }

  /**
   * Get a single assignment rule by ID
   */
  static async getAssignmentRule(id: string): Promise<AssignmentRule | null> {
    const { data, error } = await this.supabase
      .from('admission_assignment_rules')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[admission/assignment-rules] Failed to fetch rule:', error);
      throw new Error('Failed to fetch assignment rule');
    }

    return data ? this.enrichRule(data) : null;
  }

  /**
   * Create a new assignment rule
   */
  static async createAssignmentRule(input: CreateAssignmentRuleInput): Promise<AssignmentRule> {
    const { data, error } = await this.supabase
      .from('admission_assignment_rules')
      .insert({
        institution_id: input.institution_id,
        name: input.name,
        description: input.description || null,
        priority: input.priority ?? 10,
        is_active: input.is_active ?? true,
        criteria: input.criteria,
        action: input.action,
      })
      .select()
      .single();

    if (error) {
      console.error('[admission/assignment-rules] Failed to create rule:', error);
      throw new Error('Failed to create assignment rule');
    }

    return this.enrichRule(data);
  }

  /**
   * Update an existing assignment rule
   */
  static async updateAssignmentRule(id: string, input: UpdateAssignmentRuleInput): Promise<AssignmentRule> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;
    if (input.criteria !== undefined) updateData.criteria = input.criteria;
    if (input.action !== undefined) updateData.action = input.action;

    const { data, error } = await this.supabase
      .from('admission_assignment_rules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/assignment-rules] Failed to update rule:', error);
      throw new Error('Failed to update assignment rule');
    }

    return this.enrichRule(data);
  }

  /**
   * Delete an assignment rule
   */
  static async deleteAssignmentRule(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_assignment_rules')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admission/assignment-rules] Failed to delete rule:', error);
      throw new Error('Failed to delete assignment rule');
    }
  }

  /**
   * Toggle assignment rule active status
   */
  static async toggleRuleStatus(id: string, isActive: boolean): Promise<AssignmentRule> {
    return this.updateAssignmentRule(id, { is_active: isActive });
  }

  /**
   * Update rule priorities (reorder)
   */
  static async updatePriorities(rules: { id: string; priority: number }[]): Promise<void> {
    const updates = rules.map(rule =>
      this.supabase
        .from('admission_assignment_rules')
        .update({ priority: rule.priority, updated_at: new Date().toISOString() })
        .eq('id', rule.id)
    );

    const results = await Promise.all(updates);
    const errors = results.filter(r => r.error);

    if (errors.length > 0) {
      console.error('[admission/assignment-rules] Failed to update priorities:', errors);
      throw new Error('Failed to update rule priorities');
    }
  }

  // ============================================================================
  // STATS & ANALYTICS
  // ============================================================================

  /**
   * Get assignment statistics for an institution
   */
  static async getAssignmentStats(institutionId: string): Promise<AssignmentStats> {
    // Get rules count
    const { data: rules, error: rulesError } = await this.supabase
      .from('admission_assignment_rules')
      .select('id, is_active')
      .eq('institution_id', institutionId);

    if (rulesError) {
      console.warn('[admission/assignment-rules] Failed to fetch stats:', rulesError);
    }

    const totalRules = rules?.length || 0;
    const activeRules = rules?.filter((r: { is_active: boolean }) => r.is_active).length || 0;

    // Get unassigned leads count
    const { count: unassignedCount } = await this.supabase
      .from('admission_leads')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .is('counselor_id', null);

    // Get today's assignments (leads with counselor assigned today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: assignedToday } = await this.supabase
      .from('admission_leads')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .not('counselor_id', 'is', null)
      .gte('updated_at', today.toISOString());

    return {
      totalRules,
      activeRules,
      leadsAssignedToday: assignedToday || 0,
      avgAssignmentTime: '< 1 min', // Would need activity logs to calculate
      unassignedLeads: unassignedCount || 0,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Enrich rule with derived fields
   */
  private static enrichRule(rule: AssignmentRule): AssignmentRule {
    // Determine type from criteria
    let type: AssignmentRuleType = 'round_robin';
    if (rule.criteria && Array.isArray(rule.criteria)) {
      const fields = rule.criteria.map((c: AssignmentCriterion) => c.field);
      // FIX: program_interest does not exist in DB → use interested_programs
      if (fields.includes('interested_programs') || fields.includes('program_interest')) type = 'program';
      else if (fields.includes('location') || fields.includes('region')) type = 'location';
      else if (fields.includes('score') || fields.includes('lead_score')) type = 'score';
      else if (fields.includes('source')) type = 'source';
    }
    if (rule.action?.type === 'round_robin') type = 'round_robin';

    // Count assignees
    const assigneeCount = rule.action?.counselor_ids?.length || 0;

    return {
      ...rule,
      type,
      assignee_count: assigneeCount,
      leads_processed: 0, // Would need activity logs to calculate
    };
  }

  /**
   * Get default action for a rule type
   */
  static getDefaultAction(type: AssignmentRuleType): AssignmentAction {
    switch (type) {
      case 'round_robin':
        return { type: 'round_robin', fallback: 'unassigned' };
      case 'workload':
        return { type: 'assign_to_pool', fallback: 'round_robin' };
      default:
        return { type: 'assign_to_counselor', counselor_ids: [], fallback: 'round_robin' };
    }
  }

  /**
   * Get default criteria for a rule type
   */
  static getDefaultCriteria(type: AssignmentRuleType): AssignmentCriterion[] {
    switch (type) {
      case 'program':
        // FIX: program_interest does not exist in DB → use interested_programs
        return [{ field: 'interested_programs', operator: 'equals', value: '' }];
      case 'location':
        return [{ field: 'region', operator: 'equals', value: '' }];
      case 'score':
        return [{ field: 'lead_score', operator: 'greater_than', value: 70 }];
      case 'source':
        return [{ field: 'source', operator: 'equals', value: '' }];
      default:
        return [];
    }
  }
}
