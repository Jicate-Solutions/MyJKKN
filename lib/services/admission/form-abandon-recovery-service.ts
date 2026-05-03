// lib/services/admission/form-abandon-recovery-service.ts
// Path A B7 — Form-abandon recovery (Hour-2 nudge).
//
// Detects sessions that:
//   1. Started filling the public admission form (form_started + at least one
//      field_completed event with phone_hash or email_hash in metadata),
//   2. Did NOT submit (no form_submitted event for that session_id),
//   3. Latest event is in the window [now - detection_window_hours, now - 2h].
// For each such session, attempts to match the captured hash back to a row in
// admission_leads. Matched + opted-in + not-final-stage leads are routed to
// the existing WhatsAppReengagementService 'gentle-reengagement' sequence.
// Unmatched abandons are logged for diagnostic with matched_lead_id NULL.
//
// Privacy: this service NEVER reads raw phone/email — only sha256 digests
// already in admission_form_events.metadata. The Postgres matcher uses the
// same encode(digest(lower(trim(...)),'sha256'),'hex') recipe (see lib/utils/hash.ts).
//
// Idempotency: ON CONFLICT (session_id, form_id) DO NOTHING on the log table
// suppresses repeat-fire. A 7-day cooldown (cooldown_days policy) further
// prevents re-triggering when a user revisits the form.
//
// Server-only — imports next/headers via @/lib/supabase/server transitively.
// Do NOT import this from client components.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { WhatsAppReengagementService } from '@/lib/services/whatsapp/whatsapp-reengagement-service';

// Hardcoded floor: a session younger than 2 hours is still actively being
// filled in many cases. Wait at least this long before considering it abandoned.
const MIN_AGE_HOURS = 2;

// Default detection window ceiling. Overridable via platform_policies key
// 'admission.form_abandon.detection_window_hours'. We re-read this every
// cron invocation (no per-process cache) — the policy table is small and
// the cron runs every 30min.
const DEFAULT_DETECTION_WINDOW_HOURS = 24;

// Default per-session cooldown — minimum days between recovery messages for
// the same session_id. Overridable via 'admission.form_abandon.cooldown_days'.
const DEFAULT_COOLDOWN_DAYS = 7;

interface AbandonCandidate {
  session_id: string;
  form_id: string;
  abandoned_at: string;
  phone_hash: string | null;
  email_hash: string | null;
}

interface MatchedLead {
  id: string;
  institution_id: string;
  full_name: string | null;
  wa_opt_in: boolean | null;
  funnel_stage: string | null;
}

export interface FormAbandonRecoveryResult {
  candidates_found: number;
  matched: number;
  recovered: number;
  anonymous_logged: number;
  in_cooldown: number;
  errors: string[];
  detection_window_hours: number;
  elapsed_ms: number;
}

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service-role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Read a numeric policy with a default. The cron route runs in a server-only
 * context; we use the service-role client and call fn_get_policy directly to
 * avoid the next/headers transitive import in @/lib/policies/get-policy.
 */
async function readNumericPolicy(
  supabase: SupabaseClient,
  key: string,
  defaultValue: number
): Promise<number> {
  const { data, error } = await supabase.rpc('fn_get_policy', { p_key: key, p_scope_id: null });
  if (error || data == null) return defaultValue;
  // fn_get_policy returns JSONB. Numeric policies decode to a JS number.
  return typeof data === 'number' ? data : defaultValue;
}

/**
 * Find sessions that look abandoned in the configured window. Returns one
 * candidate per (session_id, form_id) with the most recent identity hash.
 */
