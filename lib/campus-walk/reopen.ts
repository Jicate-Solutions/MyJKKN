/**
 * Campus Walk — reopening a closed job. The ONE place that turns 'done' back
 * into work.
 *
 * Two doors, one reopen (Director, 2026-09-30):
 *   · app/api/campus-walk/not-fixed/route.ts   — the reporter's "Not fixed"
 *   · app/api/campus-walk/spot-check/route.ts  — a spot checker's "Not fixed"
 *                                                (ruling 3, the fake-fix guard)
 * Both must do exactly the same thing to the job, so both call this:
 *   · the SAME job goes back to work — never a recurrence
 *     (lib/campus-walk/repeats.ts counts recurrences; this is not one);
 *   · a fresh due date of the same length it first had (due-dates.ts);
 *   · the chase-up ladder re-armed for a new round (rungs_sent cleared, round
 *     bumped, which changes the reminders' idempotency keys);
 *   · the people who fix it are told — never by whom (D10).
 *
 * ── RULING 1: THE SECOND "NOT FIXED" ────────────────────────────────────────
 * Only a REPORTER's tap counts toward metadata.not_fixed_count. From the second
 * one on, the college head is told the job failed again. A spot checker's
 * "Not fixed" does not count: the checker IS the college head (or the
 * Director), and telling them their own tap happened is noise.
 *
 * ── SPOT CHECKS ─────────────────────────────────────────────────────────────
 * A reporter reopening a job that was waiting for a spot check marks that
 * check 'superseded' — the job is no longer a closed job to look at. A spot
 * checker's reopen marks it 'failed'.
 *
 * ── COMPARE-AND-SET, FAIL SOFT ──────────────────────────────────────────────
 * The write only lands while status_key is still 'done'. The bells after it
 * never turn a saved reopen into an error.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import { resolveAccountableProfileId } from '@/lib/campus-walk/closure';
import { dueDateFor } from '@/lib/campus-walk/due-dates';
import {
  SPOT_CHECKS_URL,
  institutionOfTask,
  resolveCollegeHeadIds,
} from '@/lib/campus-walk/spot-check';

/** Where a reopened job lands — the same 'active' status a sent-back job uses. */
export const REOPEN_STATUS = 'in_progress';

/** From this many reporter "Not fixed" taps on one job, the college head is told. */
export const HEAD_ALERT_AT_NOT_FIXED = 2;

export type ReopenVia = 'reporter' | 'spot_check';

export interface ReopenableTask {
  id: string;
  title: string | null;
  owner_staff_id: string | null;
  completed_at: string | null;
  metadata: Record<string, any> | null;
}

export interface ReopenOptions {
  byProfileId: string;
  via: ReopenVia;
  note?: string | null;
  /** People never to bell about this reopen (the reporter, the checker). */
  doNotTell?: string[];
  now?: Date;
}

export type ReopenResult =
  | {
      ok: true;
      round: number;
      dueDate: string;
      /** Reporter "Not fixed" taps on this job so far, this one included. */
      notFixedCount: number;
      /** The fixers were told. */
      notified: boolean;
      /** true told · false should have been told but nobody could be · null not needed. */
      headNotified: boolean | null;
    }
  | { ok: false; code: 'not_saved' | 'raced'; error: string };

/** How many reporter "Not fixed" taps a job has had, counting old rows too. */
export function reporterNotFixedCount(metadata: Record<string, any> | null | undefined): number {
  const m = metadata ?? {};
  const stored = Number(m.not_fixed_count);
  if (Number.isInteger(stored) && stored >= 0) return stored;
  // Rows reopened before the counter existed: every entry in reopens[] was a
  // reporter's tap, because that button was the only door.
  const reopens = Array.isArray(m.reopens) ? m.reopens : [];
  return reopens.filter((r: any) => !r?.via || r.via === 'reporter').length;
}

