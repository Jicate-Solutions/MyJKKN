// lib/services/director-desk/handover-chase-service.ts
// ============================================================================
// Director's Desk — the chase engine (decisions 9, 10, 11, 12).
//
// Keeps handovers green: a daily nudge to whoever holds one, a status sweep
// that is the ONLY writer of `expired` and `orphaned`, and — when a due date
// passes with the work still open — the explain-in-24h-or-meet valve.
//
// ---------------------------------------------------------------------------
// THIS IS NOT A SECOND ENGINE
// ---------------------------------------------------------------------------
// The explain-or-meet valve already exists on this platform, for project tasks:
// `meeting_trigger_rules` / `meeting_trigger_events`, a 24h window, escalation
// to `meeting_pending`, and `bookPendingMeetings()` which finds the soonest slot
// both people are actually free and books it. That machinery is already
// SUBJECT-SCOPED (subject_type / subject_id).
//
// So decision 11 is implemented by teaching it one new subject type,
// 'handover', and letting the existing booking pass do the booking. Concretely:
// this file writes a `meeting_trigger_events` row with subject_type='handover',
// subject_id = the handover, judge_profile_id = the Director who handed it over,
// notified_profile_ids = [the grantee]. `bookPendingMeetings()` then reads it,
// makes the judge the host and the grantee the attendee, and books — which is
// exactly "auto-book a meeting between Director and grantee", written once.
//
// Only ONE thing genuinely differs from the project path and therefore lives
// here rather than there: what counts as an explanation. A project breach is
// answered in the notification (`action_responses`); a handover is answered by
// posting a progress note through `fn_director_handover_progress`, which lands
// in `director_handover_audit`. Detecting that is `reconcileHandoverExplanations`
// below, and it is why `reconcileProjectExplanations` now skips handover rows —
// left alone it would find no `action_responses` row and escalate every handover
// to a meeting no matter how diligently the person had answered.
//
// ---------------------------------------------------------------------------
// THE VOLUME FUSE
// ---------------------------------------------------------------------------
// Decision 9 is a recorded Director override: live from night one, daily, over
// a recommendation to run silent for a week. Built as instructed. The fuse is
// not a quiet softening of that — it is the one piece of engineering that makes
// "live on night one" survivable.
//
// Before ANY send, the run resolves its whole recipient list. Over `limit`
// (HANDOVER_CHASE_MAX_RECIPIENTS, default 50) and the run sends nothing at all,
// tells the Director alone what it computed and why, and stops. The reasoning:
// this engine writes to one person per live handover, and a real desk does not
// have 50 live handovers on it. So >50 is not "a busy night", it is a
// recipient-resolution bug — and the difference between catching that and not
// is one alert versus a mass mail to the institution.
//
// A blown fuse halts the status sweep too, not just the sending. That is
// deliberate: it makes a run atomic (it happened or it did not), and it costs
// nothing, because access is already governed live by `fn_handover_grants_key`
// (which re-checks the due date and the grantee's is_active on every permission
// check). `expired` and `orphaned` are the LABEL and the TELLING; the door is
// already shut without them.
//
// Every run is written to `director_handover_chase_runs`, fuse blown or not.
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  createBellNotification,
  getSuperAdminIds,
  todayIST
} from '@/lib/services/meetings/meeting-trigger-service';
import type { SupabaseClient } from '@supabase/supabase-js';

const MODULE = 'director-desk/chase';

/** metric_key of the rule seeded by 20260811140000. */
export const HANDOVER_METRIC = 'handover_overdue';
/** The subject type this engine adds to the shared breach ledger. */
export const HANDOVER_SUBJECT = 'handover';
/** Decision 11: the grantee gets a day to say what happened. */
export const EXPLANATION_WINDOW_HOURS = 24;
/** Default blast-radius ceiling; override with HANDOVER_CHASE_MAX_RECIPIENTS. */
export const DEFAULT_MAX_RECIPIENTS = 50;
/**
 * Hard ceiling on how many handovers one run will even load. Far above any
 * plausible real number — it exists so a runaway query cannot turn into a
 * runaway run before the fuse has had a chance to look at it.
 */
