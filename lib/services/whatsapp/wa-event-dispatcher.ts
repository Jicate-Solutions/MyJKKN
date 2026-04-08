// lib/services/whatsapp/wa-event-dispatcher.ts
// Central event dispatcher for the Unified WhatsApp Automation Engine.
// Any module emitting a triggerable event calls WAEventDispatcher.dispatch().
// This is a thin, non-blocking wrapper around evaluateAndFire().

import { WhatsAppPersonalAutoTriggerService } from './whatsapp-personal-auto-trigger-service';
import type { AutoTriggerEventType } from '@/types/whatsapp-personal';

export class WAEventDispatcher {
  /**
   * Dispatch a WhatsApp auto-trigger event.
   *
   * Called by lead-service, call-pipeline-service, telephony-service, etc.
   * Finds matching rules for the event and queues/sends messages.
   *
   * **Non-blocking by design** — callers should always `.catch(() => {})`.
   */
  static async dispatch(params: {
    eventType: AutoTriggerEventType;
    institutionId: string;
    leadId: string;
    leadPhone: string;
    leadName?: string;
    metadata?: Record<string, string>;
  }): Promise<{ triggered: number; queued: number; skipped: number }> {
    try {
      // Build variable context for template interpolation
      const variableContext = {
        lead_name: params.leadName || 'there',
        lead_phone: params.leadPhone,
        institution_name: 'JKKN Institutions',
        ...(params.metadata || {}),
      };

      const result = await WhatsAppPersonalAutoTriggerService.evaluateAndFire({
        eventType: params.eventType,
        institutionId: params.institutionId,
        leadId: params.leadId,
        leadPhone: params.leadPhone,
        variableContext,
      });

      console.info(
        `[WAEventDispatcher] ${params.eventType}: triggered=${result.triggered} queued=${result.queued} skipped=${result.skipped}`
      );
      return result;
    } catch (err) {
      // Non-blocking — never break the calling code
      console.error(`[WAEventDispatcher] Error dispatching ${params.eventType}:`, err);
      return { triggered: 0, queued: 0, skipped: 0 };
    }
  }
}
