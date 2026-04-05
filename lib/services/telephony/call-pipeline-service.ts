import { SupabaseClient } from '@supabase/supabase-js';
import { ExotelClient } from './exotel-client';
import { PhoneNumberIntelligence } from './phone-number-intelligence';

const PIPELINE_STAGES = ['captured', 'classified', 'matched', 'intelligence', 'enriched', 'responded', 'complete'] as const;
type PipelineStage = typeof PIPELINE_STAGES[number];

interface PipelineContext {
  callLogId: string;
  callSid: string;
  institutionId: string;
  direction: 'inbound' | 'outbound';
  status: string;
  fromNumber: string;
  toNumber: string;
  durationSeconds: number;
  costAmount: number;
  recordingUrl?: string;
  leadId?: string;
  counselorId?: string;
}

interface PipelineResult {
  stage: PipelineStage;
  intelligenceId?: string;
  callbackQueueId?: string;
  autoSmsSent?: boolean;
  error?: string;
}

interface InstitutionCallSettings {
  auto_sms_enabled: boolean;
  auto_sms_template: string;
  auto_sms_sender_id: string | null;
  dlt_entity_id: string | null;
  dlt_template_id: string | null;
  auto_transcribe_enabled: boolean;
  auto_enrich_leads: boolean;
  repeat_detection_window_days: number;
  escalation_threshold: number;
  callback_auto_assign: boolean;
  callback_expiry_hours: number;
}

export class CallPipelineService {
  /**
   * Run the full pipeline for a single call.
   * Called from: handleCallStatusCallback() on terminal status,
   *              createInboundCallLog() after processCallIntelligence().
   *
   * Stages 1-4 (capture/classify/match/intelligence) are already handled by
   * TelephonyService. This service handles Stages 5-6 (enrich/respond).
   */
  static async runPipeline(
    ctx: PipelineContext,
    supabase: SupabaseClient
  ): Promise<PipelineResult> {
    try {
      // Load institution settings
      const settings = await this.getSettings(ctx.institutionId, supabase);

      const isAnswered = ctx.costAmount > 0 && ctx.durationSeconds > 0;
      const isMissed = !isAnswered && ctx.direction === 'inbound';

      // INTEGRATION: Phone number location intelligence (works for ALL calls)
      if (ctx.fromNumber && ctx.direction === 'inbound') {
        try {
          const phoneInfo = PhoneNumberIntelligence.analyzePhoneNumber(ctx.fromNumber);
          if (phoneInfo.location) {
            // Set caller_location on call log
            await supabase
              .from('admission_call_logs')
              .update({ caller_location: phoneInfo.location })
              .eq('id', ctx.callLogId);

            // If lead exists and has no city, update lead
            if (ctx.leadId) {
              const { data: lead } = await supabase
                .from('admission_leads')
                .select('city, state')
                .eq('id', ctx.leadId)
                .single();

              if (lead && !lead.city && !lead.state) {
                await supabase
                  .from('admission_leads')
                  .update({ state: phoneInfo.location })
                  .eq('id', ctx.leadId);
              }
            }
          }
        } catch {
          // Non-blocking — phone intelligence should never break the pipeline
        }
      }

      // Stage 5: ENRICH (answered calls with recordings)
      let intelligenceId: string | undefined;
      if (isAnswered && ctx.recordingUrl && settings.auto_transcribe_enabled) {
        intelligenceId = await this.submitForAnalysis(ctx, supabase);
      }

      // Stage 6: RESPOND (missed inbound calls)
      let callbackQueueId: string | undefined;
      let autoSmsSent = false;
      if (isMissed) {
        // Auto-SMS
        if (settings.auto_sms_enabled && ctx.fromNumber) {
          autoSmsSent = await this.sendMissedCallSms(ctx, settings, supabase);
        }
        // Callback queue
        callbackQueueId = await this.queueCallback(ctx, settings, supabase);
      }

      // Update call log with pipeline results
      const finalStage: PipelineStage = isMissed ? 'responded' : (intelligenceId ? 'enriched' : 'complete');
      await supabase
        .from('admission_call_logs')
        .update({
          pipeline_stage: finalStage,
          intelligence_id: intelligenceId ?? null,
          auto_sms_sent: autoSmsSent,
          callback_queued: !!callbackQueueId,
          callback_queue_id: callbackQueueId ?? null,
        })
        .eq('id', ctx.callLogId);

      return { stage: finalStage, intelligenceId, callbackQueueId, autoSmsSent };
    } catch (error) {
      console.error('[CallPipeline] Error:', error);
      return { stage: 'intelligence', error: String(error) };
    }
  }

