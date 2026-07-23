export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * CDC Placement-Outcome loop — MEASURE-phase trigger (gates ①③ ONLY).
 *
 * Honesty label: this is NOT a self-improving loop yet. It measures each
 * (institution, program, passing-out AY) cohort's placement/higher-ed
 * conversion against the prior cohort's baseline and emits NAAC 8.2.1
 * evidence ('Placement + higher studies progression' — overlaps NIRF GO,
 * the ~20-25% NIRF parameter JKKN can actually move). The act/feed-forward
 * gates (②④) require a named CDC owner who consumes the deltas — Director
 * decision pending.
 *
 * All work happens in fn_cdc_placement_outcome_measure() (service-role-only,
 * SECURITY DEFINER): cohort enumeration from alumni_outcomes, small-cohort
 * labeling (ALL cohorts computed; n < min_cohort_size gets small_cohort=true —
 * 'Compute, but label small group', Director 2026-07-09), baseline delta
 * (±2.0pp deadband), change-only cycle history, evidence upsert. Cohort
 * AGGREGATES only, never per-student rows. Idempotent per (cohort, IST
 * calendar-month window).
 *
 * Gated on platform policy cdc_placement_loop.master_enabled (DARK by default
 * → returns skipped). Gate is checked both here and inside the fn.
 * Cadence: ai-routine dispatcher row 'cdc-placement-outcomes' (Sun 03:15 IST —
 * the dispatcher has no monthly granularity; the month-window idempotency +
 * change-only history make the effective cadence monthly).
 * Auth: CRON_SECRET via ?secret= / Authorization: Bearer / x-vercel-cron
 * (matches the other crons).
 *
 * WEEKLY NO-DATA REMINDER (Director decisions 2026-07-10, verbatim: weekly
 * reminder to the named owner; "Yes — list the held cohorts"; escalation
 * "Copy me after 4 weeks"):
 * After the measure run, if the loop is live but BOTH source tables
 * (cdc_placements, alumni_outcomes) are still empty, one in-app reminder goes
 * to the named owner (platform policy cdc_placement_loop.owner_id). Any
 * evidence-held cohorts (cdc_placement_outcome_cycles.metrics ? 'evidence_held')
 * are listed in the reminder — and, when data exists but cohorts are held, a
 * held-cohorts notice is sent on its own. When this run's no-data reminder is
 * at least the (threshold+1)-th consecutive weekly one (threshold = policy
 * cdc_placement_loop.nodata_escalation_weeks, default 4), the Director
 * (profiles row for director@jkkn.ac.in, resolved at runtime) is also
 * notified. Consecutive count is derived from prior notification history
 * (metadata.source = 'cdc-placement-nodata-reminder') — no new state table.
 * Dedupe: per-IST-day idempotency key, so a manual same-day re-fire never
 * double-sends.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import type { SupabaseClient } from '@supabase/supabase-js';

const REMINDER_SOURCE = 'cdc-placement-nodata-reminder';
/** Weekly cadence with slack — two reminders more than this many ms apart break the consecutive chain. */
const CONSECUTIVE_GAP_MS = 10 * 24 * 60 * 60 * 1000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.nextUrl.searchParams.get('secret') === secret) return true;
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  return false;
}

