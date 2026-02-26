// lib/services/admission/campaign-processor-service.ts
// Campaign Background Job Processor Service - Supabase interactions

import { createClientSupabaseClient } from '@/lib/supabase/client';

// Types
export type CampaignStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';
export type CampaignStepType = 'send_sms' | 'send_email' | 'send_whatsapp' | 'update_stage' | 'assign_counselor' | 'add_tag' | 'wait' | 'wait_hours' | 'wait_days';
export type CampaignLogType = 'info' | 'warning' | 'error' | 'success';

export interface CampaignStepConfig {
  template_id?: string;
  message?: string;
  new_stage?: string;
  counselor_id?: string;
  tag?: string;
  delay_hours?: number;
  delay_days?: number;
  delay_minutes?: number;
  conditions?: CampaignCondition[];
}

export interface CampaignCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in';
  value: string | number | string[];
}

export interface QueuedStep {
  id: string;
  institution_id: string;
  workflow_id: string | null;
  lead_id: string | null;
  application_id: string | null;
  step_type: CampaignStepType;
  step_config: CampaignStepConfig;
  step_order: number;
  scheduled_at: string;
  execute_after: string | null;
  status: CampaignStepStatus;
  attempts: number;
  max_attempts: number;
  last_attempt_at: string | null;
  execution_id: string | null;
  parent_queue_id: string | null;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  priority: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CampaignLog {
  id: string;
  institution_id: string;
  queue_id: string | null;
  workflow_id: string | null;
  lead_id: string | null;
  log_type: CampaignLogType;
  step_type: CampaignStepType | null;
  action: string;
  request_data: Record<string, unknown> | null;
  response_data: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
  created_by: string | null;
}

export interface QueueStepInput {
  institution_id: string;
  workflow_id?: string;
  lead_id?: string;
  application_id?: string;
  step_type: CampaignStepType;
  step_config: CampaignStepConfig;
  step_order?: number;
  execute_after?: Date;
  priority?: number;
  execution_id?: string;
  parent_queue_id?: string;
  max_attempts?: number;
}

export interface QueueStats {
  total_pending: number;
  total_running: number;
  total_completed: number;
  total_failed: number;
  completed_today: number;
  failed_today: number;
}

export interface QueueFilters {
  institution_id: string;
  status?: CampaignStepStatus;
  step_type?: CampaignStepType;
  workflow_id?: string;
  lead_id?: string;
  limit?: number;
  offset?: number;
}

export interface LogFilters {
  institution_id: string;
  queue_id?: string;
  workflow_id?: string;
  lead_id?: string;
  log_type?: CampaignLogType;
  limit?: number;
  offset?: number;
}

export class CampaignProcessorService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // QUEUE METHODS
  // ============================================================================

  /**
   * Queue a campaign step for execution
   */
  static async queueCampaignStep(input: QueueStepInput): Promise<QueuedStep> {
    const insertData: Record<string, unknown> = {
      institution_id: input.institution_id,
      step_type: input.step_type,
      step_config: input.step_config,
      step_order: input.step_order || 0,
      priority: input.priority || 0,
      max_attempts: input.max_attempts || 3,
      status: 'pending',
    };

    if (input.workflow_id) insertData.workflow_id = input.workflow_id;
    if (input.lead_id) insertData.lead_id = input.lead_id;
    if (input.application_id) insertData.application_id = input.application_id;
    if (input.execute_after) insertData.execute_after = input.execute_after.toISOString();
    if (input.execution_id) insertData.execution_id = input.execution_id;
    if (input.parent_queue_id) insertData.parent_queue_id = input.parent_queue_id;

    const { data, error } = await this.supabase
      .from('admission_campaign_queue')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[admission/campaign-processor] Failed to queue step:', error);
      throw new Error('Failed to queue campaign step');
    }

    // Log the queue action
    await this.logAction({
      institution_id: input.institution_id,
      queue_id: data.id,
      workflow_id: input.workflow_id,
      lead_id: input.lead_id,
      log_type: 'info',
      step_type: input.step_type,
      action: `Queued ${input.step_type} step`,
      request_data: { input },
    });

