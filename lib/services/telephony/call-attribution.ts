// lib/services/telephony/call-attribution.ts
// Resolve `counselor_id` (profiles.id) for a call log row.
//
// Bug context: 99% of inbound rows had counselor_id=NULL because:
//   1. The cron CDR path (inbound-call-sync-service) hardcoded null.
//   2. The webhook path worked for an exotel-agent-map email but never
//      tried the leads table's assigned_counselor_id as a fallback, and
//      never consulted DialWhomNumber from Passthru payloads.
//
// Signal order (most authoritative first):
//   1. lead.assigned_counselor_id — when the caller's phone already resolves
//      to a lead, that lead's counselor is the person we are dialing.
//   2. AGENT_MAP[DialWhomNumber|to_number] → agent.email → profiles.id —
//      fallback when lead isn't set. Matches the agent actually dialed.
//
// Deliberately returns null rather than guessing. Logged as a metric so we
// can observe coverage over time.

import { lookupAgent } from './exotel-agent-map';
import { normalizePhone } from '@/lib/utils/phone';

export interface AttributionInput {
  /** Lead ID already resolved for this call, if any. */
  leadId?: string | null;
  /**
   * The phone that the inbound call was dialled INTO.
   * For CDR sync, this is `record.To`; for webhook, this is the
   * detected agent phone or Passthru `DialWhomNumber`.
   */
  dialWhomNumber?: string | null;
}

/**
 * Resolve the `counselor_id` (profiles.id) for an inbound call log insert.
 *
 * Returns null when no signal is strong enough to attribute — callers MUST
 * handle null rather than falling back to a guess.
 */
export async function resolveCounselorIdForCall(
  input: AttributionInput,
  supabase: any
): Promise<string | null> {
  // ── Signal 1: lead.assigned_counselor_id ──
  // Strong signal: if the caller is already a known lead, we know who owns
  // them. That counselor_id lives in admission_leads.assigned_counselor_id
  // and references profiles.id (same FK target as admission_call_logs).
  if (input.leadId) {
    try {
      const { data: lead } = await supabase
        .from('admission_leads')
        .select('assigned_counselor_id')
        .eq('id', input.leadId)
        .maybeSingle();
      if (lead?.assigned_counselor_id) return lead.assigned_counselor_id;
    } catch {
      // Non-blocking — fall through to agent-phone signal
    }
  }

  // ── Signal 2: dialled-phone → AGENT_MAP → profiles.email ──
  // The phone the call landed on maps to a known Exotel co-worker in our
  // static AGENT_MAP. We translate phone → agent.email → profiles.id.
  // lookupAgent handles E.164 / leading-0 / last-10-digit variants, and
  // we normalize once up front for safety.
  const dialed = input.dialWhomNumber?.trim();
  if (!dialed) return null;

  const agent = lookupAgent(dialed) ?? lookupAgent(normalizePhone(dialed));
  if (!agent?.email) return null;

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', agent.email)
      .maybeSingle();
    return profile?.id ?? null;
  } catch {
    return null;
  }
}
