// WhatsApp Re-engagement Service — Gap 11
// Automated WhatsApp re-engagement sequences for cold leads
// Uses existing admission_drip_sequences and admission_drip_schedule tables

import { createClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface SequenceStep {
  day: number;
  action_type: 'send_whatsapp';
  template_name: string;
  message_fallback: string;
  delay_hours: number;
}

export interface SegmentCriterion {
  field: string;
  operator: string;
  value: unknown;
}

export interface SequenceTemplate {
  id: string;
  name: string;
  description: string;
  steps: SequenceStep[];
  target_criteria: SegmentCriterion[];
}

export interface ReengagementStats {
  total_cold_leads: number;
  active_sequences: number;
  reengaged_count: number;
  conversion_rate: number;
}

export interface LaunchCampaignParams {
  institutionId: string;
  sequenceTemplate: SequenceTemplate;
  leadIds: string[];
  createdBy: string;
}

export interface LaunchCampaignResult {
  sequencesCreated: number;
  errors: string[];
}

// =============================================================================
// Service
// =============================================================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class WhatsAppReengagementService {
  // ---------------------------------------------------------------------------
  // Get Cold Leads
  // ---------------------------------------------------------------------------

  /**
   * Get leads that haven't been contacted in X days,
   * are not enrolled/lost, and have WhatsApp opt-in.
   */
  static async getColdLeads(
    institutionId: string,
    daysSinceContact: number,
    limit?: number
  ) {
    const supabase = getServiceClient();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysSinceContact);

    let query = supabase
      .from('admission_leads')
      .select('id, full_name, email, phone, stage, funnel_stage, score, source, last_contact_at, last_activity_at, created_at, wa_opt_in, interested_programs')
      .eq('institution_id', institutionId)
      .not('funnel_stage', 'in', '("enrolled","lost")')
      .eq('wa_opt_in', true)
      .lt('last_contact_at', cutoffDate.toISOString())
      .order('last_contact_at', { ascending: true });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch cold leads: ${error.message}`);
    return data || [];
  }

  // ---------------------------------------------------------------------------
  // Predefined Sequences
  // ---------------------------------------------------------------------------

  /**
   * Returns 3 pre-built re-engagement sequence templates.
   */
  static getPredefinedSequences(): SequenceTemplate[] {
    return [
      {
        id: 'gentle-reengagement',
        name: 'Gentle Re-engagement',
        description: 'A soft 3-step sequence over 7 days. Starts with a friendly follow-up, invites to campus visit, then introduces a counselor for personalized help.',
        steps: [
          {
            day: 0,
            action_type: 'send_whatsapp',
            template_name: 'jkkn_followup',
            message_fallback: 'Hi {{name}}, we noticed you were interested in JKKN. We\'d love to help you with your admission journey. Any questions?',
            delay_hours: 0,
          },
          {
            day: 3,
            action_type: 'send_whatsapp',
            template_name: 'jkkn_campus_visit',
            message_fallback: 'Hi {{name}}, would you like to visit our campus? We can arrange a personalized tour for you and your family.',
            delay_hours: 72,
          },
          {
            day: 7,
            action_type: 'send_whatsapp',
            template_name: 'jkkn_counselor_intro',
            message_fallback: 'Hi {{name}}, I\'m your dedicated admission counselor at JKKN. I\'m here to answer any questions about programs, fees, or placements.',
            delay_hours: 168,
          },
        ],
        target_criteria: [
          { field: 'funnel_stage', operator: 'not_in', value: ['enrolled', 'lost'] },
          { field: 'wa_opt_in', operator: 'equals', value: true },
        ],
      },
      {
        id: 'deadline-urgency',
        name: 'Deadline Urgency',
        description: 'A 2-step urgency sequence over 3 days. Creates FOMO with deadline alerts followed by a fee reminder.',
        steps: [
          {
            day: 0,
            action_type: 'send_whatsapp',
            template_name: 'jkkn_deadline_alert',
            message_fallback: 'Hi {{name}}, the admission deadline for JKKN is approaching soon! Don\'t miss your chance to secure your seat.',
            delay_hours: 0,
          },
          {
            day: 3,
            action_type: 'send_whatsapp',
            template_name: 'jkkn_fee_reminder',
            message_fallback: 'Hi {{name}}, just a reminder — the fee payment window closes soon. Complete your application to lock in your seat at JKKN.',
            delay_hours: 72,
          },
        ],
        target_criteria: [
          { field: 'funnel_stage', operator: 'in', value: ['qualified', 'applied'] },
          { field: 'wa_opt_in', operator: 'equals', value: true },
        ],
      },
      {
        id: 'scholarship-nudge',
        name: 'Scholarship Nudge',
        description: 'A single-step scholarship information message. Great for high-potential leads who may be cost-sensitive.',
        steps: [
          {
            day: 0,
            action_type: 'send_whatsapp',
            template_name: 'jkkn_scholarship_info',
            message_fallback: 'Hi {{name}}, did you know JKKN offers scholarships for deserving students? Check eligibility and apply before seats fill up!',
            delay_hours: 0,
          },
        ],
        target_criteria: [
          { field: 'wa_opt_in', operator: 'equals', value: true },
        ],
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Launch Re-engagement Campaign
  // ---------------------------------------------------------------------------

  /**
   * Launch a re-engagement campaign for a list of leads using a sequence template.
   * Creates drip sequences via the admission_drip_sequences and admission_drip_schedule tables.
   */
  static async launchReengagementCampaign(
    params: LaunchCampaignParams
  ): Promise<LaunchCampaignResult> {
    const supabase = getServiceClient();
    const { institutionId, sequenceTemplate, leadIds, createdBy } = params;
    let sequencesCreated = 0;
    const errors: string[] = [];

    // First, create a workflow-like record for this sequence (reuse admission_workflows table)
    const { data: workflow, error: wfError } = await supabase
      .from('admission_workflows')
      .insert({
        institution_id: institutionId,
        name: `Re-engagement: ${sequenceTemplate.name}`,
        description: sequenceTemplate.description,
        trigger_type: 'manual',
        is_active: true,
        actions: sequenceTemplate.steps.map((step, idx) => ({
          id: `reeng-step-${idx}`,
          type: step.action_type,
          config: {
            template_name: step.template_name,
            message_fallback: step.message_fallback,
            delay_minutes: step.delay_hours * 60,
          },
        })),
        conditions: sequenceTemplate.target_criteria,
        created_by: createdBy,
      })
      .select('id')
      .single();

    if (wfError || !workflow) {
      throw new Error(`Failed to create workflow for re-engagement: ${wfError?.message}`);
    }

    // Create a drip sequence for each lead
    for (const leadId of leadIds) {
      try {
        // Check if lead already has an active sequence for this kind
        const { data: existing } = await supabase
          .from('admission_drip_sequences')
          .select('id')
          .eq('lead_id', leadId)
          .eq('workflow_id', workflow.id)
          .in('status', ['active', 'paused'])
          .limit(1);

        if (existing && existing.length > 0) {
          errors.push(`Lead ${leadId}: already has active sequence`);
          continue;
        }

        // Create drip sequence
        const now = new Date();
        const { data: sequence, error: seqError } = await supabase
          .from('admission_drip_sequences')
          .insert({
            institution_id: institutionId,
            workflow_id: workflow.id,
            lead_id: leadId,
            status: 'active',
            current_step_index: 0,
            total_steps: sequenceTemplate.steps.length,
            context_data: {
              sequence_template_id: sequenceTemplate.id,
              sequence_template_name: sequenceTemplate.name,
            },
            created_by: createdBy,
          })
          .select('id')
          .single();

        if (seqError || !sequence) {
          errors.push(`Lead ${leadId}: ${seqError?.message || 'failed to create sequence'}`);
          continue;
        }

        // Schedule all steps
        const scheduleSteps = sequenceTemplate.steps.map((step, idx) => {
          const scheduledAt = new Date(now.getTime() + step.delay_hours * 3600000);
          return {
            sequence_id: sequence.id,
            step_index: idx,
            action_id: `reeng-step-${idx}`,
            action_type: step.action_type,
            action_config: {
              template_name: step.template_name,
              message_fallback: step.message_fallback,
            },
            scheduled_at: scheduledAt.toISOString(),
            delay_hours: step.delay_hours,
            delay_days: Math.floor(step.delay_hours / 24),
            conditions: [],
            status: idx === 0 ? 'scheduled' : 'pending',
          };
        });

        const { error: schedError } = await supabase
          .from('admission_drip_schedule')
          .insert(scheduleSteps);

        if (schedError) {
          errors.push(`Lead ${leadId}: failed to schedule steps - ${schedError.message}`);
          // Clean up the sequence
          await supabase.from('admission_drip_sequences').delete().eq('id', sequence.id);
          continue;
        }

        sequencesCreated++;
      } catch (err) {
        errors.push(`Lead ${leadId}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }

    return { sequencesCreated, errors };
  }

  // ---------------------------------------------------------------------------
  // Re-engagement Stats
  // ---------------------------------------------------------------------------

  /**
   * Get re-engagement statistics for an institution.
   */
  static async getReengagementStats(institutionId: string): Promise<ReengagementStats> {
    const supabase = getServiceClient();

    // Count cold leads (14+ days since contact, not enrolled/lost, wa_opt_in)
    const cutoff14 = new Date();
    cutoff14.setDate(cutoff14.getDate() - 14);

    const { count: totalColdLeads } = await supabase
      .from('admission_leads')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .not('funnel_stage', 'in', '("enrolled","lost")')
      .eq('wa_opt_in', true)
      .lt('last_contact_at', cutoff14.toISOString());

    // Count active re-engagement sequences
    const { count: activeSequences } = await supabase
      .from('admission_drip_sequences')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .eq('status', 'active');

    // Count completed sequences (reengaged)
    const { count: reengagedCount } = await supabase
      .from('admission_drip_sequences')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .eq('status', 'completed');

    const total = (totalColdLeads || 0) + (reengagedCount || 0);
    const conversionRate = total > 0 ? ((reengagedCount || 0) / total) * 100 : 0;

    return {
      total_cold_leads: totalColdLeads || 0,
      active_sequences: activeSequences || 0,
      reengaged_count: reengagedCount || 0,
      conversion_rate: Math.round(conversionRate * 10) / 10,
    };
  }
}
