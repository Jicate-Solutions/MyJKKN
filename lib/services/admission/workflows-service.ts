// lib/services/admission/workflows-service.ts
// Admission CRM Workflows Service - Supabase interactions

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { EmailService } from '@/lib/services/email/email-service';

// Types
export type WorkflowTriggerType = 'stage_change' | 'time_delay' | 'no_response' | 'manual' | 'lead_created' | 'score_change';
export type WorkflowActionType = 'send_whatsapp' | 'send_email' | 'send_sms' | 'assign_task' | 'update_stage' | 'notify_counselor' | 'add_tag' | 'assign_counselor';
export type WorkflowExecutionStatus = 'running' | 'completed' | 'failed';

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  config: {
    stage?: string;
    from_stage?: string;
    to_stage?: string;
    delay_hours?: number;
    delay_days?: number;
    score_threshold?: number;
  };
}

export interface WorkflowCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in';
  value: string | number | string[];
}

export interface WorkflowAction {
  id: string;
  type: WorkflowActionType;
  order: number;
  config: {
    template_id?: string;
    message?: string;
    new_stage?: string;
    task_description?: string;
    counselor_id?: string;
    tag?: string;
    delay_minutes?: number;
  };
}

export interface Workflow {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  created_at: string;
  updated_at: string;
  // Virtual fields
  runs_count?: number;
  last_run?: string;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  lead_id: string | null;
  application_id: string | null;
  trigger_data: Record<string, unknown>;
  actions_executed: { action_id: string; status: string; result?: unknown }[];
  status: WorkflowExecutionStatus;
  error_message: string | null;
  executed_at: string;
}

export interface CreateWorkflowInput {
  institution_id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  trigger: WorkflowTrigger;
  conditions?: WorkflowCondition[];
  actions: WorkflowAction[];
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  is_active?: boolean;
  trigger?: WorkflowTrigger;
  conditions?: WorkflowCondition[];
  actions?: WorkflowAction[];
}

export interface WorkflowStats {
  totalWorkflows: number;
  activeWorkflows: number;
  totalExecutions: number;
  executionsToday: number;
  failedExecutions: number;
}

