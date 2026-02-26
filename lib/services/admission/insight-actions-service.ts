// lib/services/admission/insight-actions-service.ts
// Insight Actions Service - One-Click Actions from AI Insights

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export type InsightActionType =
  | 'notify_leads'
  | 'generate_report'
  | 'schedule_followups'
  | 'assign_counselor'
  | 'export_list'
  | 'create_campaign'
  | 'update_stage'
  | 'add_tag'
  | 'send_whatsapp'
  | 'send_email'
  | 'send_sms';

export type ActionStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';

export interface ActionParams {
  // For notify_leads / messaging actions
  template_id?: string;
  message?: string;
  channel?: 'whatsapp' | 'email' | 'sms';

  // For generate_report
  report_type?: 'leads' | 'performance' | 'conversion' | 'funnel';
  date_range?: { from: string; to: string };
  filters?: Record<string, unknown>;

  // For schedule_followups
  followup_date?: string;
  followup_type?: 'call' | 'email' | 'meeting' | 'whatsapp';
  task_description?: string;

  // For assign_counselor
  counselor_id?: string;
  assignment_reason?: string;

  // For export_list
  export_format?: 'csv' | 'xlsx' | 'pdf';
  columns?: string[];

  // For create_campaign
  campaign_name?: string;
  workflow_id?: string;
  drip_sequence_id?: string;

  // For update_stage
  new_stage?: string;
  stage_notes?: string;

  // For add_tag
  tag?: string;
  tags?: string[];
}

export interface ActionContext {
  institution_id: string;
  insight_id?: string;
  insight_type?: string;
  query_id?: string;
  source?: 'insight' | 'query' | 'manual' | 'ai_suggestion';
  user_id?: string;
}

export interface AvailableAction {
  type: InsightActionType;
  label: string;
  description: string;
  icon: string;
  color: string;
  requires_confirmation: boolean;
  supports_bulk: boolean;
  required_params: string[];
  optional_params: string[];
}

export interface ActionExecution {
  id: string;
  institution_id: string;
  action_type: InsightActionType;
  lead_ids: string[];
  params: ActionParams;
  context: ActionContext;
  status: ActionStatus;
  result: ActionResult | null;
  error_message: string | null;
  executed_by: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface ActionResult {
  success_count: number;
  failure_count: number;
  skipped_count: number;
  details: ActionResultDetail[];
  summary: string;
  artifacts?: ActionArtifact[];
}

export interface ActionResultDetail {
  lead_id: string;
  success: boolean;
  message?: string;
  error?: string;
}

export interface ActionArtifact {
  type: 'file' | 'link' | 'record';
  name: string;
  url?: string;
  record_id?: string;
  mime_type?: string;
}

export interface BulkActionInput {
  action_type: InsightActionType;
  lead_ids: string[];
  params: ActionParams;
  context: ActionContext;
}

export interface ActionFilters {
  institution_id: string;
  action_type?: InsightActionType;
  status?: ActionStatus;
  from_date?: string;
  to_date?: string;
  limit?: number;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class InsightActionsService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // AVAILABLE ACTIONS
  // ============================================================================