const LOAD_LIMIT = 500;

/**
 * Where the two sides of this feature live. Both routes are owned by sibling
 * lanes (PR3 builds /my-desk, PR4 the Director's desk) and neither exists on
 * main yet — these constants are the single place to correct if those lanes
 * land on different paths.
 */
const GRANTEE_DESK_URL = '/my-desk';
const DIRECTOR_DESK_URL = '/director-desk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HandoverRow {
  id: string;
  route: string;
  title: string;
  grantee_user_id: string;
  granted_by: string;
  institution_id: string | null;
  status: string;
  due_date: string;
  last_activity_at: string | null;
  responded_at: string | null;
}

export interface GranteeProfile {
  id: string;
  is_active: boolean | null;
}

export interface Classification {
  /** status pending|accepted, grantee active, due date not yet passed. */
  live: HandoverRow[];
  /** due date passed while still open — relabel + open the 24h valve. */
  expired: HandoverRow[];
  /** grantee's profile is gone or inactive — relabel + tell the Director. */
  orphaned: HandoverRow[];
}

export interface HandoverChaseResult {
  run_date: string;
  loaded: number;
  live_handovers: number;
  recipients_resolved: number;
  fuse_limit: number;
  fuse_blown: boolean;
  nudged: number;
  already_nudged: number;
  expired: number;
  orphaned: number;
  overdue_opened: number;
  explained: number;
  escalated: number;
  director_notices: number;
  errors: string[];
}

export interface HandoverReconcileResult {
  explained: number;
  escalated: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Pure helpers — everything decidable without the database lives here, so the
// fuse and the classifier can be tested against invented data rather than by
// re-implementing their SQL (feedback_test_that_models_sql_proves_nothing).
// ---------------------------------------------------------------------------

/**
 * Read the fuse ceiling from the environment, defensively. A typo'd or negative
 * env value must not silently DISABLE the fuse — that is the exact failure the
 * fuse exists to prevent — so anything unusable falls back to the default.
 */
export function readFuseLimit(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env.HANDOVER_CHASE_MAX_RECIPIENTS;
  if (raw == null || raw.trim() === '') return DEFAULT_MAX_RECIPIENTS;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    return DEFAULT_MAX_RECIPIENTS;
  }
  return n;
}

/** Whole days from the due date to today. Negative = still in the future. */
export function daysPastDue(dueDate: string, todayISO: string): number {
  const [dy, dm, dd] = dueDate.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = todayISO.slice(0, 10).split('-').map(Number);
  if ([dy, dm, dd, ty, tm, td].some((n) => !Number.isFinite(n))) return 0;
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(dy, dm - 1, dd)) / 86400000
  );
}

/**
 * Split the open handovers three ways.
 *
 * Order matters: orphaned is checked FIRST. A handover whose grantee has left
 * AND whose due date has passed is orphaned, not expired — decision 7 is about
 * the item coming back to the Director, and telling him "it expired" would hide
 * the fact that the person is gone.
 *
 * A grantee with no profile row at all is treated as orphaned too. It should be
 * impossible (grantee_user_id is a FK with ON DELETE CASCADE), but "the row
 * vanished" and "the person left" have the same correct response, and the
 * alternative is a handover nobody is ever nudged about.
 */
export function classifyHandovers(
  rows: HandoverRow[],
  profilesById: Map<string, GranteeProfile>,
  todayISO: string
): Classification {
  const out: Classification = { live: [], expired: [], orphaned: [] };
  for (const h of rows) {
    const p = profilesById.get(h.grantee_user_id);
    if (!p || p.is_active === false) {
      out.orphaned.push(h);
      continue;
    }
    // Decision 4: the due date is inclusive — a handover due today is live all
    // day. It expires the morning after.
    if (daysPastDue(h.due_date, todayISO) >= 1) {
      out.expired.push(h);
      continue;
    }
    out.live.push(h);
  }
  return out;
}