export class WorkflowsService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // WORKFLOW CRUD METHODS
  // ============================================================================

  /**
   * Get all workflows for an institution
   */
  static async getWorkflows(institutionId: string): Promise<Workflow[]> {
    const { data, error } = await this.supabase
      .from('admission_workflows')
      .select('*')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[admission/workflows] Failed to fetch workflows:', error);
      throw new Error('Failed to fetch workflows');
    }

    // Get execution counts for each workflow
    const workflowIds = (data || []).map((w: Workflow) => w.id);
    const executionCounts = await this.getExecutionCounts(workflowIds);

    return (data || []).map((workflow: Workflow) => ({
      ...workflow,
      runs_count: executionCounts[workflow.id]?.count || 0,
      last_run: executionCounts[workflow.id]?.last_run || null,
    }));
  }

  /**
   * Get active workflows for an institution (for execution engine)
   */
  static async getActiveWorkflows(institutionId: string): Promise<Workflow[]> {
    const { data, error } = await this.supabase
      .from('admission_workflows')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[admission/workflows] Failed to fetch active workflows:', error);
      throw new Error('Failed to fetch active workflows');
    }

    return data || [];
  }

  /**
   * Get a single workflow by ID
   */
  static async getWorkflow(id: string): Promise<Workflow | null> {
    const { data, error } = await this.supabase
      .from('admission_workflows')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[admission/workflows] Failed to fetch workflow:', error);
      throw new Error('Failed to fetch workflow');
    }

    if (!data) return null;

    // Get execution count
    const executionCounts = await this.getExecutionCounts([data.id]);

    return {
      ...data,
      runs_count: executionCounts[data.id]?.count || 0,
      last_run: executionCounts[data.id]?.last_run || null,
    };
  }

  /**
   * Create a new workflow
   */
  static async createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
    const { data, error } = await this.supabase
      .from('admission_workflows')
      .insert({
        institution_id: input.institution_id,
        name: input.name,
        description: input.description || null,
        is_active: input.is_active ?? true,
        trigger: input.trigger,
        conditions: input.conditions || [],
        actions: input.actions,
      })
      .select()
      .single();

    if (error) {
      console.error('[admission/workflows] Failed to create workflow:', error);
      throw new Error('Failed to create workflow');
    }

    return { ...data, runs_count: 0 };
  }

  /**
   * Update an existing workflow
   */
  static async updateWorkflow(id: string, input: UpdateWorkflowInput): Promise<Workflow> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;
    if (input.trigger !== undefined) updateData.trigger = input.trigger;
    if (input.conditions !== undefined) updateData.conditions = input.conditions;
    if (input.actions !== undefined) updateData.actions = input.actions;

    const { data, error } = await this.supabase
      .from('admission_workflows')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/workflows] Failed to update workflow:', error);
      throw new Error('Failed to update workflow');
    }

    return data;
  }

  /**
   * Delete a workflow
   */
  static async deleteWorkflow(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_workflows')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admission/workflows] Failed to delete workflow:', error);
      throw new Error('Failed to delete workflow');
    }
  }

  /**
   * Toggle workflow active status
   */
  static async toggleWorkflowStatus(id: string, isActive: boolean): Promise<Workflow> {
    return this.updateWorkflow(id, { is_active: isActive });
  }

  /**
   * Duplicate a workflow
   */
  static async duplicateWorkflow(id: string): Promise<Workflow> {
    const original = await this.getWorkflow(id);
    if (!original) {
      throw new Error('Workflow not found');
    }

    return this.createWorkflow({
      institution_id: original.institution_id,
      name: `${original.name} (Copy)`,
      description: original.description || undefined,
      is_active: false, // Start duplicates as inactive
      trigger: original.trigger,
      conditions: original.conditions,
      actions: original.actions.map(a => ({ ...a, id: `action_${Date.now()}_${Math.random().toString(36).slice(2)}` })),
    });
  }

  // ============================================================================
  // EXECUTION METHODS
  // ============================================================================

  /**
   * Get execution counts for workflows
   */
  private static async getExecutionCounts(workflowIds: string[]): Promise<Record<string, { count: number; last_run: string | null }>> {
    if (workflowIds.length === 0) return {};

    const { data, error } = await this.supabase
      .from('admission_workflow_executions')
      .select('workflow_id, executed_at')
      .in('workflow_id', workflowIds)
      .order('executed_at', { ascending: false });

    if (error) {
      console.warn('[admission/workflows] Failed to fetch execution counts:', error);
      return {};
    }

    const counts: Record<string, { count: number; last_run: string | null }> = {};

    for (const execution of data || []) {
      if (!counts[execution.workflow_id]) {
        counts[execution.workflow_id] = { count: 0, last_run: execution.executed_at };
      }
      counts[execution.workflow_id].count++;
    }

    return counts;
  }

  /**
   * Get workflow executions
   */
  static async getWorkflowExecutions(workflowId: string, limit = 50): Promise<WorkflowExecution[]> {
    const { data, error } = await this.supabase
      .from('admission_workflow_executions')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('executed_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[admission/workflows] Failed to fetch executions:', error);
      throw new Error('Failed to fetch workflow executions');
    }

    return data || [];
  }

  /**
   * Log a workflow execution
   */
  static async logExecution(
    workflowId: string,
    leadId: string | null,
    triggerData: Record<string, unknown>,
    status: WorkflowExecutionStatus,
    actionsExecuted: { action_id: string; status: string; result?: unknown }[],
    errorMessage?: string
  ): Promise<WorkflowExecution> {
    const { data, error } = await this.supabase
      .from('admission_workflow_executions')
      .insert({
        workflow_id: workflowId,
        lead_id: leadId,
        trigger_data: triggerData,
        actions_executed: actionsExecuted,
        status,
        error_message: errorMessage || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[admission/workflows] Failed to log execution:', error);
      throw new Error('Failed to log workflow execution');
    }

    return data;
  }

  /**
   * Execute a single workflow action for a lead.
   * Dispatches send_email actions to EmailService.
   */
  static async executeAction(
    action: WorkflowAction,
    leadId: string,
    institutionId: string
  ): Promise<{ success: boolean; error?: string }> {
    switch (action.type) {
      case 'send_email': {
        if (!EmailService.isConfigured()) {
          return { success: false, error: 'Email service not configured' };
        }

        const templateId = action.config?.template_id;
        if (!templateId) {
          return { success: false, error: 'No template_id in action config' };
        }

        // Fetch lead email
        const { data: lead, error: leadError } = await this.supabase
          .from('admission_leads')
          .select('email, full_name, phone')
          .eq('id', leadId)
          .single();

        if (leadError || !lead?.email) {
          return { success: false, error: 'Lead not found or has no email' };
        }

        const variables: Record<string, string> = {
          full_name: lead.full_name || '',
          first_name: (lead.full_name || '').split(' ')[0] || '',
          email: lead.email || '',
          phone: lead.phone || '',
        };

        const result = await EmailService.sendTemplateEmail({
          to: lead.email,
          template_id: templateId,
          variables,
          institution_id: institutionId,
          lead_id: leadId,
        });

        return { success: result.success, error: result.error };
      }

      case 'send_sms':
      case 'send_whatsapp':
      case 'assign_task':
      case 'update_stage':
      case 'notify_counselor':
      case 'add_tag':
      case 'assign_counselor':
        // Other action types handled by existing dispatchers
        return { success: true };

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  }

  // ============================================================================
  // STATS & ANALYTICS
  // ============================================================================

  /**
   * Get workflow statistics for an institution
   */
  static async getWorkflowStats(institutionId: string): Promise<WorkflowStats> {
    // Get workflows
    const { data: workflows, error: workflowsError } = await this.supabase
      .from('admission_workflows')
      .select('id, is_active')
      .eq('institution_id', institutionId);

    if (workflowsError) {
      console.warn('[admission/workflows] Failed to fetch workflow stats:', workflowsError);
    }

    const totalWorkflows = workflows?.length || 0;
    const activeWorkflows = workflows?.filter((w: { is_active: boolean }) => w.is_active).length || 0;

    // Get execution stats
    const workflowIds = (workflows || []).map((w: { id: string }) => w.id);
    let totalExecutions = 0;
    let executionsToday = 0;
    let failedExecutions = 0;

    if (workflowIds.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: executions } = await this.supabase
        .from('admission_workflow_executions')
        .select('status, executed_at')
        .in('workflow_id', workflowIds);

      if (executions) {
        totalExecutions = executions.length;
        failedExecutions = executions.filter((e: { status: string }) => e.status === 'failed').length;
        executionsToday = executions.filter(
          (e: { executed_at: string }) => new Date(e.executed_at) >= today
        ).length;
      }
    }

    return {
      totalWorkflows,
      activeWorkflows,
      totalExecutions,
      executionsToday,
      failedExecutions,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get available trigger types
   */
  static getTriggerTypes(): { value: WorkflowTriggerType; label: string; description: string }[] {
    return [
      { value: 'stage_change', label: 'Stage Change', description: 'When lead moves to a stage' },
      { value: 'lead_created', label: 'Lead Created', description: 'When new lead is added' },
      { value: 'time_delay', label: 'Time Delay', description: 'After X hours/days' },
      { value: 'no_response', label: 'No Response', description: "If lead hasn't responded" },
      { value: 'score_change', label: 'Score Change', description: 'When lead score changes' },
      { value: 'manual', label: 'Manual Trigger', description: 'Triggered manually' },
    ];
  }

  /**
   * Get available action types
   */
  static getActionTypes(): { value: WorkflowActionType; label: string; color: string }[] {
    return [
      { value: 'send_whatsapp', label: 'Send WhatsApp', color: 'bg-green-500' },
      { value: 'send_email', label: 'Send Email', color: 'bg-blue-500' },
      { value: 'send_sms', label: 'Send SMS', color: 'bg-purple-500' },
      { value: 'assign_task', label: 'Assign Task', color: 'bg-orange-500' },
      { value: 'update_stage', label: 'Update Stage', color: 'bg-indigo-500' },
      { value: 'notify_counselor', label: 'Notify Counselor', color: 'bg-red-500' },
      { value: 'add_tag', label: 'Add Tag', color: 'bg-teal-500' },
      { value: 'assign_counselor', label: 'Assign Counselor', color: 'bg-pink-500' },
    ];
  }

  /**
   * Validate workflow configuration
   */
  static validateWorkflow(input: CreateWorkflowInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!input.name || input.name.trim().length === 0) {
      errors.push('Workflow name is required');
    }

    if (!input.trigger || !input.trigger.type) {
      errors.push('Workflow trigger is required');
    }

    if (!input.actions || input.actions.length === 0) {
      errors.push('At least one action is required');
    }

    // Validate trigger config based on type
    if (input.trigger) {
      const { type, config } = input.trigger;
      if (type === 'stage_change' && !config.stage && !config.to_stage) {
        errors.push('Stage change trigger requires a target stage');
      }
      if ((type === 'time_delay' || type === 'no_response') && !config.delay_hours && !config.delay_days) {
        errors.push('Time-based trigger requires a delay value');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