  /**
   * Get all available action types with metadata
   */
  static getAvailableActions(context?: ActionContext): AvailableAction[] {
    const allActions: AvailableAction[] = [
      {
        type: 'notify_leads',
        label: 'Notify Leads',
        description: 'Send a message to selected leads via their preferred channel',
        icon: 'bell',
        color: 'blue',
        requires_confirmation: true,
        supports_bulk: true,
        required_params: ['template_id'],
        optional_params: ['message', 'channel'],
      },
      {
        type: 'send_whatsapp',
        label: 'Send WhatsApp',
        description: 'Send a WhatsApp message to selected leads',
        icon: 'message-circle',
        color: 'green',
        requires_confirmation: true,
        supports_bulk: true,
        required_params: ['template_id'],
        optional_params: ['message'],
      },
      {
        type: 'send_email',
        label: 'Send Email',
        description: 'Send an email to selected leads',
        icon: 'mail',
        color: 'blue',
        requires_confirmation: true,
        supports_bulk: true,
        required_params: ['template_id'],
        optional_params: ['message'],
      },
      {
        type: 'send_sms',
        label: 'Send SMS',
        description: 'Send an SMS to selected leads',
        icon: 'phone',
        color: 'purple',
        requires_confirmation: true,
        supports_bulk: true,
        required_params: ['template_id'],
        optional_params: ['message'],
      },
      {
        type: 'generate_report',
        label: 'Generate Report',
        description: 'Create a PDF report with the selected data',
        icon: 'file-text',
        color: 'indigo',
        requires_confirmation: false,
        supports_bulk: true,
        required_params: ['report_type'],
        optional_params: ['date_range', 'filters'],
      },
      {
        type: 'schedule_followups',
        label: 'Schedule Follow-ups',
        description: 'Create follow-up tasks for selected leads',
        icon: 'calendar',
        color: 'orange',
        requires_confirmation: true,
        supports_bulk: true,
        required_params: ['followup_date', 'followup_type'],
        optional_params: ['task_description'],
      },
      {
        type: 'assign_counselor',
        label: 'Assign Counselor',
        description: 'Assign a counselor to selected leads',
        icon: 'user-plus',
        color: 'pink',
        requires_confirmation: true,
        supports_bulk: true,
        required_params: ['counselor_id'],
        optional_params: ['assignment_reason'],
      },
      {
        type: 'export_list',
        label: 'Export List',
        description: 'Download selected leads as a file',
        icon: 'download',
        color: 'gray',
        requires_confirmation: false,
        supports_bulk: true,
        required_params: [],
        optional_params: ['export_format', 'columns'],
      },
      {
        type: 'create_campaign',
        label: 'Start Campaign',
        description: 'Start a drip campaign for selected leads',
        icon: 'zap',
        color: 'yellow',
        requires_confirmation: true,
        supports_bulk: true,
        required_params: ['workflow_id'],
        optional_params: ['campaign_name'],
      },
      {
        type: 'update_stage',
        label: 'Update Stage',
        description: 'Move selected leads to a new funnel stage',
        icon: 'arrow-right',
        color: 'teal',
        requires_confirmation: true,
        supports_bulk: true,
        required_params: ['new_stage'],
        optional_params: ['stage_notes'],
      },
      {
        type: 'add_tag',
        label: 'Add Tag',
        description: 'Add a tag to selected leads',
        icon: 'tag',
        color: 'emerald',
        requires_confirmation: false,
        supports_bulk: true,
        required_params: ['tag'],
        optional_params: ['tags'],
      },
    ];

    // Filter based on context if provided
    if (context?.source === 'insight') {
      // For insights, show all actions
      return allActions;
    }

    if (context?.source === 'query') {
      // For agentic queries, focus on data actions
      return allActions.filter(a =>
        ['export_list', 'generate_report', 'notify_leads', 'schedule_followups', 'assign_counselor'].includes(a.type)
      );
    }

    return allActions;
  }

  /**
   * Get action metadata by type
   */
  static getActionMetadata(actionType: InsightActionType): AvailableAction | null {
    const actions = this.getAvailableActions();
    return actions.find(a => a.type === actionType) || null;
  }

  // ============================================================================
  // ACTION EXECUTION
  // ============================================================================

  /**
   * Execute a single action on one lead
   */
  static async executeAction(
    actionType: InsightActionType,
    leadId: string,
    params: ActionParams,
    context: ActionContext
  ): Promise<ActionExecution> {
    return this.executeBulkAction(actionType, [leadId], params, context);
  }