/**
 * Everyone this run intends to write to, deduped. This is what the fuse
 * measures, and it is computed BEFORE anything is sent — measuring after the
 * first batch went out would defeat the entire point.
 *
 * Director ids are included because they are genuine recipients (orphan notices
 * and escalations land on them). They are a handful of people, so they never
 * move the number materially — but leaving them out would make the fuse
 * describe something other than the run.
 */
export function resolveRunRecipients(
  c: Classification,
  directorIds: string[]
): string[] {
  const set = new Set<string>();
  for (const h of c.live) set.add(h.grantee_user_id);
  for (const h of c.expired) set.add(h.grantee_user_id);
  // Orphaned grantees are deliberately NOT nudged — they have left. Their
  // Director is, which the loop below covers.
  for (const h of c.orphaned) set.add(h.granted_by);
  for (const h of c.expired) set.add(h.granted_by);
  for (const id of directorIds) set.add(id);
  return [...set].filter(Boolean).sort();
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a notification targeting payload before it is written.
 *
 * `notifications.targeting` contents are unvalidated by this repo's schema —
 * anything shaped like jsonb is accepted, including `{user_ids: [null]}` or an
 * empty array, which produce a notification that reaches nobody and looks
 * delivered. Since the whole chase engine is judged on "did the person get
 * nudged", a silent no-op recipient list is the failure mode that matters most,
 * so it is rejected here rather than discovered later.
 */
export interface TargetingCheck {
  ok: boolean;
  /** Deduped, validated ids. Empty when ok is false. */
  userIds: string[];
  reason?: string;
}

export function validateTargeting(userIds: unknown): TargetingCheck {
  // NOT a discriminated union on purpose: this repo compiles with
  // strictNullChecks off, under which `if (!check.ok)` does not narrow a
  // `{ok:true}|{ok:false}` union and every read of `.reason` is a type error.
  if (!Array.isArray(userIds)) return { ok: false, userIds: [], reason: 'not an array' };
  if (userIds.length === 0) {
    return { ok: false, userIds: [], reason: 'empty recipient list' };
  }
  const clean: string[] = [];
  for (const id of userIds) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      return { ok: false, userIds: [], reason: `not a uuid: ${JSON.stringify(id)}` };
    }
    if (!clean.includes(id)) clean.push(id);
  }
  return { ok: true, userIds: clean };
}

/**
 * The daily nudge's identity. The DB's partial unique index on
 * `notifications.idempotency_key` is what actually enforces once-per-day — a
 * read-then-write check would let two overlapping runs both decide "not sent
 * yet" and both send.
 */
export function nudgeIdempotencyKey(handoverId: string, runDate: string): string {
  return `handover-chase:nudge:${handoverId}:${runDate}`;
}

/** How the daily nudge reads. Pure so the wording is testable. */
export function nudgeCopy(
  h: HandoverRow,
  todayISO: string
): { title: string; body: string } {
  const left = -daysPastDue(h.due_date, todayISO);
  const when =
    left <= 0
      ? 'due today'
      : left === 1
        ? 'due tomorrow'
        : `due in ${left} days`;

  if (h.status === 'pending') {
    return {
      title: `Please accept or decline — ${h.title}`,
      body:
        `The Director handed "${h.title}" to you and it is ${when}. You can ` +
        `already open the page to see what is involved. Let him know whether ` +
        `you are taking it on, or decline and say why — either answer is fine, ` +
        `no answer is what holds things up.`
    };
  }
  return {
    title: `Still with you — ${h.title}`,
    body:
      `"${h.title}" is ${when}. If it is moving, post a one-line update so the ` +
      `Director can see it without asking. If it is finished, mark it done and ` +
      `this stops.`
  };
}

// ---------------------------------------------------------------------------
// Director resolution
// ---------------------------------------------------------------------------

/**
 * Who "the Director" is for a run-level notice (the blown fuse).
 *
 * Resolved BY ROLE, mirroring `fn_can_hand_over()`, so it survives the person
 * changing. Falls back to super-admins when nobody holds the role, because a
 * blown fuse that nobody is told about is strictly worse than telling a few
 * extra admins.
 *
 * For a PER-HANDOVER notice this is NOT used: those go to `granted_by`, the
 * individual who actually handed that item over and onto whose desk decision 7
 * puts it back.
 */