async function findAbandonCandidates(
  supabase: SupabaseClient,
  windowHours: number
): Promise<AbandonCandidate[]> {
  const now = Date.now();
  const ceiling = new Date(now - windowHours * 3600_000).toISOString();
  const floor = new Date(now - MIN_AGE_HOURS * 3600_000).toISOString();

  // Pull all events in the window. Filtering set is small enough at MyJKKN
  // scale (a few hundred events / 24h) that client-side aggregation is fine.
  // We deliberately fetch only events that COULD be part of an abandoned
  // session — i.e. created within [ceiling, floor]. Sessions whose latest
  // event is older than `ceiling` (>24h) get garbage-collected naturally.
  const { data: events, error } = await supabase
    .from('admission_form_events')
    .select('session_id, form_id, event_type, metadata, created_at')
    .gte('created_at', ceiling)
    .lte('created_at', floor)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`fetch abandon candidates: ${error.message}`);
  }
  if (!events || events.length === 0) return [];

  // Bucket by session_id. We need the latest activity per session AND
  // need to know if any submitted/recovered event already exists for that
  // session — at any time, not just in the window.
  type Bucket = {
    session_id: string;
    form_id: string | null;
    latest_at: string;
    has_started: boolean;
    has_field_completed: boolean;
    phone_hash: string | null;
    email_hash: string | null;
  };

  const sessions = new Map<string, Bucket>();
  for (const ev of events as any[]) {
    const sid = ev.session_id as string | null;
    if (!sid) continue;
    let b = sessions.get(sid);
    if (!b) {
      b = {
        session_id: sid,
        form_id: ev.form_id,
        latest_at: ev.created_at,
        has_started: false,
        has_field_completed: false,
        phone_hash: null,
        email_hash: null,
      };
      sessions.set(sid, b);
    }
    if (ev.created_at > b.latest_at) b.latest_at = ev.created_at;
    if (ev.event_type === 'form_started') b.has_started = true;
    if (ev.event_type === 'field_completed') {
      b.has_field_completed = true;
      const meta = (ev.metadata ?? {}) as Record<string, unknown>;
      const ph = typeof meta.phone_hash === 'string' ? (meta.phone_hash as string) : null;
      const eh = typeof meta.email_hash === 'string' ? (meta.email_hash as string) : null;
      if (ph) b.phone_hash = ph;
      if (eh) b.email_hash = eh;
    }
  }

  if (sessions.size === 0) return [];

  // For each candidate session, check whether ANY form_submitted or
  // abandon_recovery_triggered event exists at any time. If yes → not an
  // abandon (or already recovered).
  const sessionIds = Array.from(sessions.keys());
  const { data: terminal } = await supabase
    .from('admission_form_events')
    .select('session_id, event_type')
    .in('session_id', sessionIds)
    .in('event_type', ['form_submitted', 'abandon_recovery_triggered']);

  const submitted = new Set<string>();
  for (const t of (terminal as any[]) ?? []) submitted.add(t.session_id);

  const candidates: AbandonCandidate[] = [];
  for (const b of sessions.values()) {
    if (submitted.has(b.session_id)) continue;
    if (!b.form_id) continue;
    if (!b.has_started) continue;
    if (!b.has_field_completed) continue;
    // Identity required — we can't match a fully-anonymous session, but we
    // still log it for diagnostic so Director can see the anonymous-abandon
    // rate. So we emit the candidate even when both hashes are null;
    // matchAndRecover will write anonymous rows.
    candidates.push({
      session_id: b.session_id,
      form_id: b.form_id,
      abandoned_at: b.latest_at,
      phone_hash: b.phone_hash,
      email_hash: b.email_hash,
    });
  }

  return candidates;
}

/**
 * Match a candidate's identity hashes against admission_leads via the same
 * encode(digest(lower(trim(...)),'sha256'),'hex') recipe used at write-time.
 *
 * For phone: matches against admission_leads.phone normalized to the E.164
 * recipe — we don't have a stored phone_e164 column, but normalizePhone() is
 * idempotent on already-E.164 inputs, so we hash the stored phone the same
 * way the writer hashed it. Implementation: SQL-side, we replicate the
 * normalization minimally (lower+trim) — the stored phone is already
 * E.164-shaped because lead-creation goes through normalizePhone in
 * lead-service. For email: lower+trim of admission_leads.email is exact.
 *
 * Returns the first matching active lead, or null.
 */