  /**
   * Submit answered call for ExoVoiceAnalyze transcription/sentiment/summary.
   * Returns intelligence record ID. Results arrive async via webhook.
   */
  private static async submitForAnalysis(
    ctx: PipelineContext,
    supabase: SupabaseClient
  ): Promise<string | undefined> {
    try {
      // Create intelligence record
      const { data: intel, error: insertError } = await supabase
        .from('admission_call_intelligence')
        .insert({
          institution_id: ctx.institutionId,
          call_log_id: ctx.callLogId,
          call_sid: ctx.callSid,
          analyze_status: 'submitted',
          analyze_submitted_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError || !intel) {
        console.error('[CallPipeline] Failed to create intelligence record:', insertError);
        return undefined;
      }

      // Build callback URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
      if (!baseUrl) {
        console.error('[CallPipeline] No APP_URL configured — skipping analysis');
        return undefined;
      }
      const webhookToken = process.env.EXOTEL_API_TOKEN;
      const callbackUrl = `${baseUrl}/api/webhooks/telephony/intelligence?token=${webhookToken}`;

      // Submit to ExoVoiceAnalyze
      const response = await ExotelClient.analyzeCall({
        callSid: ctx.callSid,
        tasks: ['transcript', 'summarization', 'sentiment', 'categorise'],
        callbackUrl,
        categories: [
          'admission_inquiry', 'fee_inquiry', 'course_inquiry',
          'placement_inquiry', 'complaint', 'follow_up', 'other'
        ],
      });

      // Update with job ID
      await supabase
        .from('admission_call_intelligence')
        .update({
          analyze_job_id: response.request_id,
          analyze_status: 'processing',
        })
        .eq('id', intel.id);

      return intel.id;
    } catch (error) {
      console.error('[CallPipeline] ExoVoiceAnalyze submit failed:', error);
      return undefined;
    }
  }

  /**
   * Send auto-SMS to missed caller.
   * FIX 3: One SMS per caller per 24 hours — prevents spamming repeat callers.
   */
  private static async sendMissedCallSms(
    ctx: PipelineContext,
    settings: InstitutionCallSettings,
    supabase: SupabaseClient
  ): Promise<boolean> {
    try {
      if (!settings.auto_sms_sender_id) {
        console.warn('[CallPipeline] No SMS sender ID configured for institution', ctx.institutionId);
        return false;
      }

      // FIX 3: Check if we already sent SMS to this number in the last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentSms } = await supabase
        .from('admission_call_logs')
        .select('id')
        .eq('from_number', ctx.fromNumber)
        .eq('direction', 'inbound')
        .eq('auto_sms_sent', true)
        .gte('created_at', twentyFourHoursAgo)
        .limit(1)
        .maybeSingle();

      if (recentSms) {
        // Already sent SMS to this caller in the last 24h — skip
        await supabase
          .from('admission_call_logs')
          .update({ auto_sms_skipped_reason: 'already_sent_24h' })
          .eq('id', ctx.callLogId);
        console.info('[CallPipeline] SMS skipped — already sent to', ctx.fromNumber.slice(-4), 'in last 24h');
        return false;
      }

      const response = await ExotelClient.sendSms({
        from: settings.auto_sms_sender_id,
        to: ctx.fromNumber,
        body: settings.auto_sms_template,
        dltEntityId: settings.dlt_entity_id ?? undefined,
        dltTemplateId: settings.dlt_template_id ?? undefined,
        smsType: 'transactional',
        priority: 'high',
        customField: ctx.callLogId,
      });

      // Track SMS SID on call log
      await supabase
        .from('admission_call_logs')
        .update({ auto_sms_sid: response.SMSMessage?.Sid })
        .eq('id', ctx.callLogId);

      return true;
    } catch (error) {
      console.error('[CallPipeline] Auto-SMS failed:', error);
      return false;
    }
  }

  /**
   * Create callback queue entry for missed call.
   * Checks 7-day history for repeat detection and escalation.
   */
  private static async queueCallback(
    ctx: PipelineContext,
    settings: InstitutionCallSettings,
    supabase: SupabaseClient
  ): Promise<string | undefined> {
    try {
      const windowDays = settings.repeat_detection_window_days;
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - windowDays);

      // Count missed calls in window
      const { data: recentCalls } = await supabase
        .from('admission_call_logs')
        .select('id, cost_amount, duration_seconds')
        .eq('from_number', ctx.fromNumber)
        .eq('direction', 'inbound')
        .gte('created_at', windowStart.toISOString())
        .order('created_at', { ascending: false });

      const missedCount = (recentCalls || []).filter((c: any) =>
        (c.cost_amount ?? 0) <= 0 && (c.duration_seconds ?? 0) === 0
      ).length;

      const everConnected = (recentCalls || []).some((c: any) =>
        (c.cost_amount ?? 0) > 0 || (c.duration_seconds ?? 0) > 0
      );

      // Determine priority
      let priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal';
      if (missedCount >= settings.escalation_threshold) priority = 'urgent';
      else if (missedCount >= 2 && !everConnected) priority = 'high';
      else if (missedCount >= 1) priority = 'normal';

      const shouldEscalate = missedCount >= settings.escalation_threshold;

      // Check for existing pending callback for this caller
      const { data: existing } = await supabase
        .from('admission_callback_queue')
        .select('id, missed_count_7d, priority')
        .eq('caller_number', ctx.fromNumber)
        .eq('status', 'pending')
        .single();

      let callbackId: string;

      // FIX 2: Calculate callback_due_by based on priority (SLA)
      const slaMinutes: Record<string, number> = {
        urgent: 15,
        high: 30,
        normal: 120,
        low: 240,
      };
      const dueByMs = (slaMinutes[priority] ?? 120) * 60 * 1000;
      const callbackDueBy = new Date(Date.now() + dueByMs).toISOString();

      if (existing) {
        // Update existing entry with higher priority
        const newPriority = this.higherPriority(existing.priority, priority);
        await supabase
          .from('admission_callback_queue')
          .update({
            missed_count_7d: missedCount,
            priority: newPriority,
            escalated: shouldEscalate,
            escalated_at: shouldEscalate ? new Date().toISOString() : null,
            call_log_id: ctx.callLogId,  // point to latest missed call
            callback_due_by: callbackDueBy,
          })
          .eq('id', existing.id);
        callbackId = existing.id;
      } else {
        // Create new entry
        const { data: entry, error } = await supabase
          .from('admission_callback_queue')
          .insert({
            institution_id: ctx.institutionId,
            call_log_id: ctx.callLogId,
            lead_id: ctx.leadId ?? null,
            caller_number: ctx.fromNumber,
            priority,
            missed_count_7d: missedCount,
            ever_connected: everConnected,
            escalated: shouldEscalate,
            escalated_at: shouldEscalate ? new Date().toISOString() : null,
            callback_due_by: callbackDueBy,
          })
          .select('id')
          .single();

        if (error || !entry) {
          console.error('[CallPipeline] Failed to create callback entry:', error);
          return undefined;
        }
        callbackId = entry.id;
      }

      return callbackId;
    } catch (error) {
      console.error('[CallPipeline] Callback queue failed:', error);
      return undefined;
    }
  }

