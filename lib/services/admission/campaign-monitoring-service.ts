// lib/services/admission/campaign-monitoring-service.ts
// Campaign Monitoring Service - Real-time campaign stats and execution tracking
//
// Rewrites against the REAL drip/campaign tables on prod:
//   - admission_drip_sequences   (per-lead sequence runs, with status + step progress)
//   - admission_drip_schedule    (per-step queue inside a sequence; gives nextActionAt)
//   - admission_drip_execution_logs (event log for each sequence)
//   - admission_campaign_logs    (per-action send/delivery log; source of delivery metrics)
//   - admission_campaign_queue   (per-step queue for non-drip campaign runs)
//
// Earlier this service queried `re_engagement_campaigns` (table does NOT exist on prod, error 42P01)
// and `admission_workflow_executions` (exists but always empty). Both have been removed.
//
// Super-admin support: when `institutionId` is undefined, the service skips the `.eq('institution_id', ...)`
// filter so super_admin (who legitimately has cross-institution view) sees all institutions.
// RLS on these tables already enforces:
//   is_super_admin() OR is_admin() OR (perm AND role_has_institution_access(institution_id))
// so the service does not need to second-guess access — it just doesn't pre-filter.

import { createClientSupabaseClient } from '@/lib/supabase/client';

type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';

// ============================================================================
// PUBLIC TYPES (these are consumed by components — do NOT change shape)
// ============================================================================

export interface CampaignStats {
  totalCampaigns: number;
  activeCampaigns: number;
  completedCampaigns: number;
  pausedCampaigns: number;
  draftCampaigns: number;
  totalLeadsTargeted: number;
  totalLeadsReEngaged: number;
  totalLeadsConverted: number;
  conversionRate: number;
}

export interface DeliveryMetrics {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
  deliveryRate: number;
  readRate: number;
}

export interface ActiveSequence {
  id: string;
  campaignId: string;
  campaignName: string;
  leadId: string;
  leadName: string;
  currentStep: number;
  totalSteps: number;
  stepProgress: number;
  nextActionAt: string | null;
  status: 'in_progress' | 'paused' | 'completed' | 'failed';
  startedAt: string;
}