async function matchLeadByHash(
  supabase: SupabaseClient,
  phoneHash: string | null,
  emailHash: string | null
): Promise<MatchedLead | null> {
  if (!phoneHash && !emailHash) return null;

  // Try phone first (more reliable identity than email).
  if (phoneHash) {
    const { data, error } = await supabase.rpc('fn_match_lead_by_identity_hash', {
      p_phone_hash: phoneHash,
      p_email_hash: null,
    });
    if (!error && data && Array.isArray(data) && data.length > 0) {
      return data[0] as MatchedLead;
    }
  }
  if (emailHash) {
    const { data, error } = await supabase.rpc('fn_match_lead_by_identity_hash', {
      p_phone_hash: null,
      p_email_hash: emailHash,
    });
    if (!error && data && Array.isArray(data) && data.length > 0) {
      return data[0] as MatchedLead;
    }
  }
  return null;
}

/**
 * Check whether the same session_id already has a recovery within the
 * cooldown window. Returns true if cooldown is active (caller must skip).
 */
async function isInCooldown(
  supabase: SupabaseClient,
  sessionId: string,
  cooldownDays: number
): Promise<boolean> {
  const cutoff = new Date(Date.now() - cooldownDays * 86400_000).toISOString();
  const { data, error } = await supabase
    .from('admission_form_abandon_log')
    .select('id')
    .eq('session_id', sessionId)
    .gte('recovery_triggered_at', cutoff)
    .limit(1);
  if (error) return false; // fail open — better to attempt recovery than skip silently
  return Array.isArray(data) && data.length > 0;
}

/**
 * Public entry point invoked by /api/cron/form-abandon-recovery.
 */