  /**
   * Sweep: retry failed pipeline stages, backfill, and check SLA breaches.
   * Called from 5-min cron after CDR sync.
   */
  static async sweepPipeline(supabase: SupabaseClient): Promise<{ retried: number; errors: string[]; slaBreached: number }> {
    const errors: string[] = [];
    let retried = 0;
    let slaBreached = 0;

    // FIX 2: Check for SLA-breached callbacks
    try {
      const { data: overdueCallbacks } = await supabase
        .from('admission_callback_queue')
        .select('id, institution_id, caller_number, priority, escalation_level')
        .eq('status', 'pending')
        .eq('sla_breached', false)
        .lt('callback_due_by', new Date().toISOString())
        .limit(50);

      if (overdueCallbacks?.length) {
        for (const cb of overdueCallbacks) {
          const newLevel = (cb.escalation_level ?? 0) + 1;
          const update: Record<string, any> = {
            sla_breached: true,
            sla_breached_at: new Date().toISOString(),
            escalation_level: newLevel,
            escalated: true,
            escalated_at: new Date().toISOString(),
          };

          // Level 1: Reassign to institution's most-active counselor
          if (newLevel === 1) {
            const { data: topCounselor } = await supabase
              .from('admission_call_logs')
              .select('counselor_id')
              .eq('institution_id', cb.institution_id)
              .eq('direction', 'outbound')
              .not('counselor_id', 'is', null)
              .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (topCounselor?.counselor_id) {
              update.assigned_counselor_id = topCounselor.counselor_id;
            }
          }

          await supabase
            .from('admission_callback_queue')
            .update(update)
            .eq('id', cb.id);

          slaBreached++;
        }
      }
    } catch (err) {
      errors.push(`SLA sweep: ${String(err)}`);
    }

    // Find calls stuck in early pipeline stages (not complete, not enriched/responded)
    const { data: stuckCalls } = await supabase
      .from('admission_call_logs')
      .select('id, call_sid, institution_id, direction, status, from_number, to_number, duration_seconds, cost_amount, recording_url, lead_id, counselor_id, pipeline_stage')
      .in('pipeline_stage', ['captured', 'classified', 'matched', 'intelligence'])
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())  // last 24h
      .order('created_at', { ascending: true })
      .limit(50);