export interface ExecutionLog {
  id: string;
  timestamp: string;
  campaignId: string;
  campaignName: string;
  leadId: string | null;
  leadName: string | null;
  actionType:
    | 'send_whatsapp'
    | 'send_email'
    | 'send_sms'
    | 'stage_update'
    | 'task_created'
    | 'sequence_started'
    | 'sequence_completed'
    | 'sequence_failed';
  status: 'success' | 'failed' | 'pending';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface CampaignDetail {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  startDate: string | null;
  endDate: string | null;
  targetCriteria: Record<string, unknown>;
  sequence: SequenceStep[];
  totalLeadsTargeted: number;
  leadsReEngaged: number;
  leadsConverted: number;
  maxLeadsPerDay: number | null;
  sendTime: string | null;
  sendTimezone: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface SequenceStep {
  id: string;
  order: number;
  type: 'whatsapp' | 'email' | 'sms' | 'wait';
  templateId?: string;
  templateName?: string;
  waitDays?: number;
  waitHours?: number;
  config?: Record<string, unknown>;
}

export interface RealtimeUpdate {
  type: 'campaign_status_changed' | 'execution_completed' | 'stats_updated';
  campaignId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// Helper to get supabase client (avoids deep type inference issues for tables not yet in types/supabase.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = (): any => createClientSupabaseClient();

// Map drip-sequence DB statuses to our public ActiveSequence status union.
function mapSequenceStatus(status: string | null | undefined): ActiveSequence['status'] {
  switch (status) {
    case 'active':
    case 'running':
      return 'in_progress';
    case 'paused':
      return 'paused';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'cancelled':
      return 'failed';
    default:
      return 'in_progress';
  }
}

export class CampaignMonitoringService {
  // ============================================================================
  // CAMPAIGN STATS
  // ============================================================================

  /**
   * Aggregate stats over `admission_drip_sequences`.
   *
   * - totalCampaigns      = count of distinct workflow_id values seen
   *                         (each workflow = one "campaign" the user launched)
   * - activeCampaigns     = sequences with status='active'
   * - completedCampaigns  = sequences with status='completed'
   * - pausedCampaigns     = sequences with status='paused'
   * - draftCampaigns      = always 0 today; drafts live in admission_workflows, not in
   *                         admission_drip_sequences (sequences only exist once a workflow is run).
   * - totalLeadsTargeted  = count of distinct lead_id values
   * - totalLeadsReEngaged = leads that completed at least one step (current_step_index > 0)
   * - totalLeadsConverted = leads whose sequence completed successfully
   * - conversionRate      = totalLeadsConverted / totalLeadsReEngaged * 100
   *
   * When institutionId is undefined (super_admin), no .eq() filter is applied
   * and RLS handles cross-institution visibility.
   */
  static async getCampaignStats(institutionId?: string): Promise<CampaignStats> {
    let query = getSupabase()
      .from('admission_drip_sequences')
      .select('status, lead_id, workflow_id, current_step_index');

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data: sequences, error } = await query;

    if (error) {
      console.error('[admission/campaign-monitoring] Failed to fetch campaign stats:', error);
      throw new Error('Failed to fetch campaign stats');
    }

    const stats: CampaignStats = {
      totalCampaigns: 0,
      activeCampaigns: 0,
      completedCampaigns: 0,
      pausedCampaigns: 0,
      draftCampaigns: 0,
      totalLeadsTargeted: 0,
      totalLeadsReEngaged: 0,
      totalLeadsConverted: 0,
      conversionRate: 0,
    };

    const distinctWorkflows = new Set<string>();
    const distinctLeads = new Set<string>();
    let leadsReEngaged = 0;
    let leadsCompleted = 0;

    for (const seq of (sequences || []) as Array<{
      status: string | null;
      lead_id: string | null;
      workflow_id: string | null;
      current_step_index: number | null;
    }>) {
      if (seq.workflow_id) distinctWorkflows.add(seq.workflow_id);
      if (seq.lead_id) distinctLeads.add(seq.lead_id);

      switch (seq.status) {
        case 'active':
        case 'running':
          stats.activeCampaigns++;
          break;
        case 'completed':
          stats.completedCampaigns++;
          leadsCompleted++;
          break;
        case 'paused':
          stats.pausedCampaigns++;
          break;
      }

      if ((seq.current_step_index ?? 0) > 0) {
        leadsReEngaged++;
      }
    }

    stats.totalCampaigns = distinctWorkflows.size;
    stats.totalLeadsTargeted = distinctLeads.size;
    stats.totalLeadsReEngaged = leadsReEngaged;
    stats.totalLeadsConverted = leadsCompleted;

    if (stats.totalLeadsReEngaged > 0) {
      stats.conversionRate = (stats.totalLeadsConverted / stats.totalLeadsReEngaged) * 100;
    }

    return stats;
  }

  // ============================================================================
  // DELIVERY METRICS
  // ============================================================================

  /**
   * Real delivery metrics from `admission_campaign_logs`.
   *
   * - sent      = log rows whose action is a send_email/send_whatsapp/send_sms
   * - delivered = sent rows that completed successfully (completed_at IS NOT NULL
   *               AND response_data.status != 'failed')
   * - failed    = response_data.status = 'failed'
   * - pending   = completed_at IS NULL (still in flight)
   * - read      = ONLY counted from real webhook data in response_data.read = true
   *               (NO synthetic / Math.random simulation — if no webhook data, this stays 0)
   *
   * deliveryRate = delivered / sent * 100
   * readRate     = read / delivered * 100
   */
  static async getDeliveryMetrics(institutionId?: string): Promise<DeliveryMetrics> {
    let query = getSupabase()
      .from('admission_campaign_logs')
      .select('action, completed_at, response_data')
      .order('started_at', { ascending: false })
      .limit(2000);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error('[admission/campaign-monitoring] Failed to fetch delivery metrics:', error);
      // Hard zero rather than throw — dashboard should still render the empty state.
      return {
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        pending: 0,
        deliveryRate: 0,
        readRate: 0,
      };
    }

    const SEND_ACTIONS = new Set(['send_email', 'send_whatsapp', 'send_sms']);

    let sent = 0;
    let delivered = 0;
    let read = 0;
    let failed = 0;
    let pending = 0;

    for (const log of (logs || []) as Array<{
      action: string | null;
      completed_at: string | null;
      response_data: Record<string, unknown> | null;
    }>) {
      const isSend = log.action ? SEND_ACTIONS.has(log.action) : false;
      if (!isSend) continue;

      sent++;

      const responseStatus =
        log.response_data && typeof log.response_data === 'object'
          ? (log.response_data as Record<string, unknown>)['status']
          : undefined;
      const responseRead =
        log.response_data && typeof log.response_data === 'object'
          ? (log.response_data as Record<string, unknown>)['read']
          : undefined;

      if (responseStatus === 'failed') {
        failed++;
      } else if (log.completed_at) {
        delivered++;
        if (responseRead === true) {
          read++;
        }
      } else {
        pending++;
      }
    }

    const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;
    const readRate = delivered > 0 ? (read / delivered) * 100 : 0;

    return {
      sent,
      delivered,
      read,
      failed,
      pending,
      deliveryRate,
      readRate,
    };
  }

  // ============================================================================
  // ACTIVE SEQUENCES
  // ============================================================================

  /**
   * List in-flight drip sequences with their progress.
   *
   * - Pulls active+paused sequences from admission_drip_sequences
   * - For each sequence, looks up the next pending step in admission_drip_schedule
   *   (earliest scheduled_at where status = 'pending') for nextActionAt
   * - Joins admission_leads for the display name (uses admission_leads.full_name,
   *   falling back to first_name + last_name)
   *
   * Limits to 50 sequences to keep the dashboard snappy. The full list lives behind
   * the "Manage" button.
   */
  static async getActiveSequences(institutionId?: string): Promise<ActiveSequence[]> {
    let query = getSupabase()
      .from('admission_drip_sequences')
      .select(
        `
        id,
        workflow_id,
        lead_id,
        status,
        current_step_index,
        total_steps,
        started_at,
        institution_id
      `
      )
      .in('status', ['active', 'running', 'paused'])
      .order('started_at', { ascending: false })
      .limit(50);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data: sequences, error } = await query;

    if (error) {
      console.error('[admission/campaign-monitoring] Failed to fetch active sequences:', error);
      throw new Error('Failed to fetch active sequences');
    }

    const rows = (sequences || []) as Array<{
      id: string;
      workflow_id: string | null;
      lead_id: string | null;
      status: string | null;
      current_step_index: number | null;
      total_steps: number | null;
      started_at: string | null;
    }>;

    if (rows.length === 0) return [];

    // Resolve workflow names + lead names in parallel.
    const workflowIds = Array.from(new Set(rows.map((r) => r.workflow_id).filter(Boolean) as string[]));
    const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter(Boolean) as string[]));
    const sequenceIds = rows.map((r) => r.id);

    const [workflowsRes, leadsRes, scheduleRes] = await Promise.all([
      workflowIds.length > 0
        ? getSupabase()
            .from('admission_workflows')
            .select('id, name')
            .in('id', workflowIds)
        : Promise.resolve({ data: [], error: null }),
      leadIds.length > 0
        ? getSupabase()
            .from('admission_leads')
            .select('id, full_name, first_name, last_name')
            .in('id', leadIds)
        : Promise.resolve({ data: [], error: null }),
      getSupabase()
        .from('admission_drip_schedule')
        .select('sequence_id, scheduled_at, status')
        .in('sequence_id', sequenceIds)
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true }),
    ]);

    const workflowNameById = new Map<string, string>();
    for (const w of (workflowsRes.data || []) as Array<{ id: string; name: string | null }>) {
      workflowNameById.set(w.id, w.name || 'Unnamed Campaign');
    }

    const leadNameById = new Map<string, string>();
    for (const l of (leadsRes.data || []) as Array<{
      id: string;
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
    }>) {
      const name =
        l.full_name ||
        [l.first_name, l.last_name].filter(Boolean).join(' ').trim() ||
        'Unknown Lead';
      leadNameById.set(l.id, name);
    }

    // First pending step per sequence (earliest scheduled_at).
    const nextStepBySequence = new Map<string, string | null>();
    for (const s of (scheduleRes.data || []) as Array<{
      sequence_id: string;
      scheduled_at: string | null;
    }>) {
      if (!nextStepBySequence.has(s.sequence_id)) {
        nextStepBySequence.set(s.sequence_id, s.scheduled_at);
      }
    }

    return rows.map((seq) => {
      const totalSteps = seq.total_steps ?? 0;
      const currentStep = seq.current_step_index ?? 0;
      const stepProgress = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

      return {
        id: seq.id,
        campaignId: seq.workflow_id || '',
        campaignName: seq.workflow_id ? workflowNameById.get(seq.workflow_id) || 'Unnamed Campaign' : 'Unnamed Campaign',
        leadId: seq.lead_id || '',
        leadName: seq.lead_id ? leadNameById.get(seq.lead_id) || 'Unknown Lead' : 'Unknown Lead',
        currentStep,
        totalSteps,
        stepProgress,
        nextActionAt: nextStepBySequence.get(seq.id) ?? null,
        status: mapSequenceStatus(seq.status),
        startedAt: seq.started_at || new Date().toISOString(),
      };
    });
  }

  // ============================================================================
  // EXECUTION LOGS
  // ============================================================================

  /**
   * Recent execution events from admission_drip_execution_logs (per-event audit trail).
   *
   * Joins:
   *   - admission_drip_sequences (to filter by institution + get workflow_id + lead_id)
   *   - admission_workflows (campaign name)
   *   - admission_leads (lead name)
   *
   * NO mock data fallback. If the table is empty, the result is [] — the page handles
   * that with the proper empty state.
   */
  static async getExecutionLogs(institutionId?: string, limit = 50): Promise<ExecutionLog[]> {
    // Fetch raw event rows with sequence linkage.
    const { data: events, error } = await getSupabase()
      .from('admission_drip_execution_logs')
      .select(
        `
        id,
        sequence_id,
        event_type,
        event_data,
        created_at
      `
      )
      .order('created_at', { ascending: false })
      .limit(limit * 4); // over-fetch then filter by institution if needed

    if (error) {
      console.error('[admission/campaign-monitoring] Failed to fetch execution logs:', error);
      return [];
    }

    const rawEvents = (events || []) as Array<{
      id: string;
      sequence_id: string | null;
      event_type: string | null;
      event_data: Record<string, unknown> | null;
      created_at: string | null;
    }>;

    if (rawEvents.length === 0) return [];

    // Hydrate sequences for each event so we can scope by institution + show campaign/lead names.
    const sequenceIds = Array.from(new Set(rawEvents.map((e) => e.sequence_id).filter(Boolean) as string[]));
    if (sequenceIds.length === 0) return [];

    let seqQuery = getSupabase()
      .from('admission_drip_sequences')
      .select('id, workflow_id, lead_id, institution_id')
      .in('id', sequenceIds);
    if (institutionId) {
      seqQuery = seqQuery.eq('institution_id', institutionId);
    }
    const { data: sequences } = await seqQuery;

    const seqMap = new Map<
      string,
      { workflow_id: string | null; lead_id: string | null; institution_id: string | null }
    >();
    for (const s of (sequences || []) as Array<{
      id: string;
      workflow_id: string | null;
      lead_id: string | null;
      institution_id: string | null;
    }>) {
      seqMap.set(s.id, { workflow_id: s.workflow_id, lead_id: s.lead_id, institution_id: s.institution_id });
    }

    // Filter events to only those whose sequence is visible (RLS-scoped or institution-scoped).
    const scopedEvents = rawEvents.filter((e) => e.sequence_id && seqMap.has(e.sequence_id));
    if (scopedEvents.length === 0) return [];

    const workflowIds = Array.from(
      new Set(
        scopedEvents
          .map((e) => seqMap.get(e.sequence_id!)?.workflow_id)
          .filter(Boolean) as string[]
      )
    );
    const leadIds = Array.from(
      new Set(
        scopedEvents
          .map((e) => seqMap.get(e.sequence_id!)?.lead_id)
          .filter(Boolean) as string[]
      )
    );

    const [workflowsRes, leadsRes] = await Promise.all([
      workflowIds.length > 0
        ? getSupabase().from('admission_workflows').select('id, name').in('id', workflowIds)
        : Promise.resolve({ data: [], error: null }),
      leadIds.length > 0
        ? getSupabase()
            .from('admission_leads')
            .select('id, full_name, first_name, last_name')
            .in('id', leadIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const workflowNameById = new Map<string, string>();
    for (const w of (workflowsRes.data || []) as Array<{ id: string; name: string | null }>) {
      workflowNameById.set(w.id, w.name || 'Unnamed Campaign');
    }
    const leadNameById = new Map<string, string>();
    for (const l of (leadsRes.data || []) as Array<{
      id: string;
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
    }>) {
      const name =
        l.full_name ||
        [l.first_name, l.last_name].filter(Boolean).join(' ').trim() ||
        'Unknown Lead';
      leadNameById.set(l.id, name);
    }

    return scopedEvents.slice(0, limit).map((e) => {
      const seq = seqMap.get(e.sequence_id!);
      const workflowId = seq?.workflow_id || '';
      const leadId = seq?.lead_id || null;
      const actionType = CampaignMonitoringService.mapEventTypeToAction(e.event_type);
      const status = CampaignMonitoringService.mapEventTypeToStatus(e.event_type);

      return {
        id: e.id,
        timestamp: e.created_at || new Date().toISOString(),
        campaignId: workflowId,
        campaignName: workflowId ? workflowNameById.get(workflowId) || 'Unnamed Campaign' : 'Unnamed Campaign',
        leadId,
        leadName: leadId ? leadNameById.get(leadId) || null : null,
        actionType,
        status,
        message: CampaignMonitoringService.getActionMessage(actionType, status),
        metadata: e.event_data || undefined,
      };
    });
  }

  // ----------------------------------------------------------------------------
  // EVENT-TYPE MAPPING (admission_drip_execution_logs.event_type → public types)
  // ----------------------------------------------------------------------------

  private static mapEventTypeToAction(eventType: string | null): ExecutionLog['actionType'] {
    if (!eventType) return 'send_whatsapp';
    if (eventType.includes('whatsapp')) return 'send_whatsapp';
    if (eventType.includes('email')) return 'send_email';
    if (eventType.includes('sms')) return 'send_sms';
    if (eventType.includes('stage')) return 'stage_update';
    if (eventType.includes('task')) return 'task_created';
    if (eventType.includes('start')) return 'sequence_started';
    if (eventType.includes('complet')) return 'sequence_completed';
    if (eventType.includes('fail')) return 'sequence_failed';
    return 'send_whatsapp';
  }

  private static mapEventTypeToStatus(eventType: string | null): ExecutionLog['status'] {
    if (!eventType) return 'pending';
    if (eventType.includes('fail')) return 'failed';
    if (eventType.includes('pending') || eventType.includes('queued') || eventType.includes('scheduled'))
      return 'pending';
    return 'success';
  }

  private static getActionMessage(actionType: string, status: string): string {
    const messages: Record<string, Record<string, string>> = {
      send_whatsapp: {
        success: 'WhatsApp message sent successfully',
        failed: 'WhatsApp message delivery failed',
        pending: 'WhatsApp message queued for delivery',
      },
      send_email: {
        success: 'Email sent successfully',
        failed: 'Email delivery failed',
        pending: 'Email queued for delivery',
      },
      send_sms: {
        success: 'SMS sent successfully',
        failed: 'SMS delivery failed',
        pending: 'SMS queued for delivery',
      },
      stage_update: {
        success: 'Lead stage updated',
        failed: 'Failed to update lead stage',
        pending: 'Stage update pending',
      },
      task_created: {
        success: 'Task created for counselor',
        failed: 'Failed to create task',
        pending: 'Task creation pending',
      },
      sequence_started: {
        success: 'Drip sequence started',
        failed: 'Failed to start sequence',
        pending: 'Sequence start pending',
      },
      sequence_completed: {
        success: 'Drip sequence completed',
        failed: 'Sequence ended with errors',
        pending: 'Sequence in progress',
      },
      sequence_failed: {
        success: 'Sequence recovered',
        failed: 'Sequence failed permanently',
        pending: 'Retrying sequence',
      },
    };

    return messages[actionType]?.[status] || `${actionType} - ${status}`;
  }

  // ============================================================================
  // REALTIME UPDATES
  // ============================================================================

  /**
   * Subscribe to real-time updates on the real drip tables.
   *
   * Subscribes to:
   *   - admission_drip_sequences  (campaign status changes)
   *   - admission_drip_execution_logs (new execution events)
   *
   * RLS handles per-institution filtering; no postgres-changes filter is set so
   * super_admin sees all institutions' updates. Per-institution callers will
   * naturally only receive rows their RLS allows.
   */
  static subscribeToUpdates(
    institutionId: string | undefined,
    onUpdate: (update: RealtimeUpdate) => void
  ): () => void {
    const channelKey = institutionId || 'all';

    const sequenceChannel = getSupabase()
      .channel(`campaign-monitoring-sequences-${channelKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admission_drip_sequences',
        },
        (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
          onUpdate({
            type: 'campaign_status_changed',
            campaignId: (payload.new?.workflow_id as string) || (payload.old?.workflow_id as string) || undefined,
            data: payload.new || payload.old || {},
            timestamp: new Date().toISOString(),
          });
        }
      )
      .subscribe();

    const executionChannel = getSupabase()
      .channel(`campaign-monitoring-events-${channelKey}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admission_drip_execution_logs',
        },
        (payload: { new?: Record<string, unknown> }) => {
          onUpdate({
            type: 'execution_completed',
            data: payload.new || {},
            timestamp: new Date().toISOString(),
          });
        }
      )
      .subscribe();

    return () => {
      getSupabase().removeChannel(sequenceChannel);
      getSupabase().removeChannel(executionChannel);
    };
  }

  // ============================================================================
  // CAMPAIGN DETAILS  (preserved for hook compat — sourced from admission_workflows)
  // ============================================================================

  /**
   * Detail view for a single campaign. Sourced from admission_workflows since the
   * legacy re_engagement_campaigns table does not exist on prod.
   *
   * NOTE: Several fields on CampaignDetail (leadsReEngaged, leadsConverted,
   * sendTime, sendTimezone, max_leads_per_day) do not have direct columns on
   * admission_workflows; they are derived where possible and zero/null-defaulted
   * otherwise. Re-implementing the full re-engagement-campaign object model is
   * out of scope for this fix.
   */
  static async getCampaignDetail(campaignId: string): Promise<CampaignDetail | null> {
    const { data, error } = await getSupabase()
      .from('admission_workflows')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[admission/campaign-monitoring] Failed to fetch campaign detail:', error);
      throw new Error('Failed to fetch campaign detail');
    }

    return CampaignMonitoringService.workflowRowToCampaignDetail(data);
  }

  /**
   * Broadcast WhatsApp campaign stats grouped by campaign_id (preserved for compat).
   *
   * Reads from admission_whatsapp_logs which is the canonical source for broadcast
   * campaign tracking. This is unchanged from the prior implementation.
   */
  static async getBroadcastCampaignStats(institutionId: string): Promise<
    Array<{
      campaign_id: string;
      campaign_name: string;
      template_name: string;
      created_at: string;
      total: number;
      sent: number;
      delivered: number;
      read: number;
      failed: number;
      pending: number;
    }>
  > {
    const { data: logs, error } = await getSupabase()
      .from('admission_whatsapp_logs')
      .select('campaign_id, delivery_status, metadata, created_at')
      .eq('institution_id', institutionId)
      .not('campaign_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(
        '[admission/campaign-monitoring] Failed to fetch broadcast campaign stats:',
        error
      );
      throw new Error('Failed to fetch broadcast campaign stats');
    }

    const campaignMap = new Map<
      string,
      {
        campaign_id: string;
        campaign_name: string;
        template_name: string;
        created_at: string;
        total: number;
        sent: number;
        delivered: number;
        read: number;
        failed: number;
        pending: number;
      }
    >();

    for (const log of (logs || []) as Array<{
      campaign_id: string | null;
      delivery_status: string | null;
      metadata: Record<string, string> | null;
      created_at: string;
    }>) {
      if (!log.campaign_id) continue;

      const meta = (log.metadata as Record<string, string>) || {};
      const existing = campaignMap.get(log.campaign_id) ?? {
        campaign_id: log.campaign_id,
        campaign_name: meta.campaign_name || 'Untitled Broadcast',
        template_name: meta.template_name || '',
        created_at: log.created_at,
        total: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        pending: 0,
      };

      existing.total++;
      switch (log.delivery_status) {
        case 'sent':
          existing.sent++;
          break;
        case 'delivered':
          existing.delivered++;
          break;
        case 'read':
          existing.read++;
          break;
        case 'failed':
          existing.failed++;
          break;
        case 'pending':
          existing.pending++;
          break;
      }

      campaignMap.set(log.campaign_id, existing);
    }

    return Array.from(campaignMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  /**
   * List campaigns (sourced from admission_workflows — same rationale as getCampaignDetail).
   * institutionId optional for super_admin support.
   */
  static async getCampaigns(institutionId?: string): Promise<CampaignDetail[]> {
    let query = getSupabase()
      .from('admission_workflows')
      .select('*')
      .order('created_at', { ascending: false });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admission/campaign-monitoring] Failed to fetch campaigns:', error);
      throw new Error('Failed to fetch campaigns');
    }

    return ((data || []) as Array<Record<string, unknown>>).map((row) =>
      CampaignMonitoringService.workflowRowToCampaignDetail(row)
    );
  }

  // Best-effort mapper from admission_workflows row → CampaignDetail public shape.
  private static workflowRowToCampaignDetail(row: Record<string, unknown>): CampaignDetail {
    const status = (row['status'] as CampaignStatus) || 'draft';
    return {
      id: (row['id'] as string) || '',
      name: (row['name'] as string) || 'Unnamed Campaign',
      description: (row['description'] as string | null) ?? null,
      status,
      startDate: (row['start_date'] as string | null) ?? null,
      endDate: (row['end_date'] as string | null) ?? null,
      targetCriteria: (row['target_criteria'] as Record<string, unknown>) || {},
      sequence: (row['sequence'] as SequenceStep[]) || [],
      totalLeadsTargeted: (row['total_leads_targeted'] as number) || 0,
      leadsReEngaged: (row['leads_re_engaged'] as number) || 0,
      leadsConverted: (row['leads_converted'] as number) || 0,
      maxLeadsPerDay: (row['max_leads_per_day'] as number | null) ?? null,
      sendTime: (row['send_time'] as string | null) ?? null,
      sendTimezone: (row['send_timezone'] as string | null) ?? null,
      createdAt: (row['created_at'] as string) || new Date().toISOString(),
      updatedAt: (row['updated_at'] as string | null) ?? null,
    };
  }
}