/** Today's date (YYYY-MM-DD) in IST — the reminder's dedupe window. */
function istDate(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function getGlobalPolicy(db: SupabaseClient, key: string): Promise<unknown> {
  const { data } = await db
    .from('platform_policies')
    .select('value')
    .eq('policy_key', key)
    .eq('scope_type', 'global')
    .maybeSingle();
  return data?.value;
}

interface HeldCohort {
  cohort_label: string;
  program: string;
  institution: string;
  hold_reason: string;
}

/** Cohorts whose evidence is held out of the ledger (metrics ? 'evidence_held'). */
async function listHeldCohorts(db: SupabaseClient): Promise<HeldCohort[]> {
  const { data, error } = await db
    .from('cdc_placement_outcome_cycles')
    .select(
      'cohort_label, metrics, programs:program_id(program_name), institutions:institution_id(name)'
    )
    .not('metrics->>evidence_held', 'is', null)
    .order('cohort_label', { ascending: false })
    .limit(50);
  if (error) {
    console.error('[cdc/placement-outcomes] held-cohort query failed:', error);
    return [];
  }
  return (data ?? []).map((row) => {
    const metrics = (row.metrics ?? {}) as Record<string, unknown>;
    // PostgREST single-FK embeds are objects; type generics may say array.
    const program = row.programs as unknown as { program_name?: string } | null;
    const institution = row.institutions as unknown as { name?: string } | null;
    return {
      cohort_label: row.cohort_label as string,
      program: program?.program_name ?? 'Unknown program',
      institution: institution?.name ?? 'Unknown institution',
      hold_reason: String(metrics.evidence_held ?? 'held'),
    };
  });
}

/**
 * How many consecutive weekly no-data reminders precede this run.
 * Derived from notification history (metadata.source marks the reminder) —
 * chain breaks on a gap > CONSECUTIVE_GAP_MS (data weeks send no reminder).
 */
async function countPriorConsecutiveReminders(db: SupabaseClient): Promise<number> {
  const { data, error } = await db
    .from('notifications')
    .select('created_at')
    .eq('metadata->>source', REMINDER_SOURCE)
    .eq('metadata->>reason', 'no_data')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) {
    console.error('[cdc/placement-outcomes] reminder-history query failed:', error);
    return 0;
  }
  let count = 0;
  let prev = Date.now();
  for (const row of data ?? []) {
    const at = new Date(row.created_at as string).getTime();
    if (prev - at > CONSECUTIVE_GAP_MS) break;
    count += 1;
    prev = at;
  }
  return count;
}