    return data;
  }

  /**
   * Queue multiple steps (e.g., from a workflow)
   */
  static async queueMultipleSteps(steps: QueueStepInput[]): Promise<QueuedStep[]> {
    const results: QueuedStep[] = [];
    for (const step of steps) {
      const queued = await this.queueCampaignStep(step);
      results.push(queued);
    }
    return results;
  }

  /**
   * Get pending steps ready for execution using the database function
   */
  static async getPendingSteps(institutionId?: string, limit = 50): Promise<QueuedStep[]> {
    const { data, error } = await this.supabase
      .rpc('get_pending_campaign_steps', {
        p_institution_id: institutionId || null,
        p_limit: limit,
      });

    if (error) {
      console.error('[admission/campaign-processor] Failed to get pending steps:', error);
      throw new Error('Failed to get pending steps');
    }

    return data || [];
  }

  /**
   * Get all queued steps with filters
   */
  static async getQueuedSteps(filters: QueueFilters): Promise<{ data: QueuedStep[]; total: number }> {
    let query = this.supabase
      .from('admission_campaign_queue')
      .select('*', { count: 'exact' })
      .eq('institution_id', filters.institution_id)
      .order('priority', { ascending: false })
      .order('scheduled_at', { ascending: true });

    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.step_type) {
      query = query.eq('step_type', filters.step_type);
    }
    if (filters.workflow_id) {
      query = query.eq('workflow_id', filters.workflow_id);
    }
    if (filters.lead_id) {
      query = query.eq('lead_id', filters.lead_id);
    }
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[admission/campaign-processor] Failed to get queued steps:', error);
      throw new Error('Failed to get queued steps');
    }

    return { data: data || [], total: count || 0 };
  }

  /**
   * Claim a step for processing (atomic operation)
   */
  static async claimStep(queueId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .rpc('claim_campaign_step', { p_queue_id: queueId });

    if (error) {
      console.error('[admission/campaign-processor] Failed to claim step:', error);
      return false;
    }

    return data === true;
  }

  /**
   * Mark a step as completed
   */
  static async completeStep(
    queueId: string,
    success: boolean,
    errorMessage?: string,
    errorDetails?: Record<string, unknown>
  ): Promise<void> {
    const { error } = await this.supabase
      .rpc('complete_campaign_step', {
        p_queue_id: queueId,
        p_success: success,
        p_error_message: errorMessage || null,
        p_error_details: errorDetails || null,
      });

    if (error) {
      console.error('[admission/campaign-processor] Failed to complete step:', error);
      throw new Error('Failed to complete step');
    }
  }

  /**
   * Cancel a queued step
   */
  static async cancelStep(queueId: string, reason?: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_campaign_queue')
      .update({
        status: 'cancelled',
        error_message: reason || 'Cancelled by user',
        updated_at: new Date().toISOString(),
      })
      .eq('id', queueId);

    if (error) {
      console.error('[admission/campaign-processor] Failed to cancel step:', error);
      throw new Error('Failed to cancel step');
    }
  }

  /**
   * Skip a queued step
   */
  static async skipStep(queueId: string, reason?: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_campaign_queue')
      .update({
        status: 'skipped',
        error_message: reason || 'Skipped',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', queueId);

    if (error) {
      console.error('[admission/campaign-processor] Failed to skip step:', error);
      throw new Error('Failed to skip step');
    }
  }

  /**
   * Retry a failed step
   */
  static async retryStep(queueId: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_campaign_queue')
      .update({
        status: 'pending',
        error_message: null,
        error_details: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', queueId)
      .eq('status', 'failed');

    if (error) {
      console.error('[admission/campaign-processor] Failed to retry step:', error);
      throw new Error('Failed to retry step');
    }
  }

  // ============================================================================
  // PROCESSING METHODS
  // ============================================================================

  /**
   * Process pending steps (main processing loop method)
   * Returns number of steps processed
   */
  static async processPendingSteps(
    institutionId: string,
    processor: (step: QueuedStep) => Promise<{ success: boolean; error?: string; data?: unknown }>
  ): Promise<number> {
    const pendingSteps = await this.getPendingSteps(institutionId);
    let processedCount = 0;

    for (const step of pendingSteps) {
      const startTime = Date.now();

      // Try to claim the step
      const claimed = await this.claimStep(step.id);
      if (!claimed) {
        console.warn('[admission/campaign-processor] Could not claim step:', step.id);
        continue;
      }

      try {
        // Process the step
        const result = await processor(step);
        const duration = Date.now() - startTime;

        // Log the execution
        await this.logAction({
          institution_id: step.institution_id,
          queue_id: step.id,
          workflow_id: step.workflow_id || undefined,
          lead_id: step.lead_id || undefined,
          log_type: result.success ? 'success' : 'error',
          step_type: step.step_type,
          action: result.success
            ? `Successfully executed ${step.step_type}`
            : `Failed to execute ${step.step_type}: ${result.error}`,
          request_data: { step_config: step.step_config },
          response_data: result.data ? { data: result.data } : undefined,
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: duration,
        });

        // Mark as completed
        await this.completeStep(step.id, result.success, result.error);
        processedCount++;
      } catch (err) {
        const duration = Date.now() - startTime;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';

        await this.logAction({
          institution_id: step.institution_id,
          queue_id: step.id,
          workflow_id: step.workflow_id || undefined,
          lead_id: step.lead_id || undefined,
          log_type: 'error',
          step_type: step.step_type,
          action: `Exception during ${step.step_type}: ${errorMessage}`,
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: duration,
        });

        await this.completeStep(step.id, false, errorMessage);
      }
    }

    return processedCount;
  }

  /**
   * Get execution status for a workflow or lead
   */
  static async getExecutionStatus(
    institutionId: string,
    options: { workflowId?: string; leadId?: string; executionId?: string }
  ): Promise<{
    pending: number;
    running: number;
    completed: number;
    failed: number;
    steps: QueuedStep[];
  }> {
    let query = this.supabase
      .from('admission_campaign_queue')
      .select('*')
      .eq('institution_id', institutionId);

    if (options.workflowId) {
      query = query.eq('workflow_id', options.workflowId);
    }
    if (options.leadId) {
      query = query.eq('lead_id', options.leadId);
    }
    if (options.executionId) {
      query = query.eq('execution_id', options.executionId);
    }

    const { data, error } = await query.order('step_order', { ascending: true });

    if (error) {
      console.error('[admission/campaign-processor] Failed to get execution status:', error);
      throw new Error('Failed to get execution status');
    }

    const steps = data || [];
    return {
      pending: steps.filter((s: QueuedStep) => s.status === 'pending').length,
      running: steps.filter((s: QueuedStep) => s.status === 'running').length,
      completed: steps.filter((s: QueuedStep) => s.status === 'completed').length,
      failed: steps.filter((s: QueuedStep) => s.status === 'failed').length,
      steps,
    };
  }

  // ============================================================================
  // LOGGING METHODS
  // ============================================================================

  /**
   * Log a campaign action
   */
  static async logAction(input: {
    institution_id: string;
    queue_id?: string;
    workflow_id?: string;
    lead_id?: string;
    log_type: CampaignLogType;
    step_type?: CampaignStepType;
    action: string;
    request_data?: Record<string, unknown>;
    response_data?: Record<string, unknown>;
    started_at?: string;
    completed_at?: string;
    duration_ms?: number;
  }): Promise<CampaignLog> {
    const insertData: Record<string, unknown> = {
      institution_id: input.institution_id,
      log_type: input.log_type,
      action: input.action,
    };

    if (input.queue_id) insertData.queue_id = input.queue_id;
    if (input.workflow_id) insertData.workflow_id = input.workflow_id;
    if (input.lead_id) insertData.lead_id = input.lead_id;
    if (input.step_type) insertData.step_type = input.step_type;
    if (input.request_data) insertData.request_data = input.request_data;
    if (input.response_data) insertData.response_data = input.response_data;
    if (input.started_at) insertData.started_at = input.started_at;
    if (input.completed_at) insertData.completed_at = input.completed_at;
    if (input.duration_ms !== undefined) insertData.duration_ms = input.duration_ms;

    const { data, error } = await this.supabase
      .from('admission_campaign_logs')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.warn('[admission/campaign-processor] Failed to log action:', error);
      // Don't throw - logging failures shouldn't stop processing
      return {} as CampaignLog;
    }

    return data;
  }

  /**
   * Get campaign logs with filters
   */
  static async getLogs(filters: LogFilters): Promise<{ data: CampaignLog[]; total: number }> {
    let query = this.supabase
      .from('admission_campaign_logs')
      .select('*', { count: 'exact' })
      .eq('institution_id', filters.institution_id)
      .order('created_at', { ascending: false });

    if (filters.queue_id) {
      query = query.eq('queue_id', filters.queue_id);
    }
    if (filters.workflow_id) {
      query = query.eq('workflow_id', filters.workflow_id);
    }
    if (filters.lead_id) {
      query = query.eq('lead_id', filters.lead_id);
    }
    if (filters.log_type) {
      query = query.eq('log_type', filters.log_type);
    }
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[admission/campaign-processor] Failed to get logs:', error);
      throw new Error('Failed to get campaign logs');
    }

    return { data: data || [], total: count || 0 };
  }

  // ============================================================================
  // STATS & ANALYTICS
  // ============================================================================

  /**
   * Get queue statistics
   */
  static async getQueueStats(institutionId: string): Promise<QueueStats> {
    const { data, error } = await this.supabase
      .rpc('get_campaign_queue_stats', { p_institution_id: institutionId });

    if (error) {
      console.error('[admission/campaign-processor] Failed to get queue stats:', error);
      throw new Error('Failed to get queue stats');
    }

    if (!data || data.length === 0) {
      return {
        total_pending: 0,
        total_running: 0,
        total_completed: 0,
        total_failed: 0,
        completed_today: 0,
        failed_today: 0,
      };
    }

    return data[0];
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Calculate execute_after date for wait steps
   */
  static calculateExecuteAfter(stepType: CampaignStepType, config: CampaignStepConfig): Date | null {
    const now = new Date();

    if (stepType === 'wait_hours' && config.delay_hours) {
      return new Date(now.getTime() + config.delay_hours * 60 * 60 * 1000);
    }

    if (stepType === 'wait_days' && config.delay_days) {
      return new Date(now.getTime() + config.delay_days * 24 * 60 * 60 * 1000);
    }

    if (stepType === 'wait' && config.delay_minutes) {
      return new Date(now.getTime() + config.delay_minutes * 60 * 1000);
    }

    return null;
  }

  /**
   * Get available step types with descriptions
   */
  static getStepTypes(): { value: CampaignStepType; label: string; description: string; color: string }[] {
    return [
      { value: 'send_sms', label: 'Send SMS', description: 'Send an SMS message to the lead', color: 'bg-purple-500' },
      { value: 'send_email', label: 'Send Email', description: 'Send an email to the lead', color: 'bg-blue-500' },
      { value: 'send_whatsapp', label: 'Send WhatsApp', description: 'Send a WhatsApp message', color: 'bg-green-500' },
      { value: 'update_stage', label: 'Update Stage', description: 'Move lead to a different stage', color: 'bg-indigo-500' },
      { value: 'assign_counselor', label: 'Assign Counselor', description: 'Assign a counselor to the lead', color: 'bg-pink-500' },
      { value: 'add_tag', label: 'Add Tag', description: 'Add a tag to the lead', color: 'bg-teal-500' },
      { value: 'wait', label: 'Wait (Minutes)', description: 'Wait for specified minutes', color: 'bg-gray-500' },
      { value: 'wait_hours', label: 'Wait (Hours)', description: 'Wait for specified hours', color: 'bg-gray-500' },
      { value: 'wait_days', label: 'Wait (Days)', description: 'Wait for specified days', color: 'bg-gray-500' },
    ];
  }

  /**
   * Get available status types
   */
  static getStatusTypes(): { value: CampaignStepStatus; label: string; color: string }[] {
    return [
      { value: 'pending', label: 'Pending', color: 'bg-yellow-500' },
      { value: 'running', label: 'Running', color: 'bg-blue-500' },
      { value: 'completed', label: 'Completed', color: 'bg-green-500' },
      { value: 'failed', label: 'Failed', color: 'bg-red-500' },
      { value: 'skipped', label: 'Skipped', color: 'bg-gray-500' },
      { value: 'cancelled', label: 'Cancelled', color: 'bg-gray-400' },
    ];
  }
}
