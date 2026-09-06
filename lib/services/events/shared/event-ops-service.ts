// lib/services/events/shared/event-ops-service.ts
// Shared event-day operations service for ANY event type (Events Platform Promotion PR5).
// Generalizes the former marathon-only check-in / scan / stats / search logic so it operates on any
// event by eventId, reading/writing events_registrations.checked_in (+ tshirt_collected / certificate_issued
// scan flags). No table rename and no schema change — these columns already exist on events_registrations.
//
// MarathonOpsService (lib/services/events/marathon/marathon-ops-service.ts) now extends this service so
// every existing marathon consumer keeps working unchanged.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  OpsActionType,
  OpsScanResult,
  OpsStats,
  EventStall,
} from '@/types/events-marathon';

const MOD = 'events/ops';

// ============================================================================
// Service
// ============================================================================

export class EventOpsService {
  protected static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // Lookup
  // --------------------------------------------------------------------------

  /**
   * Fetch a registration by BIB number (uppercased/trimmed) with category and stall joins.
   */
  static async getRegistrationByBib(eventId: string, bibNumber: string) {
    try {
      const { data, error } = await (this.supabase as any)
        .from('events_registrations')
        .select('*, category:event_categories(*), stall:events_stalls(*)')
        .eq('event_id', eventId)
        .eq('bib_number', bibNumber.trim().toUpperCase())
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        logger.error(MOD, 'Failed to fetch registration by BIB', { eventId, bibNumber, error });
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getRegistrationByBib', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Scan Processing
  // --------------------------------------------------------------------------

  /**
   * Process a scan action (check_in, tshirt, certificate) for a registration.
   * IDEMPOTENT: if already done, returns success=true + already_done=true.
   */
  static async processScan(
    eventId: string,
    bibNumber: string,
    action: OpsActionType,
    operatorId: string
  ): Promise<OpsScanResult> {
    try {
      const registration = await this.getRegistrationByBib(eventId, bibNumber);

      if (!registration) {
        return {
          success: false,
          action,
          registration: null,
          already_done: false,
          timestamp: new Date().toISOString(),
          message: `BIB "${bibNumber}" not found for this event.`,
        };
      }

      const regData = {
        id: registration.id,
        bib_number: registration.bib_number,
        participant_name: registration.participant_name,
        participant_phone: registration.participant_phone,
        participant_age: registration.participant_age,
        participant_gender: registration.participant_gender,
        category_code: registration.category?.code ?? '',
        custom_data: registration.custom_data ?? {},
        stall: registration.stall as EventStall | null,
      };

      // Check if already done
      const alreadyDone = this.isActionAlreadyDone(registration, action);

      if (alreadyDone) {
        return {
          success: true,
          action,
          registration: regData,
          already_done: true,
          timestamp: new Date().toISOString(),
          message: this.getAlreadyDoneMessage(action, registration.participant_name),
        };
      }

      // Perform the action
      const updatePayload = this.buildUpdatePayload(action, operatorId);

      const { data: updateData, error: updateError } = await (this.supabase as any)
        .from('events_registrations')
        .update(updatePayload)
        .eq('id', registration.id)
        .select('id')
        .maybeSingle();

      if (updateError) {
        logger.error(MOD, 'Failed to process scan', { action, bibNumber, error: updateError });
        throw updateError;
      }

      if (!updateData) {
        logger.error(MOD, 'Update blocked by RLS or row not found', { action, bibNumber, registrationId: registration.id });
        throw new Error('Update failed — you may not have permission to perform this action. Please contact an administrator.');
      }

      logger.info(MOD, 'Scan processed', {
        action,
        bibNumber,
        registrationId: registration.id,
      });

      return {
        success: true,
        action,
        registration: regData,
        already_done: false,
        timestamp: new Date().toISOString(),
        message: this.getSuccessMessage(action, registration.participant_name),
      };
    } catch (error) {
      logger.error(MOD, 'Unexpected error in processScan', error);
      throw error;
    }
  }

  /**
   * Mark / undo a registration's check-in directly by registration id (no BIB scan).
   * Used by the shared check-in board's per-row toggle. Idempotent.
   */
  static async setCheckedIn(
    registrationId: string,
    checkedIn: boolean,
    operatorId: string
  ): Promise<void> {
    try {
      const payload = checkedIn
        ? {
            checked_in: true,
            checked_in_at: new Date().toISOString(),
            checked_in_by: operatorId,
            status: 'checked_in',
          }
        : {
            checked_in: false,
            checked_in_at: null,
            checked_in_by: null,
            status: 'registered',
          };

      const { data, error } = await (this.supabase as any)
        .from('events_registrations')
        .update(payload)
        .eq('id', registrationId)
        .select('id')
        .maybeSingle();

      if (error) {
        logger.error(MOD, 'Failed to set check-in state', { registrationId, checkedIn, error });
        throw error;
      }
      if (!data) {
        throw new Error('Update failed — you may not have permission to perform this action.');
      }
      logger.info(MOD, 'Check-in state set', { registrationId, checkedIn });
    } catch (error) {
      logger.error(MOD, 'Unexpected error in setCheckedIn', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  /**
   * Get operational statistics for an event, including per-stall breakdown.
   */
  static async getOpsStats(eventId: string): Promise<OpsStats> {
    try {
      // Fetch all registrations for this event
      const { data: registrations, error: regError } = await (this.supabase as any)
        .from('events_registrations')
        .select('id, checked_in, tshirt_collected, certificate_issued, stall_id, status')
        .eq('event_id', eventId)
        .neq('status', 'cancelled');

      if (regError) {
        logger.error(MOD, 'Failed to fetch registrations for stats', regError);
        throw regError;
      }

      // Fetch active stalls
      const { data: stalls, error: stallError } = await (this.supabase as any)
        .from('events_stalls')
        .select('id, stall_name, stall_code, capacity')
        .eq('event_id', eventId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (stallError) {
        logger.error(MOD, 'Failed to fetch stalls for stats', stallError);
        throw stallError;
      }

      const regs = (registrations ?? []) as any[];
      const typedStalls = (stalls ?? []) as { id: string; stall_name: string; stall_code: string; capacity: number }[];

      const total = regs.length;
      const checked_in = regs.filter((r: any) => r.checked_in).length;
      const tshirt_collected = regs.filter((r: any) => r.tshirt_collected).length;
      const certificate_issued = regs.filter((r: any) => r.certificate_issued).length;

      // Per-stall breakdown
      const stall_breakdown = typedStalls.map((stall) => {
        const stallRegs = regs.filter((r: any) => r.stall_id === stall.id);
        return {
          stall_id: stall.id,
          stall_name: stall.stall_name,
          stall_code: stall.stall_code,
          capacity: stall.capacity,
          assigned: stallRegs.length,
          checked_in: stallRegs.filter((r: any) => r.checked_in).length,
        };
      });

      return {
        total,
        checked_in,
        tshirt_collected,
        certificate_issued,
        stall_breakdown,
      };
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getOpsStats', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  /**
   * Search registrations by BIB number, name, or phone (ilike), limit 20.
   */
  static async searchRegistrations(eventId: string, query: string) {
    try {
      const searchTerm = `%${query.trim()}%`;

      const { data, error } = await (this.supabase as any)
        .from('events_registrations')
        .select('*, category:event_categories(*), stall:events_stalls(*)')
        .eq('event_id', eventId)
        .or(
          `bib_number.ilike.${searchTerm},participant_name.ilike.${searchTerm},participant_phone.ilike.${searchTerm}`
        )
        .limit(20);

      if (error) {
        logger.error(MOD, 'Failed to search registrations', { eventId, query, error });
        throw error;
      }

      return data ?? [];
    } catch (error) {
      logger.error(MOD, 'Unexpected error in searchRegistrations', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // QR passes
  // --------------------------------------------------------------------------

  /**
   * List registrations that carry a BIB number, with their QR generation state.
   * Used by the shared QR board. Returns lightweight rows (no category/stall joins
   * beyond stall_code) ordered by BIB.
   */
  static async getQrRegistrations(eventId: string) {
    try {
      const { data, error } = await (this.supabase as any)
        .from('events_registrations')
        .select('id, bib_number, participant_name, qr_code_url, qr_generated_at, stall:events_stalls(stall_code)')
        .eq('event_id', eventId)
        .not('bib_number', 'is', null)
        .order('bib_number');

      if (error) {
        logger.error(MOD, 'Failed to fetch QR registrations', { eventId, error });
        throw error;
      }
      return data ?? [];
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getQrRegistrations', error);
      throw error;
    }
  }

  /**
   * Trigger server-side QR pass generation for an event via the (event-agnostic) QR generate route.
   * `force` regenerates existing passes; `bibNumbers` restricts to specific BIBs.
   * Returns the route's { generated, skipped, failed, errors } summary.
   */
  static async generateQrPasses(
    eventId: string,
    opts: { force?: boolean; bibNumbers?: string[] } = {}
  ): Promise<{ generated: number; skipped: number; failed: number; errors?: string[] }> {
    try {
      const res = await fetch(`/api/events/marathon/${eventId}/qr/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: opts.force === true, bibNumbers: opts.bibNumbers }),
      });
      let result: any;
      try {
        result = await res.json();
      } catch {
        throw new Error(`QR generation failed (HTTP ${res.status})`);
      }
      if (!res.ok) {
        logger.error(MOD, 'QR generation route returned error', result);
        throw new Error(result?.error ?? 'Failed to generate QR passes');
      }
      logger.info(MOD, 'QR passes generated', { eventId, generated: result?.generated });
      return result;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in generateQrPasses', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Protected Helpers (shared with subclasses)
  // --------------------------------------------------------------------------

  protected static isActionAlreadyDone(registration: any, action: OpsActionType): boolean {
    switch (action) {
      case 'check_in':
        return !!registration.checked_in;
      case 'tshirt':
        return !!registration.tshirt_collected;
      case 'certificate':
        return !!registration.certificate_issued;
      default:
        return false;
    }
  }

  protected static buildUpdatePayload(action: OpsActionType, operatorId: string): Record<string, unknown> {
    const now = new Date().toISOString();

    switch (action) {
      case 'check_in':
        return {
          checked_in: true,
          checked_in_at: now,
          checked_in_by: operatorId,
          status: 'checked_in',
        };
      case 'tshirt':
        return {
          tshirt_collected: true,
          tshirt_collected_at: now,
          tshirt_collected_by: operatorId,
        };
      case 'certificate':
        return {
          certificate_issued: true,
          certificate_issued_at: now,
          certificate_issued_by: operatorId,
        };
      default:
        return {};
    }
  }

  protected static getSuccessMessage(action: OpsActionType, name: string): string {
    switch (action) {
      case 'check_in':
        return `${name} checked in successfully.`;
      case 'tshirt':
        return `T-shirt collected by ${name}.`;
      case 'certificate':
        return `Certificate issued to ${name}.`;
      default:
        return 'Action completed.';
    }
  }

  protected static getAlreadyDoneMessage(action: OpsActionType, name: string): string {
    switch (action) {
      case 'check_in':
        return `${name} is already checked in.`;
      case 'tshirt':
        return `${name} has already collected their t-shirt.`;
      case 'certificate':
        return `Certificate already issued to ${name}.`;
      default:
        return 'Action was already performed.';
    }
  }
}
