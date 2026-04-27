// lib/services/telephony/call-attribution.ts
// Resolve `counselor_id` (profiles.id) for a call log row.
//
// Bug context: 99% of inbound rows had counselor_id=NULL because:
//   1. The cron CDR path (inbound-call-sync-service) hardcoded null.
//   2. The webhook path worked for an exotel-agent-map email but never
//      tried the leads table's assigned_counselor_id as a fallback, and
//      never consulted DialWhomNumber from Passthru payloads.
//
// First-pass fix (Agent B / PR #435) only attributed 33/2089 (1.6%) because:
//   - Signal 1 (lead.assigned_counselor_id) is dead — only 1 of 1,104 leads
//     actually has assigned_counselor_id set in production.
//   - Signal 2 (AGENT_MAP[phone] → profiles.email) misses ~75% of agents
//     because Exotel co-worker emails (e.g. shanmugaprabhu@jkkn.org) don't
//     match the actual MyJKKN profile emails (e.g. dhuraimurugan.g@jkkn.ac.in).
//
// Signal order (most authoritative first):
//   1. lead.assigned_counselor_id — when the caller's phone already resolves
//      to a lead, that lead's counselor is the person we are dialing.
//   2. AGENT_MAP[DialWhomNumber|to_number] → agent.email → profiles.id —
//      fallback when lead isn't set. Matches the agent actually dialed.
//   3. profiles.phone_number last-10-digit match — when AGENT_MAP email
//      doesn't resolve a profile, try matching the dialed phone directly
//      against profiles.phone_number. Bypasses email drift entirely.
//      Validates a staff-like role to avoid attributing to students who
//      happen to share a phone number.
//
// Deliberately returns null rather than guessing. Logged as a metric so we
// can observe coverage over time.

import { lookupAgent } from './exotel-agent-map';
import { normalizePhone, phoneLastDigits } from '@/lib/utils/phone';

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
 * Roles that are eligible to be attributed as a call counselor.
 * Excludes 'student', 'parent', 'guest', etc. so we don't attribute calls
 * to a student whose phone happens to collide with an agent's number.
 *
 * Includes admission, faculty, admin/super_admin, and the various
 * department/operational roles whose members staff inbound queues.
 */
const STAFF_ROLES = [
  'admission',
  'admission_counselor',
  'admission_staff',
  'admin',
  'super_admin',
  'administrator',
  'executive_admin_officer',
  'faculty',
  'hod',
  'principal',
  'accounts',
  'accountant_assistant',
  'cao',
  'ceo',
  'coo',
  'hr_admin',
  'staff',
];

/**
 * Resolve counselor_id by matching the dialed phone against
 * profiles.phone_number using last-10-digit normalization.
 *
 * Why this exists: AGENT_MAP hardcodes Exotel co-worker emails which
 * frequently don't match the real MyJKKN profile email. Phone numbers,
 * by contrast, are the same across both systems and rarely drift.
 *
 * Returns null if no staff profile owns this phone, or if multiple
 * matches are found (ambiguous).
 */
async function resolveByProfilePhone(
  dialedPhone: string,
  supabase: any
): Promise<string | null> {
  const last10 = phoneLastDigits(dialedPhone, 10);
  if (last10.length < 10) return null;

  try {
    // Match by last 10 digits stripped of non-digit chars.
    // We cannot index on regexp_replace, so this is a sequential scan,
    // but profiles is small enough (~2k rows) that it's acceptable on
    // the cron path. The webhook path runs once per call.
    const { data: matches } = await supabase
      .from('profiles')
      .select('id, phone_number, role')
      .not('phone_number', 'is', null)
      .ilike('phone_number', `%${last10}`)
      .in('role', STAFF_ROLES);

    if (!matches || matches.length === 0) return null;

    // Filter to confirm last-10-digit match (ilike is fuzzy on substring,
    // not strict on suffix — verify in JS).
    const exact = matches.filter((p: any) => {
      const profileLast10 = phoneLastDigits(p.phone_number, 10);
      return profileLast10.length === 10 && profileLast10 === last10;
    });

    // Single confident match → attribute. Multiple → ambiguous, skip.
    if (exact.length === 1) return exact[0].id;
    return null;
  } catch {
    return null;
  }
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
  if (agent?.email) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', agent.email)
        .maybeSingle();
      if (profile?.id) return profile.id;
    } catch {
      // Non-blocking — fall through to profile-phone signal
    }
  }

  // ── Signal 3: profiles.phone_number last-10-digit match ──
  // Final fallback when AGENT_MAP email is stale or the phone isn't in
  // AGENT_MAP at all (e.g. newly added co-workers). Phone numbers tend
  // to be stable across systems, while emails drift.
  return resolveByProfilePhone(dialed, supabase);
}