  /**
   * Execute a bulk action on multiple leads
   */
  static async executeBulkAction(
    actionType: InsightActionType,
    leadIds: string[],
    params: ActionParams,
    context: ActionContext
  ): Promise<ActionExecution> {
    // Create execution record
    const executionId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    // Insert execution record with pending status
    const { data: execution, error: insertError } = await this.supabase
      .from('admission_action_executions')
      .insert({
        id: executionId,
        institution_id: context.institution_id,
        action_type: actionType,
        lead_ids: leadIds,
        params,
        context,
        status: 'executing',
        started_at: startedAt,
        executed_by: context.user_id || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[admission/insight-actions] Failed to create execution record:', insertError);
      throw new Error('Failed to start action execution');
    }

    try {
      // Execute the action
      const result = await this.performAction(actionType, leadIds, params, context);

      // Update execution with result
      const { data: updatedExecution, error: updateError } = await this.supabase
        .from('admission_action_executions')
        .update({
          status: 'completed',
          result,
          completed_at: new Date().toISOString(),
        })
        .eq('id', executionId)
        .select()
        .single();

      if (updateError) {
        console.warn('[admission/insight-actions] Failed to update execution status:', updateError);
      }

      return updatedExecution || { ...execution, status: 'completed', result };
    } catch (error) {
      // Update execution with error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      await this.supabase
        .from('admission_action_executions')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', executionId);

      console.error('[admission/insight-actions] Action execution failed:', error);
      throw error;
    }
  }

  /**
   * Perform the actual action logic
   */
  private static async performAction(
    actionType: InsightActionType,
    leadIds: string[],
    params: ActionParams,
    context: ActionContext
  ): Promise<ActionResult> {
    const details: ActionResultDetail[] = [];
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;
    const artifacts: ActionArtifact[] = [];

    switch (actionType) {
      case 'notify_leads':
      case 'send_whatsapp':
      case 'send_email':
      case 'send_sms':
        // Queue messages for each lead
        for (const leadId of leadIds) {
          try {
            await this.queueNotification(leadId, actionType, params, context);
            details.push({ lead_id: leadId, success: true, message: 'Message queued' });
            successCount++;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Failed to queue message';
            details.push({ lead_id: leadId, success: false, error: errorMsg });
            failureCount++;
          }
        }
        break;

      case 'schedule_followups':
        // Create follow-up tasks
        for (const leadId of leadIds) {
          try {
            await this.createFollowupTask(leadId, params, context);
            details.push({ lead_id: leadId, success: true, message: 'Follow-up scheduled' });
            successCount++;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Failed to schedule follow-up';
            details.push({ lead_id: leadId, success: false, error: errorMsg });
            failureCount++;
          }
        }
        break;

      case 'assign_counselor':
        // Assign counselor to leads
        for (const leadId of leadIds) {
          try {
            await this.assignCounselor(leadId, params.counselor_id!, context);
            details.push({ lead_id: leadId, success: true, message: 'Counselor assigned' });
            successCount++;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Failed to assign counselor';
            details.push({ lead_id: leadId, success: false, error: errorMsg });
            failureCount++;
          }
        }
        break;

      case 'update_stage':
        // Update stage for all leads
        for (const leadId of leadIds) {
          try {
            await this.updateLeadStage(leadId, params.new_stage!, params.stage_notes, context);
            details.push({ lead_id: leadId, success: true, message: `Stage updated to ${params.new_stage}` });
            successCount++;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Failed to update stage';
            details.push({ lead_id: leadId, success: false, error: errorMsg });
            failureCount++;
          }
        }
        break;

      case 'add_tag':
        // Add tag to leads
        const tagsToAdd = params.tags || (params.tag ? [params.tag] : []);
        for (const leadId of leadIds) {
          try {
            await this.addTagsToLead(leadId, tagsToAdd, context);
            details.push({ lead_id: leadId, success: true, message: `Tags added: ${tagsToAdd.join(', ')}` });
            successCount++;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Failed to add tags';
            details.push({ lead_id: leadId, success: false, error: errorMsg });
            failureCount++;
          }
        }
        break;

      case 'export_list':
        // Export leads to file
        try {
          const exportResult = await this.exportLeads(leadIds, params, context);
          artifacts.push({
            type: 'file',
            name: exportResult.filename,
            url: exportResult.url,
            mime_type: exportResult.mimeType,
          });
          successCount = leadIds.length;
          details.push({ lead_id: 'bulk', success: true, message: `Exported ${leadIds.length} leads` });
        } catch (error) {
          failureCount = leadIds.length;
          const errorMsg = error instanceof Error ? error.message : 'Failed to export';
          details.push({ lead_id: 'bulk', success: false, error: errorMsg });
        }
        break;

      case 'generate_report':
        // Generate report
        try {
          const reportResult = await this.generateReport(leadIds, params, context);
          artifacts.push({
            type: 'file',
            name: reportResult.filename,
            url: reportResult.url,
            mime_type: 'application/pdf',
          });
          successCount = 1;
          details.push({ lead_id: 'report', success: true, message: 'Report generated' });
        } catch (error) {
          failureCount = 1;
          const errorMsg = error instanceof Error ? error.message : 'Failed to generate report';
          details.push({ lead_id: 'report', success: false, error: errorMsg });
        }
        break;

      case 'create_campaign':
        // Start drip campaign for leads
        try {
          const campaignResult = await this.startCampaign(leadIds, params, context);
          successCount = campaignResult.enrolled;
          skippedCount = campaignResult.skipped;
          failureCount = campaignResult.failed;
          artifacts.push({
            type: 'record',
            name: params.campaign_name || 'Campaign',
            record_id: campaignResult.campaignId,
          });
          details.push({
            lead_id: 'campaign',
            success: true,
            message: `Campaign started with ${campaignResult.enrolled} leads`
          });
        } catch (error) {
          failureCount = leadIds.length;
          const errorMsg = error instanceof Error ? error.message : 'Failed to start campaign';
          details.push({ lead_id: 'campaign', success: false, error: errorMsg });
        }
        break;

      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }

    const summary = this.generateSummary(actionType, successCount, failureCount, skippedCount);

    return {
      success_count: successCount,
      failure_count: failureCount,
      skipped_count: skippedCount,
      details,
      summary,
      artifacts: artifacts.length > 0 ? artifacts : undefined,
    };
  }

  // ============================================================================
  // ACTION IMPLEMENTATIONS
  // ============================================================================

  private static async queueNotification(
    leadId: string,
    actionType: InsightActionType,
    params: ActionParams,
    context: ActionContext
  ): Promise<void> {
    // Determine channel
    const channel = actionType === 'send_whatsapp' ? 'whatsapp'
      : actionType === 'send_email' ? 'email'
      : actionType === 'send_sms' ? 'sms'
      : params.channel || 'whatsapp';

    // Queue the message using the campaign processor
    await this.supabase
      .from('admission_campaign_step_queue')
      .insert({
        institution_id: context.institution_id,
        lead_id: leadId,
        step_type: `send_${channel}`,
        step_config: {
          template_id: params.template_id,
          message: params.message,
        },
        status: 'pending',
        scheduled_at: new Date().toISOString(),
      });
  }

  private static async createFollowupTask(
    leadId: string,
    params: ActionParams,
    context: ActionContext
  ): Promise<void> {
    // Create an activity record for the follow-up
    await this.supabase
      .from('admission_lead_activities')
      .insert({
        lead_id: leadId,
        institution_id: context.institution_id,
        activity_type: params.followup_type || 'call',
        title: 'Scheduled Follow-up',
        description: params.task_description || 'Follow-up from AI insight action',
        metadata: { scheduled_at: params.followup_date },
        performed_by: context.user_id,
      });

    // FIX: next_followup_date does not exist in DB → update last_contact_at instead
    // The follow-up is tracked via the activity record above, not a lead column
    await this.supabase
      .from('admission_leads')
      .update({
        last_contact_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);
  }

  private static async assignCounselor(
    leadId: string,
    counselorId: string,
    context: ActionContext
  ): Promise<void> {
    // FIX: assigned_to does not exist in DB → use counselor_id
    await this.supabase
      .from('admission_leads')
      .update({
        counselor_id: counselorId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    // Log the assignment activity
    await this.supabase
      .from('admission_lead_activities')
      .insert({
        lead_id: leadId,
        institution_id: context.institution_id,
        activity_type: 'task',
        title: 'Counselor Assignment',
        description: `Lead assigned via AI insight action`,
        metadata: {},
        performed_by: context.user_id,
      });
  }

  private static async updateLeadStage(
    leadId: string,
    newStage: string,
    notes: string | undefined,
    context: ActionContext
  ): Promise<void> {
    // Get current stage first
    const { data: lead } = await this.supabase
      .from('admission_leads')
      .select('funnel_stage')
      .eq('id', leadId)
      .single();

    const fromStage = lead?.funnel_stage;

    // Update the lead stage
    await this.supabase
      .from('admission_leads')
      .update({
        funnel_stage: newStage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    // Log stage change
    await this.supabase
      .from('admission_lead_stage_history')
      .insert({
        lead_id: leadId,
        from_stage: fromStage,
        to_stage: newStage,
        changed_by: context.user_id,
        notes: notes || 'Stage updated via AI insight action',
      });
  }

  private static async addTagsToLead(
    leadId: string,
    tags: string[],
    _context: ActionContext
  ): Promise<void> {
    // Get current tags
    const { data: lead } = await this.supabase
      .from('admission_leads')
      .select('tags')
      .eq('id', leadId)
      .single();

    const currentTags: string[] = lead?.tags || [];
    const newTags = Array.from(new Set([...currentTags, ...tags]));

    await this.supabase
      .from('admission_leads')
      .update({
        tags: newTags,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);
  }

  private static async exportLeads(
    leadIds: string[],
    params: ActionParams,
    context: ActionContext
  ): Promise<{ filename: string; url: string; mimeType: string }> {
    // Fetch lead data
    // FIX: program_interested → interested_programs, priority → is_hot_lead/is_priority,
    // next_followup_date does not exist → use last_contact_at
    const { data: leads, error } = await this.supabase
      .from('admission_leads')
      .select(`
        id,
        full_name,
        email,
        phone,
        funnel_stage,
        source,
        interested_programs,
        score,
        is_hot_lead,
        is_priority,
        created_at,
        last_contact_at
      `)
      .in('id', leadIds);

    if (error) {
      throw new Error('Failed to fetch leads for export');
    }

    // Generate CSV content
    const format = params.export_format || 'csv';
    const columns = params.columns || [
      'full_name', 'email', 'phone', 'funnel_stage',
      'source', 'interested_programs', 'score', 'is_hot_lead'
    ];

    const header = columns.join(',');
    const rows = (leads || []).map((lead: Record<string, unknown>) =>
      columns.map(col => `"${(lead[col] ?? '').toString().replace(/"/g, '""')}"`).join(',')
    );
    const csvContent = [header, ...rows].join('\n');

    // Store in Supabase storage
    const filename = `leads_export_${new Date().toISOString().split('T')[0]}_${context.institution_id.slice(0, 8)}.${format}`;

    const { error: uploadError } = await this.supabase.storage
      .from('exports')
      .upload(`admission/${context.institution_id}/${filename}`, csvContent, {
        contentType: 'text/csv',
        upsert: true,
      });

    if (uploadError) {
      console.warn('[admission/insight-actions] Upload error:', uploadError);
      // Return a placeholder for now
      return {
        filename,
        url: `/api/exports/${filename}`,
        mimeType: 'text/csv',
      };
    }

    const { data: urlData } = this.supabase.storage
      .from('exports')
      .getPublicUrl(`admission/${context.institution_id}/${filename}`);

    return {
      filename,
      url: urlData?.publicUrl || `/api/exports/${filename}`,
      mimeType: format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv',
    };
  }

  private static async generateReport(
    leadIds: string[],
    params: ActionParams,
    context: ActionContext
  ): Promise<{ filename: string; url: string }> {
    // This would typically call a report generation service
    // For now, we'll create a simple summary
    const reportType = params.report_type || 'leads';
    const filename = `${reportType}_report_${new Date().toISOString().split('T')[0]}.pdf`;

    // In a real implementation, this would:
    // 1. Fetch required data
    // 2. Generate PDF using a library like pdfkit or puppeteer
    // 3. Store in Supabase storage
    // 4. Return the URL

    return {
      filename,
      url: `/api/reports/generate?type=${reportType}&leads=${leadIds.join(',')}`,
    };
  }

  private static async startCampaign(
    leadIds: string[],
    params: ActionParams,
    context: ActionContext
  ): Promise<{ campaignId: string; enrolled: number; skipped: number; failed: number }> {
    // Start drip sequence for each lead
    let enrolled = 0;
    let skipped = 0;
    let failed = 0;

    const campaignId = crypto.randomUUID();

    for (const leadId of leadIds) {
      try {
        // Check if lead is already in an active sequence
        const { data: existingRows } = await this.supabase
          .from('admission_drip_sequences')
          .select('id')
          .eq('lead_id', leadId)
          .eq('status', 'active')
          .limit(1);

        const existing = existingRows?.[0];

        if (existing) {
          skipped++;
          continue;
        }

        // Enroll in drip sequence
        await this.supabase
          .from('admission_drip_sequences')
          .insert({
            lead_id: leadId,
            workflow_id: params.workflow_id,
            institution_id: context.institution_id,
            status: 'active',
            current_step_index: 0,
            total_steps: 5, // This would be fetched from workflow
            started_at: new Date().toISOString(),
          });

        enrolled++;
      } catch (error) {
        console.warn('[admission/insight-actions] Failed to enroll lead in campaign:', error);
        failed++;
      }
    }

    return { campaignId, enrolled, skipped, failed };
  }

  private static generateSummary(
    actionType: InsightActionType,
    success: number,
    failed: number,
    skipped: number
  ): string {
    const actionLabels: Record<InsightActionType, string> = {
      notify_leads: 'notifications queued',
      send_whatsapp: 'WhatsApp messages queued',
      send_email: 'emails queued',
      send_sms: 'SMS messages queued',
      schedule_followups: 'follow-ups scheduled',
      assign_counselor: 'leads assigned',
      update_stage: 'stages updated',
      add_tag: 'tags added',
      export_list: 'leads exported',
      generate_report: 'report generated',
      create_campaign: 'leads enrolled in campaign',
    };

    const label = actionLabels[actionType] || 'actions completed';

    const parts: string[] = [];
    if (success > 0) parts.push(`${success} ${label}`);
    if (failed > 0) parts.push(`${failed} failed`);
    if (skipped > 0) parts.push(`${skipped} skipped`);

    return parts.join(', ') || 'No actions performed';
  }

  // ============================================================================
  // EXECUTION TRACKING
  // ============================================================================

  /**
   * Track action execution (for analytics)
   */
  static async trackActionExecution(
    executionId: string,
    result: ActionResult
  ): Promise<void> {
    await this.supabase
      .from('admission_action_executions')
      .update({
        status: result.failure_count === 0 ? 'completed' : 'completed',
        result,
        completed_at: new Date().toISOString(),
      })
      .eq('id', executionId);
  }

  /**
   * Get action execution history
   */
  static async getActionHistory(filters: ActionFilters): Promise<ActionExecution[]> {
    let query = this.supabase
      .from('admission_action_executions')
      .select('*')
      .eq('institution_id', filters.institution_id)
      .order('created_at', { ascending: false });

    if (filters.action_type) {
      query = query.eq('action_type', filters.action_type);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.from_date) {
      query = query.gte('created_at', filters.from_date);
    }
    if (filters.to_date) {
      query = query.lte('created_at', filters.to_date);
    }
    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admission/insight-actions] Failed to fetch action history:', error);
      throw new Error('Failed to fetch action history');
    }

    return data || [];
  }

  /**
   * Get a single execution by ID
   */
  static async getExecution(executionId: string): Promise<ActionExecution | null> {
    const { data, error } = await this.supabase
      .from('admission_action_executions')
      .select('*')
      .eq('id', executionId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[admission/insight-actions] Failed to fetch execution:', error);
      throw new Error('Failed to fetch execution');
    }

    return data || null;
  }

  /**
   * Cancel a pending or executing action
   */
  static async cancelExecution(executionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_action_executions')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      })
      .eq('id', executionId)
      .in('status', ['pending', 'executing']);

    if (error) {
      console.error('[admission/insight-actions] Failed to cancel execution:', error);
      throw new Error('Failed to cancel execution');
    }
  }
}