function formatDay(value: string): string {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export async function reopenCampusWalkTask(
  admin: SupabaseClient,
  task: ReopenableTask,
  opts: ReopenOptions
): Promise<ReopenResult> {
  const metadata: Record<string, any> = { ...((task.metadata ?? {}) as Record<string, any>) };
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const note = opts.note ? String(opts.note) : null;
  const dueDate = dueDateFor(metadata.kind, metadata.unsafe === true, now.getTime());
  const priorChase = (metadata.campus_walk_chase ?? {}) as Record<string, any>;
  const round = (Number.isInteger(Number(priorChase.round)) ? Number(priorChase.round) : 0) + 1;
  const approval = (metadata.fix?.approval ?? null) as Record<string, any> | null;

  const notFixedCount = reporterNotFixedCount(metadata) + (opts.via === 'reporter' ? 1 : 0);
  metadata.not_fixed_count = notFixedCount;

  if (metadata.fix) {
    metadata.fix = {
      ...(metadata.fix as Record<string, any>),
      approval: {
        state: 'changes_requested',
        auto: false,
        reopened_by_reporter: opts.via === 'reporter',
        reopened_by_spot_check: opts.via === 'spot_check',
        decided_at: nowIso,
        decided_by_profile_id: opts.byProfileId,
        note,
        previous_state: approval?.state ?? null,
        previous_note: approval?.note ?? null,
      },
    };
  }

  const spot = metadata.spot_check as Record<string, any> | undefined;
  if (spot && spot.state === 'pending') {
    metadata.spot_check = {
      ...spot,
      state: opts.via === 'spot_check' ? 'failed' : 'superseded',
      decided_at: nowIso,
      decided_by_profile_id: opts.byProfileId,
      note: opts.via === 'spot_check' ? note : spot.note ?? null,
    };
  }

  const priorReopens = Array.isArray(metadata.reopens) ? metadata.reopens : [];
  metadata.reopens = [
    ...priorReopens,
    {
      at: nowIso,
      by_profile_id: opts.byProfileId,
      via: opts.via,
      note,
      round,
      previous_completed_at: task.completed_at,
      due_date: dueDate,
    },
  ].slice(-20);

  // Both halves are needed: rungs_sent is the fast-path skip, the round is
  // what changes the reminders' keys (lib/campus-walk/chase-up.ts).
  metadata.campus_walk_chase = { ...priorChase, rungs_sent: {}, round };

  const { data: updatedRows, error: updateErr } = await admin
    .from('project_tasks')
    .update({
      status_key: REOPEN_STATUS,
      completed_at: null,
      due_date: dueDate,
      is_overdue: false,
      is_blocked: false,
      metadata,
    })
    .eq('id', task.id)
    .eq('status_key', 'done')
    .select('id');

  if (updateErr) {
    console.error('[campus-walk/reopen] reopen write failed:', updateErr.message);
    return { ok: false, code: 'not_saved', error: 'We could not reopen it just now. Nothing was changed — please try again.' };
  }
  if ((updatedRows ?? []).length === 0) {
    return {
      ok: false,
      code: 'raced',
      error: 'This job changed while you were looking at it. Refresh the page to see where it stands.',
    };
  }

  const shortTitle = String(task.title ?? 'Campus job').slice(0, 100);
  const doNotTell = new Set([opts.byProfileId, ...(opts.doNotTell ?? [])].filter(Boolean));

  // ── The people who fix it ────────────────────────────────────────────────
  let notified = false;
  try {
    const accountable = await resolveAccountableProfileId(admin, task);
    const fixer =
      typeof metadata.fix?.submitted_by_profile_id === 'string' ? metadata.fix.submitted_by_profile_id : null;
    const recipients = [...new Set([accountable, fixer].filter((v): v is string => Boolean(v)))].filter(
      (id) => !doNotTell.has(id)
    );

    if (recipients.length === 0) {
      console.error(`[campus-walk/reopen] reopened but nobody to tell (task ${task.id})`);
    } else {
      const who =
        opts.via === 'spot_check'
          ? `A spot check found “${shortTitle}” is not fixed.`
          : `The person who reported “${shortTitle}” says it is still not fixed.`;
      const id = await createBellNotification(admin, {
        recipientIds: recipients,
        createdBy: recipients[0],
        title: `Not fixed yet — ${shortTitle}`,
        body: `${who}${note ? ` Note: “${note}”.` : ''} It is open again and due ${formatDay(dueDate)}.`,
        url: `/campus-walk/fix?task=${task.id}`,
        category: 'campus-walk:not-fixed',
        metadata: { task_id: task.id, source: 'campus-walk', round, via: opts.via },
        idempotencyKey: `campus-walk-not-fixed:${task.id}:r${round}`,
      });
      notified = Boolean(id);
    }
  } catch (e: any) {
    console.error('[campus-walk/reopen] fixer notification failed:', e?.message ?? e);
  }

  // ── Ruling 1: the college head, from the second reporter "Not fixed" ─────
  let headNotified: boolean | null = null;
  if (opts.via === 'reporter' && notFixedCount >= HEAD_ALERT_AT_NOT_FIXED) {
    headNotified = false;
    try {
      const heads = (await resolveCollegeHeadIds(admin, institutionOfTask(metadata))).filter(
        (id) => !doNotTell.has(id)
      );
      if (heads.length === 0) {
        console.error(
          `[campus-walk/reopen] failed ${notFixedCount} times but no college head on record to tell (task ${task.id})`
        );
      } else {
        await createBellNotification(admin, {
          recipientIds: heads,
          createdBy: heads[0],
          title: `Failed ${notFixedCount} times — ${shortTitle}`,
          body:
            `“${shortTitle}” was marked fixed and the person who reported it has said “Not fixed” ` +
            `${notFixedCount} times. It is open again and due ${formatDay(dueDate)}.`,
          url: SPOT_CHECKS_URL,
          category: 'campus-walk:failed-twice',
          metadata: { task_id: task.id, source: 'campus-walk', not_fixed_count: notFixedCount },
          idempotencyKey: `campus-walk-failed-again:${task.id}:n${notFixedCount}`,
        });
        // A null return here is the idempotency index saying "already told".
        headNotified = true;
      }
    } catch (e: any) {
      console.error('[campus-walk/reopen] college head notification failed:', e?.message ?? e);
      headNotified = false;
    }
  }

  return { ok: true, round, dueDate, notFixedCount, notified, headNotified };
}