function heldCohortLines(held: HeldCohort[]): string {
  return held
    .map(
      (h) =>
        `• ${h.cohort_label} — ${h.program} (${h.institution}): complete the batch roster to release this into evidence`
    )
    .join('\n');
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceRoleClient();

  // Gate — the loop is dark unless its master switch is explicitly true.
  const masterEnabled = await getGlobalPolicy(db, 'cdc_placement_loop.master_enabled');
  if (masterEnabled !== true) {
    return NextResponse.json({
      success: true,
      skipped: 'loop dark (cdc_placement_loop.master_enabled != true)',
    });
  }

  const { data, error } = await db.rpc('fn_cdc_placement_outcome_measure');
  if (error) {
    console.error('[cdc/placement-outcomes] measure run failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // ── Weekly owner reminder (Director decisions 2026-07-10) ──────────────────
  let reminderSent = false;
  let heldCohortsListed = 0;
  let escalated = false;
  const reminderNotes: string[] = [];

  try {
    const [placements, outcomes, held] = await Promise.all([
      db.from('cdc_placements').select('id', { count: 'exact', head: true }),
      db.from('alumni_outcomes').select('id', { count: 'exact', head: true }),
      listHeldCohorts(db),
    ]);
    const noData = (placements.count ?? 0) === 0 && (outcomes.count ?? 0) === 0;
    heldCohortsListed = held.length;

    const ownerId = await getGlobalPolicy(db, 'cdc_placement_loop.owner_id');
    if (typeof ownerId !== 'string' || !ownerId) {
      reminderNotes.push('owner reminder skipped: cdc_placement_loop.owner_id not set');
    } else if (noData) {
      // 1) No usable placement data → weekly reminder to the named owner.
      const priorConsecutive = await countPriorConsecutiveReminders(db);
      const thresholdRaw = await getGlobalPolicy(db, 'cdc_placement_loop.nodata_escalation_weeks');
      const threshold = typeof thresholdRaw === 'number' && thresholdRaw > 0 ? thresholdRaw : 4;
      const weekNo = priorConsecutive + 1;

      let body =
        'The placement-outcome loop is live, but there is zero data to measure. ' +
        'Both sources are empty: CDC placement offers (cdc_placements) and alumni outcome reports (alumni_outcomes). ' +
        'Measurement starts automatically as soon as CDC enters data — nothing else to configure.';
      if (held.length > 0) {
        body += `\n\nCohorts held out of evidence (${held.length}):\n${heldCohortLines(held)}`;
      }
      body += `\n\nThis is consecutive weekly reminder #${weekNo}.`;

      const result = await fanoutNotification(db, {
        title: 'Placement loop: still no data to measure',
        body,
        userIds: [ownerId],
        createdBy: ownerId,
        category: 'cdc',
        priority: 'normal',
        source: REMINDER_SOURCE,
        idempotencyKey: `${REMINDER_SOURCE}:${istDate()}`,
        metadata: {
          reason: 'no_data',
          consecutive_week: weekNo,
          held_cohorts: held.length,
        },
      });
      reminderSent = result.notified > 0;
      if (result.skipped === 'idempotent') {
        reminderNotes.push('owner reminder already sent today (idempotent)');
      }

      // Escalation — "Copy me after 4 weeks": this run being at least the
      // (threshold+1)-th consecutive reminder copies the Director.
      if (reminderSent && priorConsecutive >= threshold) {
        const { data: director } = await db
          .from('profiles')
          .select('id')
          .eq('email', 'director@jkkn.ac.in')
          .maybeSingle();
        if (director?.id) {
          const esc = await fanoutNotification(db, {
            title: `Placement loop: ${weekNo} weeks with zero data`,
            body:
              `The placement-outcome loop has now sent ${weekNo} consecutive weekly no-data reminders to the named owner ` +
              'with no placement data entered. Both sources remain empty: CDC placement offers (cdc_placements) and ' +
              'alumni outcome reports (alumni_outcomes). You are copied per your escalation decision ("Copy me after 4 weeks").' +
              (held.length > 0
                ? `\n\nCohorts held out of evidence (${held.length}):\n${heldCohortLines(held)}`
                : ''),
            userIds: [director.id as string],
            createdBy: ownerId,
            category: 'cdc',
            priority: 'high',
            source: 'cdc-placement-nodata-escalation',
            idempotencyKey: `cdc-placement-nodata-escalation:${istDate()}`,
            metadata: { reason: 'no_data_escalation', consecutive_week: weekNo },
          });
          escalated = esc.notified > 0;
        } else {
          reminderNotes.push('escalation skipped: no profiles row for director@jkkn.ac.in');
        }
      }
    } else if (held.length > 0) {
      // 2) Data exists but cohorts are held — "Yes — list the held cohorts".
      const result = await fanoutNotification(db, {
        title: `Placement loop: ${held.length} cohort${held.length === 1 ? '' : 's'} held out of evidence`,
        body:
          'The placement-outcome loop is measuring, but these cohorts are held out of the evidence ledger:\n' +
          heldCohortLines(held),
        userIds: [ownerId],
        createdBy: ownerId,
        category: 'cdc',
        priority: 'normal',
        source: REMINDER_SOURCE,
        idempotencyKey: `${REMINDER_SOURCE}:held:${istDate()}`,
        metadata: { reason: 'held_cohorts', held_cohorts: held.length },
      });
      reminderSent = result.notified > 0;
      if (result.skipped === 'idempotent') {
        reminderNotes.push('held-cohorts notice already sent today (idempotent)');
      }
    }
  } catch (e) {
    // The reminder must never fail the measure run's response.
    console.error('[cdc/placement-outcomes] no-data reminder failed:', e);
    reminderNotes.push(`reminder error: ${e instanceof Error ? e.message : String(e)}`);
  }

  return NextResponse.json({
    success: true,
    run: data,
    reminder_sent: reminderSent,
    held_cohorts_listed: heldCohortsListed,
    escalated,
    ...(reminderNotes.length > 0 ? { reminder_notes: reminderNotes } : {}),
  });
}
