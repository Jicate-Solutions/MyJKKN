// lib/services/admission/drip-executor-service.ts
// Drip Sequence Executor Service - Manages automated multi-step campaign sequences

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { WorkflowAction } from './workflows-service';

// ============================================================================
// TYPES
// ============================================================================

export type DripSequenceStatus = 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';
export type DripStepStatus = 'pending' | 'scheduled' | 'executing' | 'completed' | 'skipped' | 'failed';

export interface DripSequence {
  id: string;
  institution_id: string;
  workflow_id: string;
  lead_id: string;
  status: DripSequenceStatus;
  current_step_index: number;
  total_steps: number;
  started_at: string;
  paused_at: string | null;
  resumed_at: string | null;
  completed_at: string | null;
  context_data: Record<string, unknown>;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  lead?: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string;
    funnel_stage: string;
  };
  workflow?: {
    id: string;
    name: string;
  };
}

export interface DripScheduleStep {
  id: string;
  sequence_id: string;
  step_index: number;
  action_id: string;
  action_type: string;
  action_config: Record<string, unknown>;
  scheduled_at: string;
  delay_hours: number;
  delay_days: number;
  conditions: Array<{
    field: string;
    operator: string;
    value: unknown;
  }>;
  status: DripStepStatus;
  executed_at: string | null;
  execution_result: Record<string, unknown> | null;
  error_message: string | null;
  skipped_at: string | null;
  skipped_by: string | null;
  skip_reason: string | null;
  retry_count: number;
  last_retry_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DripExecutionLog {
  id: string;
  sequence_id: string;
  schedule_id: string | null;
  event_type: string;
  event_data: Record<string, unknown>;
  created_at: string;
}

export interface StartDripSequenceInput {
  institution_id: string;
  workflow_id: string;
  lead_id: string;
  context_data?: Record<string, unknown>;
  created_by?: string;
}

export interface DripSequenceFilters {
  institution_id: string;
  status?: DripSequenceStatus | DripSequenceStatus[];
  workflow_id?: string;
  lead_id?: string;
  limit?: number;
  offset?: number;
}

export interface DripSequenceStats {
  total: number;
  active: number;
  paused: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface PendingDripStep {
  schedule_id: string;
  sequence_id: string;
  lead_id: string;
  workflow_id: string;
  institution_id: string;
  step_index: number;
  action_id: string;
  action_type: string;
  action_config: Record<string, unknown>;
  conditions: Array<{ field: string; operator: string; value: unknown }>;
  context_data: Record<string, unknown>;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class DripExecutorService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // SEQUENCE MANAGEMENT
  // ============================================================================

  /**
   * Start a new drip sequence for a lead
   */
  static async startDripSequence(input: StartDripSequenceInput): Promise<DripSequence> {
    // Get the workflow to extract actions
    const { data: workflow, error: workflowError } = await this.supabase
      .from('admission_workflows')
      .select('id, name, actions, conditions')
      .eq('id', input.workflow_id)
      .single();

    if (workflowError || !workflow) {
      console.error('[admission/drip-executor] Failed to fetch workflow:', workflowError);
      throw new Error('Workflow not found');
    }

    const actions = (workflow.actions || []) as WorkflowAction[];
    if (actions.length === 0) {
      throw new Error('Workflow has no actions');
    }

    // Get lead data for context
    const { data: lead, error: leadError } = await this.supabase
      .from('admission_leads')
      .select('id, full_name, email, phone, funnel_stage, program_interest, counselor_id')
      .eq('id', input.lead_id)
      .single();

    if (leadError || !lead) {
      console.error('[admission/drip-executor] Failed to fetch lead:', leadError);
      throw new Error('Lead not found');
    }

    // Create context data with lead snapshot
    const contextData = {
      ...input.context_data,
      lead_snapshot: {
        id: lead.id,
        full_name: lead.full_name,
        email: lead.email,
        phone: lead.phone,
        funnel_stage: lead.funnel_stage,
        program_interest: lead.program_interest,
        counselor_id: lead.counselor_id,
      },
      workflow_snapshot: {
        id: workflow.id,
        name: workflow.name,
      },
    };

    // Create the sequence
    const { data: sequence, error: sequenceError } = await this.supabase
      .from('admission_drip_sequences')
      .insert({
        institution_id: input.institution_id,
        workflow_id: input.workflow_id,
        lead_id: input.lead_id,
        status: 'active',
        current_step_index: 0,
        total_steps: actions.length,
        context_data: contextData,
        created_by: input.created_by || null,
      })
      .select()
      .single();

    if (sequenceError) {
      console.error('[admission/drip-executor] Failed to create sequence:', sequenceError);
      throw new Error('Failed to create drip sequence');
    }

    // Schedule all steps
    const scheduleSteps = actions.map((action, index) => {
      const scheduledAt = this.calculateScheduledTime(index, actions);
      return {
        sequence_id: sequence.id,
        step_index: index,
        action_id: action.id,
        action_type: action.type,
        action_config: action.config || {},
        scheduled_at: scheduledAt.toISOString(),
        delay_hours: action.config?.delay_minutes ? Math.floor((action.config.delay_minutes as number) / 60) : 0,
        delay_days: 0,
        conditions: workflow.conditions || [],
        status: index === 0 ? 'scheduled' : 'pending',
      };
    });

    const { error: scheduleError } = await this.supabase
      .from('admission_drip_schedule')
      .insert(scheduleSteps);

    if (scheduleError) {
      console.error('[admission/drip-executor] Failed to schedule steps:', scheduleError);
      // Clean up sequence
      await this.supabase.from('admission_drip_sequences').delete().eq('id', sequence.id);
      throw new Error('Failed to schedule drip steps');
    }

    // Log the start
    await this.logEvent(sequence.id, 'started', {
      workflow_id: input.workflow_id,
      lead_id: input.lead_id,
      total_steps: actions.length,
    });

    return sequence;
  }

  /**
   * Calculate scheduled time for a step based on previous steps' delays
   */
  private static calculateScheduledTime(stepIndex: number, actions: WorkflowAction[]): Date {
    let delayMinutes = 0;

    for (let i = 0; i <= stepIndex; i++) {
      const action = actions[i];
      if (action.config?.delay_minutes) {
        delayMinutes += action.config.delay_minutes as number;
      }
    }

    const scheduledAt = new Date();
    scheduledAt.setMinutes(scheduledAt.getMinutes() + delayMinutes);
    return scheduledAt;
  }

  /**
   * Pause a drip sequence
   */
  static async pauseDrip(sequenceId: string): Promise<DripSequence> {
    const { data, error } = await this.supabase
      .from('admission_drip_sequences')
      .update({
        status: 'paused',
        paused_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sequenceId)
      .eq('status', 'active')
      .select()
      .single();

    if (error) {
      console.error('[admission/drip-executor] Failed to pause sequence:', error);
      throw new Error('Failed to pause drip sequence');
    }

    // Cancel pending scheduled steps
    await this.supabase
      .from('admission_drip_schedule')
      .update({ status: 'pending' })
      .eq('sequence_id', sequenceId)
      .eq('status', 'scheduled');

    await this.logEvent(sequenceId, 'paused', {});

    return data;
  }

  /**
   * Resume a paused drip sequence
   */
  static async resumeDrip(sequenceId: string): Promise<DripSequence> {
    // Get current sequence
    const { data: sequence, error: fetchError } = await this.supabase
      .from('admission_drip_sequences')
      .select('*, admission_drip_schedule(*)')
      .eq('id', sequenceId)
      .eq('status', 'paused')
      .single();

    if (fetchError || !sequence) {
      console.error('[admission/drip-executor] Failed to fetch sequence:', fetchError);
      throw new Error('Sequence not found or not paused');
    }

    // Calculate time paused and adjust scheduled times
    const pausedAt = new Date(sequence.paused_at);
    const pauseDuration = Date.now() - pausedAt.getTime();

    // Update pending step schedules
    const pendingSteps = sequence.admission_drip_schedule.filter(
      (s: DripScheduleStep) => s.status === 'pending'
    );

    for (const step of pendingSteps) {
      const originalScheduled = new Date(step.scheduled_at);
      const newScheduled = new Date(originalScheduled.getTime() + pauseDuration);

      await this.supabase
        .from('admission_drip_schedule')
        .update({ scheduled_at: newScheduled.toISOString() })
        .eq('id', step.id);
    }

    // Resume sequence
    const { data, error } = await this.supabase
      .from('admission_drip_sequences')
      .update({
        status: 'active',
        resumed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sequenceId)
      .select()
      .single();

    if (error) {
      console.error('[admission/drip-executor] Failed to resume sequence:', error);
      throw new Error('Failed to resume drip sequence');
    }

    // Mark next pending step as scheduled
    const nextStep = pendingSteps.find(
      (s: DripScheduleStep) => s.step_index === sequence.current_step_index
    );
    if (nextStep) {
      await this.supabase
        .from('admission_drip_schedule')
        .update({ status: 'scheduled' })
        .eq('id', nextStep.id);
    }

    await this.logEvent(sequenceId, 'resumed', { pause_duration_ms: pauseDuration });

    return data;
  }

  /**
   * Skip to next step in sequence
   */
  static async skipStep(sequenceId: string, userId?: string, reason?: string): Promise<DripSequence> {
    const { data: sequence, error: fetchError } = await this.supabase
      .from('admission_drip_sequences')
      .select('id, current_step_index, total_steps')
      .eq('id', sequenceId)
      .single();

    if (fetchError || !sequence) {
      throw new Error('Sequence not found');
    }

    // Find current step
    const { data: currentStep, error: stepError } = await this.supabase
      .from('admission_drip_schedule')
      .select('*')
      .eq('sequence_id', sequenceId)
      .eq('step_index', sequence.current_step_index)
      .single();

    if (stepError || !currentStep) {
      throw new Error('Current step not found');
    }

    // Mark current step as skipped
    await this.supabase
      .from('admission_drip_schedule')
      .update({
        status: 'skipped',
        skipped_at: new Date().toISOString(),
        skipped_by: userId || null,
        skip_reason: reason || 'Manually skipped',
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentStep.id);

    // Log the skip
    await this.logEvent(sequenceId, 'skipped', {
      step_index: sequence.current_step_index,
      skipped_by: userId,
      reason,
    }, currentStep.id);

    // Check if sequence is complete
    const newStepIndex = sequence.current_step_index + 1;
    if (newStepIndex >= sequence.total_steps) {
      // Complete the sequence
      const { data, error } = await this.supabase
        .from('admission_drip_sequences')
        .update({
          status: 'completed',
          current_step_index: newStepIndex,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sequenceId)
        .select()
        .single();

      if (error) throw new Error('Failed to complete sequence');

      await this.logEvent(sequenceId, 'completed', { total_steps: sequence.total_steps });

      return data;
    }

    // Update sequence and schedule next step
    const { data, error } = await this.supabase
      .from('admission_drip_sequences')
      .update({
        current_step_index: newStepIndex,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sequenceId)
      .select()
      .single();

    if (error) throw new Error('Failed to update sequence');

    // Mark next step as scheduled
    await this.supabase
      .from('admission_drip_schedule')
      .update({ status: 'scheduled' })
      .eq('sequence_id', sequenceId)
      .eq('step_index', newStepIndex);

    return data;
  }

  /**
   * Cancel a drip sequence
   */
  static async cancelDrip(sequenceId: string, reason?: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_drip_sequences')
      .update({
        status: 'cancelled',
        error_message: reason || 'Manually cancelled',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sequenceId)
      .in('status', ['active', 'paused']);

    if (error) {
      console.error('[admission/drip-executor] Failed to cancel sequence:', error);
      throw new Error('Failed to cancel drip sequence');
    }

    await this.logEvent(sequenceId, 'cancelled', { reason });
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Get drip sequence status with all details
   */
  static async getDripStatus(sequenceId: string): Promise<{
    sequence: DripSequence;
    steps: DripScheduleStep[];
    logs: DripExecutionLog[];
  }> {
    // Get sequence with lead and workflow data
    const { data: sequence, error: seqError } = await this.supabase
      .from('admission_drip_sequences')
      .select(`
        *,
        lead:admission_leads(id, full_name, email, phone, funnel_stage),
        workflow:admission_workflows(id, name)
      `)
      .eq('id', sequenceId)
      .single();

    if (seqError || !sequence) {
      throw new Error('Sequence not found');
    }

    // Get steps
    const { data: steps, error: stepsError } = await this.supabase
      .from('admission_drip_schedule')
      .select('*')
      .eq('sequence_id', sequenceId)
      .order('step_index', { ascending: true });

    if (stepsError) {
      console.error('[admission/drip-executor] Failed to fetch steps:', stepsError);
    }

    // Get recent logs
    const { data: logs, error: logsError } = await this.supabase
      .from('admission_drip_execution_logs')
      .select('*')
      .eq('sequence_id', sequenceId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (logsError) {
      console.error('[admission/drip-executor] Failed to fetch logs:', logsError);
    }

    return {
      sequence,
      steps: steps || [],
      logs: logs || [],
    };
  }

  /**
   * Get active sequences for an institution
   */
  static async getActiveSequences(filters: DripSequenceFilters): Promise<DripSequence[]> {
    let query = this.supabase
      .from('admission_drip_sequences')
      .select(`
        *,
        lead:admission_leads(id, full_name, email, phone, funnel_stage),
        workflow:admission_workflows(id, name)
      `)
      .eq('institution_id', filters.institution_id);

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status);
      } else {
        query = query.eq('status', filters.status);
      }
    } else {
      // Default to active and paused
      query = query.in('status', ['active', 'paused']);
    }

    if (filters.workflow_id) {
      query = query.eq('workflow_id', filters.workflow_id);
    }

    if (filters.lead_id) {
      query = query.eq('lead_id', filters.lead_id);
    }

    query = query.order('created_at', { ascending: false });

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admission/drip-executor] Failed to fetch sequences:', error);
      throw new Error('Failed to fetch drip sequences');
    }

    return data || [];
  }

  /**
   * Get sequence statistics for an institution
   */
  static async getSequenceStats(institutionId: string): Promise<DripSequenceStats> {
    const { data, error } = await this.supabase
      .from('admission_drip_sequences')
      .select('status')
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[admission/drip-executor] Failed to fetch stats:', error);
      return {
        total: 0,
        active: 0,
        paused: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      };
    }

    const sequences = data || [];
    return {
      total: sequences.length,
      active: sequences.filter((s) => s.status === 'active').length,
      paused: sequences.filter((s) => s.status === 'paused').length,
      completed: sequences.filter((s) => s.status === 'completed').length,
      failed: sequences.filter((s) => s.status === 'failed').length,
      cancelled: sequences.filter((s) => s.status === 'cancelled').length,
    };
  }

  // ============================================================================
  // EXECUTION METHODS (for background processor)
  // ============================================================================

  /**
   * Get pending steps ready for execution
   */
  static async getPendingSteps(limit = 100): Promise<PendingDripStep[]> {
    const { data, error } = await this.supabase.rpc('get_pending_drip_steps', {
      p_limit: limit,
    });

    if (error) {
      console.error('[admission/drip-executor] Failed to fetch pending steps:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Mark a step as executed
   */
  static async markStepExecuted(
    scheduleId: string,
    result: Record<string, unknown> = {},
    error?: string
  ): Promise<void> {
    const { error: rpcError } = await this.supabase.rpc('mark_drip_step_executed', {
      p_schedule_id: scheduleId,
      p_result: result,
      p_error: error || null,
    });

    if (rpcError) {
      console.error('[admission/drip-executor] Failed to mark step executed:', rpcError);
      throw new Error('Failed to mark step as executed');
    }
  }

  /**
   * Check if conditions are met for executing a step
   */
  static async checkConditions(
    leadId: string,
    conditions: Array<{ field: string; operator: string; value: unknown }>
  ): Promise<boolean> {
    if (!conditions || conditions.length === 0) {
      return true;
    }

    // Get current lead data
    const { data: lead, error } = await this.supabase
      .from('admission_leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (error || !lead) {
      console.warn('[admission/drip-executor] Could not fetch lead for condition check');
      return false;
    }

    // Check each condition
    for (const condition of conditions) {
      const fieldValue = lead[condition.field];
      const expectedValue = condition.value;

      let conditionMet = false;

      switch (condition.operator) {
        case 'equals':
          conditionMet = fieldValue === expectedValue;
          break;
        case 'not_equals':
          conditionMet = fieldValue !== expectedValue;
          break;
        case 'contains':
          conditionMet = String(fieldValue).includes(String(expectedValue));
          break;
        case 'greater_than':
          conditionMet = Number(fieldValue) > Number(expectedValue);
          break;
        case 'less_than':
          conditionMet = Number(fieldValue) < Number(expectedValue);
          break;
        case 'in':
          conditionMet = Array.isArray(expectedValue) && expectedValue.includes(fieldValue);
          break;
        default:
          conditionMet = true;
      }

      if (!conditionMet) {
        return false;
      }
    }

    return true;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Log an event to the execution logs
   */
  private static async logEvent(
    sequenceId: string,
    eventType: string,
    eventData: Record<string, unknown>,
    scheduleId?: string
  ): Promise<void> {
    await this.supabase.from('admission_drip_execution_logs').insert({
      sequence_id: sequenceId,
      schedule_id: scheduleId || null,
      event_type: eventType,
      event_data: eventData,
    });
  }

  /**
   * Get sequences for a specific lead
   */
  static async getSequencesForLead(leadId: string): Promise<DripSequence[]> {
    const { data, error } = await this.supabase
      .from('admission_drip_sequences')
      .select(`
        *,
        workflow:admission_workflows(id, name)
      `)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[admission/drip-executor] Failed to fetch lead sequences:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Check if a lead has an active sequence for a workflow
   */
  static async hasActiveSequence(leadId: string, workflowId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('admission_drip_sequences')
      .select('id')
      .eq('lead_id', leadId)
      .eq('workflow_id', workflowId)
      .in('status', ['active', 'paused'])
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[admission/drip-executor] Failed to check active sequence:', error);
    }

    return !!data;
  }
}