export async function runFormAbandonRecovery(): Promise<FormAbandonRecoveryResult> {
  const startedAt = Date.now();
  const supabase = getServiceClient();

  const detectionWindowHours = await readNumericPolicy(
    supabase,
    'admission.form_abandon.detection_window_hours',
    DEFAULT_DETECTION_WINDOW_HOURS
  );
  const cooldownDays = await readNumericPolicy(
    supabase,
    'admission.form_abandon.cooldown_days',
    DEFAULT_COOLDOWN_DAYS
  );

  const result: FormAbandonRecoveryResult = {
    candidates_found: 0,
    matched: 0,
    recovered: 0,
    anonymous_logged: 0,
    in_cooldown: 0,
    errors: [],
    detection_window_hours: detectionWindowHours,
    elapsed_ms: 0,
  };

  let candidates: AbandonCandidate[];
  try {
    candidates = await findAbandonCandidates(supabase, detectionWindowHours);
  } catch (err) {
    result.errors.push(`findAbandonCandidates: ${err instanceof Error ? err.message : String(err)}`);
    result.elapsed_ms = Date.now() - startedAt;
    return result;
  }
  result.candidates_found = candidates.length;

  // Pull the gentle-reengagement template once.
  const sequenceTemplate = WhatsAppReengagementService.getPredefinedSequences().find(
    (s) => s.id === 'gentle-reengagement'
  );
  if (!sequenceTemplate) {
    result.errors.push('gentle-reengagement template missing — cannot launch recovery');
    result.elapsed_ms = Date.now() - startedAt;
    return result;
  }

  for (const c of candidates) {
    try {
      // Cooldown guard.
      if (await isInCooldown(supabase, c.session_id, cooldownDays)) {
        result.in_cooldown++;
        continue;
      }

      // Anonymous abandon → log only, no message.
      if (!c.phone_hash && !c.email_hash) {
        await supabase.from('admission_form_abandon_log').insert({
          session_id: c.session_id,
          form_id: c.form_id,
          abandoned_at: c.abandoned_at,
          matched_lead_id: null,
          recovery_triggered_at: null,
          detection_window_hours: detectionWindowHours,
          metadata: { reason: 'anonymous_no_identity' },
        }).then(() => undefined, () => undefined); // ignore unique-violation on retry
        result.anonymous_logged++;
        continue;
      }

      // Try to match.
      const lead = await matchLeadByHash(supabase, c.phone_hash, c.email_hash);

      if (!lead) {
        // Hash captured but no lead matches (rare — e.g. user typed a phone
        // we've never seen, or user typed a phone that exists but with
        // different normalization). Log diagnostic, no message.
        await supabase.from('admission_form_abandon_log').insert({
          session_id: c.session_id,
          form_id: c.form_id,
          abandoned_at: c.abandoned_at,
          matched_lead_id: null,
          recovery_triggered_at: null,
          detection_window_hours: detectionWindowHours,
          metadata: {
            reason: 'no_lead_match',
            had_phone_hash: !!c.phone_hash,
            had_email_hash: !!c.email_hash,
          },
        }).then(() => undefined, () => undefined);
        result.anonymous_logged++;
        continue;
      }

      result.matched++;

      // Eligibility gates.
      const stage = (lead.funnel_stage ?? '').toLowerCase();
      const isFinal = stage === 'enrolled' || stage === 'lost';
      const optedIn = lead.wa_opt_in === true;

      if (isFinal || !optedIn) {
        // Match exists but not eligible — log so the funnel still shows the
        // signal, but don't trigger a campaign.
        await supabase.from('admission_form_abandon_log').insert({
          session_id: c.session_id,
          form_id: c.form_id,
          abandoned_at: c.abandoned_at,
          matched_lead_id: lead.id,
          recovery_triggered_at: null,
          detection_window_hours: detectionWindowHours,
          metadata: {
            reason: isFinal ? 'final_stage' : 'not_opted_in',
            funnel_stage: stage,
            wa_opt_in: optedIn,
          },
        }).then(() => undefined, () => undefined);
        continue;
      }

      // Launch the gentle-reengagement sequence for this single lead.
      let launchOk = false;
      let launchErr: string | undefined;
      try {
        const launch = await WhatsAppReengagementService.launchReengagementCampaign({
          institutionId: lead.institution_id,
          sequenceTemplate,
          leadIds: [lead.id],
          createdBy: 'system:form-abandon-cron',
        });
        if (launch.sequencesCreated > 0) {
          launchOk = true;
        } else {
          launchErr = launch.errors.join('; ') || 'no sequence created';
        }
      } catch (err) {
        launchErr = err instanceof Error ? err.message : String(err);
      }

      const triggeredAt = launchOk ? new Date().toISOString() : null;

      await supabase.from('admission_form_abandon_log').insert({
        session_id: c.session_id,
        form_id: c.form_id,
        abandoned_at: c.abandoned_at,
        matched_lead_id: lead.id,
        recovery_triggered_at: triggeredAt,
        detection_window_hours: detectionWindowHours,
        metadata: launchOk
          ? { reason: 'recovery_triggered', sequence: 'gentle-reengagement' }
          : { reason: 'launch_failed', error: launchErr },
      }).then(() => undefined, () => undefined);

      if (launchOk) {
        result.recovered++;
        // Sentinel event for additional idempotency: if cron re-runs before
        // log row is queried, the form_submitted/abandon_recovery_triggered
        // check in findAbandonCandidates short-circuits.
        await supabase.from('admission_form_events').insert({
          form_id: c.form_id,
          event_type: 'abandon_recovery_triggered',
          session_id: c.session_id,
          metadata: { lead_id: lead.id, sequence: 'gentle-reengagement' },
        }).then(() => undefined, () => undefined);
      } else if (launchErr) {
        result.errors.push(`session ${c.session_id}: ${launchErr}`);
      }
    } catch (err) {
      result.errors.push(
        `session ${c.session_id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  result.elapsed_ms = Date.now() - startedAt;
  return result;
}