    if (!stuckCalls?.length) return { retried: 0, errors, slaBreached };

    for (const call of stuckCalls) {
      try {
        await this.runPipeline({
          callLogId: call.id,
          callSid: call.call_sid,
          institutionId: call.institution_id,
          direction: call.direction as 'inbound' | 'outbound',
          status: call.status,
          fromNumber: call.from_number,
          toNumber: call.to_number,
          durationSeconds: call.duration_seconds ?? 0,
          costAmount: call.cost_amount ?? 0,
          recordingUrl: call.recording_url ?? undefined,
          leadId: call.lead_id ?? undefined,
          counselorId: call.counselor_id ?? undefined,
        }, supabase);
        retried++;
      } catch (error) {
        errors.push(`${call.id}: ${String(error)}`);
      }
    }

    return { retried, errors, slaBreached };
  }

  /**
   * Load institution call settings with defaults.
   */
  private static async getSettings(
    institutionId: string,
    supabase: SupabaseClient
  ): Promise<InstitutionCallSettings> {
    const { data } = await supabase
      .from('institution_call_settings')
      .select('*')
      .eq('institution_id', institutionId)
      .single();

    return data ?? {
      auto_sms_enabled: true,
      auto_sms_template: 'Thank you for calling JKKN. A counselor will call you back shortly.',
      auto_sms_sender_id: null,
      dlt_entity_id: null,
      dlt_template_id: null,
      auto_transcribe_enabled: true,
      auto_enrich_leads: true,
      repeat_detection_window_days: 7,
      escalation_threshold: 3,
      callback_auto_assign: false,
      callback_expiry_hours: 48,
    };
  }

  private static higherPriority(a: string, b: string): string {
    const order: Record<string, number> = { low: 0, normal: 1, high: 2, urgent: 3 };
    return (order[b] ?? 0) > (order[a] ?? 0) ? b : a;
  }
}