export async function resolveDirectorIds(db: SupabaseClient): Promise<string[]> {
  const { data } = await db
    .from('profiles')
    .select('id')
    .eq('role', 'director')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  const ids = ((data ?? []) as any[]).map((r) => r.id).filter(Boolean);
  if (ids.length > 0) return ids;
  return getSuperAdminIds(db);
}

/** Send a bell, but only after the targeting payload has been checked. */
async function sendChecked(
  db: SupabaseClient,
  opts: Parameters<typeof createBellNotification>[1],
  errors: string[]
): Promise<string | null> {
  const check = validateTargeting(opts.recipientIds);
  if (!check.ok) {
    errors.push(`targeting rejected (${check.reason}) for "${opts.title}"`);
    logger.warn(MODULE, 'targeting rejected, nothing sent', {
      reason: check.reason,
      title: opts.title
    });
    return null;
  }
  return createBellNotification(db, {
    ...opts,
    recipientIds: check.userIds,
    createdBy: opts.createdBy || check.userIds[0]
  });
}

// ---------------------------------------------------------------------------
// The nightly run
// ---------------------------------------------------------------------------

export async function runHandoverChase(
  opts: { now?: Date; client?: SupabaseClient } = {}
): Promise<HandoverChaseResult> {
  const db = opts.client ?? createServiceRoleClient();
  const now = opts.now ?? new Date();
  const runDate = todayIST(now);
  const fuseLimit = readFuseLimit();

  const result: HandoverChaseResult = {
    run_date: runDate,
    loaded: 0,
    live_handovers: 0,
    recipients_resolved: 0,
    fuse_limit: fuseLimit,
    fuse_blown: false,
    nudged: 0,
    already_nudged: 0,
    expired: 0,
    orphaned: 0,
    overdue_opened: 0,
    explained: 0,
    escalated: 0,
    director_notices: 0,
    errors: []
  };

  // --- 1. load the open handovers ------------------------------------------
  const { data: rows, error: loadErr } = await db
    .from('director_handovers')
    .select(
      'id, route, title, grantee_user_id, granted_by, institution_id, status, due_date, last_activity_at, responded_at'
    )
    .in('status', ['pending', 'accepted'])
    .is('revoked_at', null)
    .order('due_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(LOAD_LIMIT);

  if (loadErr) {
    // 42P01 = undefined_table: the spine migration has not been applied to this
    // database yet. MyJKKN deploys ship CODE, not migrations, so this is an
    // ordinary state on the night a deploy lands ahead of its migration. It is
    // still recorded as `failed` rather than as a quiet empty run: "I could not
    // look" and "there was nothing to do" produce the same silence, and only one
    // of them is fine (feedback_empty_response_from_failclosed_producer_means_unknown).
    const missing = (loadErr as any).code === '42P01';
    result.errors.push(
      missing
        ? 'director_handovers not present yet (spine migration unapplied) — nothing chased'
        : `load handovers: ${loadErr.message}`
    );
    await recordRun(db, result, 'failed', {});
    return result;
  }

  const handovers = (rows ?? []) as unknown as HandoverRow[];
  result.loaded = handovers.length;

  // --- 2. classify (no writes yet) -----------------------------------------
  const granteeIds = [...new Set(handovers.map((h) => h.grantee_user_id))];
  const profilesById = new Map<string, GranteeProfile>();
  if (granteeIds.length > 0) {
    const { data: profs, error: profErr } = await db
      .from('profiles')
      .select('id, is_active')
      .in('id', granteeIds);
    if (profErr) {
      // RLS denial is silent (0 rows, error null), but a genuine error here
      // would make EVERY grantee look inactive and orphan the whole desk. Stop
      // rather than sweep on a guess.
      result.errors.push(`load grantees: ${profErr.message}`);
      await recordRun(db, result, 'failed', {});
      return result;
    }
    for (const p of (profs ?? []) as any[]) {
      profilesById.set(p.id, { id: p.id, is_active: p.is_active });
    }
  }

  const classified = classifyHandovers(handovers, profilesById, runDate);
  result.live_handovers = classified.live.length;

  const directorIds = await resolveDirectorIds(db);
  const recipients = resolveRunRecipients(classified, directorIds);
  result.recipients_resolved = recipients.length;

  // --- 3. THE FUSE ---------------------------------------------------------
  if (recipients.length > fuseLimit) {
    result.fuse_blown = true;
    logger.error(MODULE, 'volume fuse blown — nothing sent', {
      resolved: recipients.length,
      limit: fuseLimit,
      run_date: runDate
    });

    const detail = {
      resolved: recipients.length,
      limit: fuseLimit,
      recipient_ids: recipients,
      live: classified.live.length,
      expired: classified.expired.length,
      orphaned: classified.orphaned.length,
      loaded: handovers.length
    };

    if (directorIds.length > 0) {
      const sent = await sendChecked(
        db,
        {
          recipientIds: directorIds,
          createdBy: directorIds[0],
          title: 'Handover chase halted — too many people',
          body:
            `Tonight's handover chase worked out that it would write to ` +
            `${recipients.length} people, and the safety limit is ${fuseLimit}. ` +
            `It sent nothing and stopped.\n\n` +
            `It was looking at ${handovers.length} open handovers ` +
            `(${classified.live.length} running, ${classified.expired.length} ` +
            `past their date, ${classified.orphaned.length} whose owner has ` +
            `left). Those numbers should be small; if they are, the fault is in ` +
            `how the engine worked out who to write to, not in your desk. ` +
            `Nobody was messaged and no handover changed.`,
          url: DIRECTOR_DESK_URL,
          category: 'director:handover-chase-halted',
          metadata: { ...detail, source: 'cron:director-handover-chase' }
        },
        result.errors
      );
      if (sent) result.director_notices++;
    }

    await recordRun(db, result, 'halted_volume_fuse', detail);
    return result;
  }

  // --- 4. orphan sweep (decision 7) ----------------------------------------
  for (const h of classified.orphaned) {
    try {
      // .select() is not decoration here. Without it the update reports
      // {data:null,error:null} whether it matched a row or none, and the sweep
      // would go on to write an audit entry and a notice for a handover somebody
      // finished, declined or revoked since this run loaded it.
      const { data: swept, error } = await db
        .from('director_handovers')
        .update({ status: 'orphaned' })
        .eq('id', h.id)
        .in('status', ['pending', 'accepted'])
        .select('id');
      if (error) {
        result.errors.push(`orphan ${h.id}: ${error.message}`);
        continue;
      }
      if ((swept ?? []).length === 0) continue; // closed while this run was thinking
      result.orphaned++;

      await db.from('director_handover_audit').insert({
        handover_id: h.id,
        action: 'orphaned',
        actor_user_id: null,
        detail: {
          previous_status: h.status,
          reason: 'grantee profile is inactive or missing',
          note:
            'Access was already cut live by the is_active check in ' +
            'fn_handover_grants_key. This is the relabel and the telling.',
          source: 'cron:director-handover-chase',
          run_date: runDate
        }
      });

      const sent = await sendChecked(
        db,
        {
          recipientIds: [h.granted_by],
          createdBy: h.granted_by,
          title: `Back on your desk — ${h.title}`,
          body:
            `"${h.title}" was with someone who has left, so it is yours again. ` +
            `Their access was already cut the moment their account went ` +
            `inactive — nothing was open in the meantime. Hand it to somebody ` +
            `else when you are ready.`,
          url: DIRECTOR_DESK_URL,
          category: 'director:handover-orphaned',
          metadata: {
            handover_id: h.id,
            route: h.route,
            source: 'cron:director-handover-chase'
          }
        },
        result.errors
      );
      if (sent) result.director_notices++;
    } catch (e: any) {
      result.errors.push(`orphan ${h.id}: ${e?.message ?? String(e)}`);
    }
  }

  // --- 5. expiry sweep + open the 24h valve (decisions 4 + 11) --------------
  const rule = await loadHandoverRule(db);
  for (const h of classified.expired) {
    try {
      // Same guard as the orphan sweep, and it matters more here: without it a
      // handover marked done in the seconds since this run loaded would still
      // get a "past its date" notice and, 24 hours later, a meeting with the
      // Director about work that was already finished.
      const { data: swept, error } = await db
        .from('director_handovers')
        .update({ status: 'expired' })
        .eq('id', h.id)
        .in('status', ['pending', 'accepted'])
        .select('id');
      if (error) {
        result.errors.push(`expire ${h.id}: ${error.message}`);
        continue;
      }
      if ((swept ?? []).length === 0) continue; // closed while this run was thinking
      result.expired++;

      const overdueBy = daysPastDue(h.due_date, runDate);
      await db.from('director_handover_audit').insert({
        handover_id: h.id,
        action: 'expired',
        actor_user_id: null,
        detail: {
          previous_status: h.status,
          due_date: h.due_date,
          days_past_due: overdueBy,
          source: 'cron:director-handover-chase',
          run_date: runDate
        }
      });

      // The valve only opens if the rule is active. Decision 9 seeds it active,
      // but somebody may have switched it off in /meetings/triggers, and that
      // switch has to mean something.
      if (!rule) continue;

      // So does the threshold on that same screen. It is seeded at 1 — "the day
      // after the due date" — and at 1 this is always true, because a handover
      // only reaches this loop once it is at least a day past due. It is checked
      // anyway so the number on the admin screen is not decoration.
      //
      // Raising it above 1 switches the valve OFF rather than adding a grace
      // period, and that is not a bug to fix here: access itself ends at the due
      // date (decision 4), so by day 2 the handover is already labelled expired
      // and is no longer in this engine's candidate set. There is no day-3 pass
      // for it to be caught by. The rule's `notes` says so.
      if (overdueBy < Number(rule.threshold ?? 1)) continue;

      const deadline = new Date(
        now.getTime() + EXPLANATION_WINDOW_HOURS * 60 * 60 * 1000
      ).toISOString();

      const { data: ev, error: evErr } = await db
        .from('meeting_trigger_events')
        .insert({
          rule_id: rule.id,
          institution_id: h.institution_id,
          metric_key: HANDOVER_METRIC,
          observed_value: overdueBy,
          threshold: rule.threshold,
          breach_date: runDate,
          status: 'notified',
          subject_type: HANDOVER_SUBJECT,
          subject_id: h.id,
          subject_label: h.title,
          // Decision 11's meeting is between the Director and the grantee. The
          // judge becomes the host and notified_profile_ids[0] the attendee in
          // bookPendingMeetings — so setting these two correctly IS the booking.
          judge_profile_id: h.granted_by,
          notified_profile_ids: [h.grantee_user_id],
          explanation_deadline: deadline
        })
        .select('id')
        .single();

      if (evErr) {
        // 23505 = the valve already opened for this handover today.
        if ((evErr as any).code !== '23505') {
          result.errors.push(`valve ${h.id}: ${evErr.message}`);
        }
        continue;
      }
      result.overdue_opened++;

      const notificationId = await sendChecked(
        db,
        {
          recipientIds: [h.grantee_user_id],
          createdBy: h.granted_by,
          title: `Past its date — ${h.title}`,
          body:
            `"${h.title}" was due ${h.due_date} and is still open, so your ` +
            `access to that page has ended. Post a short note on what happened ` +
            `and where it stands within ${EXPLANATION_WINDOW_HOURS} hours and ` +
            `it goes straight to the Director. If nothing comes, a short ` +
            `meeting with him gets put in both your calendars.`,
          url: GRANTEE_DESK_URL,
          category: 'director:handover-overdue',
          metadata: {
            handover_id: h.id,
            event_id: (ev as any).id,
            days_past_due: overdueBy,
            source: 'cron:director-handover-chase'
          }
        },
        result.errors
      );
      if (notificationId) {
        await db
          .from('meeting_trigger_events')
          .update({ notification_id: notificationId })
          .eq('id', (ev as any).id);
      }
    } catch (e: any) {
      result.errors.push(`expire ${h.id}: ${e?.message ?? String(e)}`);
    }
  }

  // --- 6. the daily nudge (decision 10) ------------------------------------
  for (const h of classified.live) {
    try {
      const copy = nudgeCopy(h, runDate);
      const sent = await sendChecked(
        db,
        {
          recipientIds: [h.grantee_user_id],
          createdBy: h.granted_by,
          title: copy.title,
          body: copy.body,
          url: GRANTEE_DESK_URL,
          category: 'director:handover-nudge',
          metadata: {
            handover_id: h.id,
            route: h.route,
            due_date: h.due_date,
            status: h.status,
            source: 'cron:director-handover-chase'
          },
          // Once per handover per day, enforced by the DB.
          idempotencyKey: nudgeIdempotencyKey(h.id, runDate)
        },
        result.errors
      );
      if (sent) result.nudged++;
      else result.already_nudged++;
    } catch (e: any) {
      result.errors.push(`nudge ${h.id}: ${e?.message ?? String(e)}`);
    }
  }

  // --- 7. close the loop on anything already in the valve ------------------
  const rec = await reconcileHandoverExplanations({ now, client: db });
  result.explained = rec.explained;
  result.escalated = rec.escalated;
  result.errors.push(...rec.errors);

  await recordRun(db, result, 'sent', {
    live: classified.live.length,
    expired: classified.expired.length,
    orphaned: classified.orphaned.length
  });

  return result;
}

// ---------------------------------------------------------------------------
// The 24h valve for handovers (decision 11 steps 2 and 3)
// ---------------------------------------------------------------------------

/**
 * For every open handover breach:
 *   - a progress note posted since the breach → route it to the Director and
 *     STOP escalating (decision 11 step 2);
 *   - the 24h window closed with nothing → hand the event to the existing
 *     booking pass, which puts a short Director/grantee meeting on the soonest
 *     slot they are both free (step 3).
 *
 * Runs on the nightly chase AND on the existing hourly meeting-trigger-reconcile
 * cron. Hourly matters: "within 24h" enforced once a night would in practice be
 * anything from 24 to 48 hours, which is not the decision that was made.
 * Re-running is safe — every branch is a status transition guarded by the status
 * it transitions from.
 */
export async function reconcileHandoverExplanations(
  opts: { now?: Date; client?: SupabaseClient } = {}
): Promise<HandoverReconcileResult> {
  const db = opts.client ?? createServiceRoleClient();
  const now = opts.now ?? new Date();
  const nowISO = now.toISOString();
  const result: HandoverReconcileResult = { explained: 0, escalated: 0, errors: [] };

  const { data: events, error } = await db
    .from('meeting_trigger_events')
    .select(
      'id, subject_id, subject_label, explanation_deadline, judge_profile_id, notified_profile_ids, created_at'
    )
    .eq('status', 'notified')
    .eq('subject_type', HANDOVER_SUBJECT)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    result.errors.push(`load handover events: ${error.message}`);
    return result;
  }

  for (const ev of (events ?? []) as any[]) {
    try {
      const judge: string[] = ev.judge_profile_id ? [ev.judge_profile_id] : [];

      // 1. Did they explain? The answer lives in the audit trail, written by
      //    fn_director_handover_progress — NOT in action_responses, which is
      //    where the project path looks. Anchored at the event's own created_at
      //    so a progress note from before the due date cannot be mistaken for an
      //    answer to a question that had not been asked yet.
      const { data: notes, error: noteErr } = await db
        .from('director_handover_audit')
        .select('detail, actor_user_id, created_at')
        .eq('handover_id', ev.subject_id)
        .eq('action', 'progress')
        .gte('created_at', ev.created_at)
        .order('created_at', { ascending: true })
        .limit(1);

      if (noteErr) {
        result.errors.push(`audit read ${ev.id}: ${noteErr.message}`);
        continue;
      }

      const note = (notes ?? [])[0] as any;
      if (note) {
        const text = String(note.detail?.note ?? '').trim();
        await db
          .from('meeting_trigger_events')
          .update({
            status: 'explained',
            explanation_text: text,
            explained_at: note.created_at,
            explained_by: note.actor_user_id
          })
          .eq('id', ev.id)
          .eq('status', 'notified');

        if (judge.length > 0) {
          await sendChecked(
            db,
            {
              recipientIds: judge,
              createdBy: judge[0],
              title: `They answered — ${ev.subject_label}`,
              body:
                `On "${ev.subject_label}", which went past its date:\n\n` +
                `"${text}"\n\n` +
                `Nothing further is scheduled. Hand it on again, extend it, or ` +
                `let it rest.`,
              url: DIRECTOR_DESK_URL,
              category: 'director:handover-explained',
              metadata: {
                event_id: ev.id,
                handover_id: ev.subject_id,
                source: 'cron:director-handover-chase'
              }
            },
            result.errors
          );
        }
        result.explained++;
        continue;
      }

      // 2. Window closed with nothing said → hand it to the booking pass.
      if (ev.explanation_deadline && nowISO > ev.explanation_deadline) {
        const { error: upErr } = await db
          .from('meeting_trigger_events')
          .update({ status: 'meeting_pending' })
          .eq('id', ev.id)
          .eq('status', 'notified');
        if (upErr) {
          result.errors.push(`escalate ${ev.id}: ${upErr.message}`);
          continue;
        }

        if (judge.length > 0) {
          await sendChecked(
            db,
            {
              recipientIds: judge,
              createdBy: judge[0],
              title: `No answer — ${ev.subject_label}`,
              body:
                `"${ev.subject_label}" went past its date and nobody said why ` +
                `within ${EXPLANATION_WINDOW_HOURS} hours. A short meeting is ` +
                `being booked for the two of you at the next time you are both ` +
                `free.`,
              url: DIRECTOR_DESK_URL,
              category: 'director:handover-escalated',
              metadata: {
                event_id: ev.id,
                handover_id: ev.subject_id,
                source: 'cron:director-handover-chase'
              }
            },
            result.errors
          );
        }
        result.escalated++;
      }
    } catch (e: any) {
      result.errors.push(`event ${ev.id}: ${e?.message ?? String(e)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Small IO helpers
// ---------------------------------------------------------------------------

interface HandoverRule {
  id: string;
  threshold: number;
}

/** The single active global handover rule, or null when it has been switched off. */
async function loadHandoverRule(db: SupabaseClient): Promise<HandoverRule | null> {
  const { data } = await db
    .from('meeting_trigger_rules')
    .select('id, threshold')
    .eq('metric_key', HANDOVER_METRIC)
    .eq('active', true)
    .is('institution_id', null)
    .maybeSingle();
  return (data as any) ?? null;
}

/** Write the run to the ledger. Never throws — a log failure must not fail the run. */
async function recordRun(
  db: SupabaseClient,
  r: HandoverChaseResult,
  outcome: 'sent' | 'halted_volume_fuse' | 'failed',
  detail: Record<string, unknown>
): Promise<void> {
  try {
    await db.from('director_handover_chase_runs').insert({
      run_date: r.run_date,
      finished_at: new Date().toISOString(),
      live_handovers: r.live_handovers,
      recipients_resolved: r.recipients_resolved,
      fuse_limit: r.fuse_limit,
      fuse_blown: r.fuse_blown,
      outcome,
      nudged: r.nudged,
      expired: r.expired,
      orphaned: r.orphaned,
      overdue_opened: r.overdue_opened,
      explained: r.explained,
      escalated: r.escalated,
      detail: { ...detail, loaded: r.loaded, already_nudged: r.already_nudged },
      errors: r.errors.slice(0, 50)
    });
  } catch (e: any) {
    logger.error(MODULE, 'failed to record chase run', e);
  }
}
