// lib/services/meetings/booking-crm-bridge-service.ts
//
// Wave 3 (CRM bridge): when a public booking is confirmed, if the attendee
// matches an existing admission lead, log a "meeting booked" activity on that
// lead so the counseling call becomes a tracked funnel event in the CRM.
//
// Design:
//   - Match by email first (case-insensitive), fall back to phone (last-10-digit fuzzy).
//   - Calls ActivityService.createActivity — the canonical lead-activity writer.
//     Do NOT write to admission_lead_activities directly.
//   - Everything best-effort + non-throwing: a bridge failure MUST NOT fail a booking.
//   - Mirrors: lib/services/telephony/inbound-call-sync-service.ts (lead matching)
//             lib/services/admission/activity-service.ts (activity writing)
//
// Writers that use the same lead-activity table:
//   telephony-service.ts (outbound/inbound call), inbound-call-sync-service.ts (CDR cron),
//   application-service.ts (stage_change), this file (meeting).

import type { SupabaseClient } from '@supabase/supabase-js';
import { ActivityService } from '@/lib/services/admission/activity-service';
import { normalizePhone, phoneLastDigits } from '@/lib/utils/phone';

const MODULE = 'meetings/crm-bridge';

// ─── Input ──────────────────────────────────────────────────────────────────

export interface BookingCrmBridgeInput {
  /** Booking UID (for logging context only). */
  uid: string;
  attendeeEmail: string;
  attendeePhone?: string | null;
  /** institution_id from the meeting type; may be null for un-scoped types. */
  institutionId?: string | null;
  meetingTitle: string;
  /** ISO start time of the booked slot. */
  startIso: string;
  hostName: string | null;
}

// ─── Result ──────────────────────────────────────────────────────────────────

export interface BookingCrmBridgeResult {
  matched: boolean;
  leadId?: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class BookingCrmBridge {
  /**
   * Best-effort: find the admission lead whose email (or phone) matches the
   * confirmed booking's attendee, then log a `meeting` activity on that lead.
   *
   * Returns { matched: false } when no lead is found — v1 does NOT auto-create
   * leads from bookings; it only enriches known leads in the CRM.
   *
   * NEVER throws — callers rely on this to be non-throwing.
   */
  static async recordBookingActivity(
    supabase: SupabaseClient,
    input: BookingCrmBridgeInput,
  ): Promise<BookingCrmBridgeResult> {
    try {
      const leadId = await BookingCrmBridge.findMatchingLead(supabase, input);

      if (!leadId) {
        return { matched: false };
      }

      // Build a human-readable description for the CRM timeline
      const when = new Date(input.startIso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      const hostLine = input.hostName ? ` with ${input.hostName}` : '';
      const description = `Meeting booked${hostLine} on ${when} via the JKKN meet page.`;

      await ActivityService.createActivity({
        lead_id: leadId,
        activity_type: 'meeting',
        title: `Meeting booked: ${input.meetingTitle}`,
        description,
        scheduled_at: input.startIso,
      });

      return { matched: true, leadId };
    } catch (err) {
      console.error(
        `[${MODULE}] Failed to record CRM activity for booking ${input.uid}:`,
        err instanceof Error ? err.message : String(err),
      );
      return { matched: false };
    }
  }

  // ── Lead matching ──────────────────────────────────────────────────────────

  /**
   * Match an attendee to an admission lead:
   *   1. Email match (case-insensitive), institution-scoped when available.
   *   2. Phone match (exact E.164, then last-10-digit fuzzy), same scope.
   *   3. Fallback: cross-institution email match when no institution_id.
   *
   * Returns the most recent lead's id, or null.
   */
  private static async findMatchingLead(
    // meeting tables are not in generated types — cast to any, mirroring native-scheduling-service.ts
    supabase: SupabaseClient,
    input: BookingCrmBridgeInput,
  ): Promise<string | null> {
    const db = supabase as unknown as any;

    // ── 1. Email match ─────────────────────────────────────────────────────
    const emailLower = input.attendeeEmail.toLowerCase().trim();
    if (emailLower) {
      let q = db
        .from('admission_leads')
        .select('id')
        .ilike('email', emailLower)
        .order('created_at', { ascending: false })
        .limit(1);

      if (input.institutionId) {
        q = q.eq('institution_id', input.institutionId);
      }

      const { data: emailMatch } = await q.maybeSingle();
      if (emailMatch?.id) return emailMatch.id as string;
    }

    // ── 2. Phone match ─────────────────────────────────────────────────────
    if (input.attendeePhone) {
      const normalized = normalizePhone(input.attendeePhone);
      if (normalized) {
        // Exact normalized match
        let exactQ = db
          .from('admission_leads')
          .select('id')
          .eq('phone', normalized)
          .order('created_at', { ascending: false })
          .limit(1);
        if (input.institutionId) exactQ = exactQ.eq('institution_id', input.institutionId);

        const { data: exactMatch } = await exactQ.maybeSingle();
        if (exactMatch?.id) return exactMatch.id as string;

        // Fuzzy last-10-digit match (mirrors TelephonyService.matchLeadByPhone)
        const last10 = phoneLastDigits(normalized);
        if (last10.length >= 10) {
          let fuzzyQ = db
            .from('admission_leads')
            .select('id')
            .like('phone', `%${last10}`)
            .order('created_at', { ascending: false })
            .limit(1);
          if (input.institutionId) fuzzyQ = fuzzyQ.eq('institution_id', input.institutionId);

          const { data: fuzzyMatch } = await fuzzyQ.maybeSingle();
          if (fuzzyMatch?.id) return fuzzyMatch.id as string;
        }
      }
    }

    return null;
  }
}
