/**
 * Campus Walk — "same as before" (D7).
 *
 * Spec: specs/campus-walk-2026-08-17.md, D7 ("Reopen the original task, log
 * each reopen as a dated occurrence so 'Block C — 9th time' stays visible").
 * See lib/services/campus-walk/campus-walk-service.ts's own header for why
 * this rides project_tasks under CAMPUS-OPS rather than grievance_tickets.
 *
 * ── THE LOCKED RULING, AND WHY IT SHAPES THIS FILE ──────────────────────────
 * The Director taps "same as before" himself. There is NO auto-matching in
 * this file — no fuzzy text similarity, no photo-hash comparison, no "looks
 * like this other ticket" heuristic, and nothing here ever guesses which
 * prior task an observation belongs to. Silent auto-matching would merge
 * unrelated problems and hide genuine recurrences, which is the exact
 * opposite of the point: a recurring problem must read as recurring
 * ("Block C — 9th time"), not as nine unrelated tickets — and something that
 * is NOT a recurrence must never be dressed up as one. Only a human standing
 * there knows which is which. `reopenAsRepeat` below takes a `taskId` the
 * caller already picked; it does no matching of its own.
 *
 * ── WHAT "REOPEN" MEANS HERE ─────────────────────────────────────────────
 * Tapping "same as before" on a closed ticket does not create a new task
 * row. It reopens THAT task — status_key back to 'todo', due date
 * recomputed, RACI re-routed if needed — and appends one dated entry to
 * metadata.occurrences. The number "Block C — 9th time" reads is
 * metadata.occurrence_count, so any screen can show it without a join or a
 * COUNT(*) query. Prior occurrences are copied forward untouched on every
 * reopen — never overwritten, never trimmed.
 *
 * ── AN UNSAFE RECURRENCE RE-ALERTS (Director ruling, 2026-09-04) ─────────
 * D6's phone alert used to fire only at capture time, so "Block C, ninth
 * time, still unsafe" reopened the ticket and paged nobody — a repeatedly
 * ignored danger went quieter with every repeat, which is exactly backwards.
 * A reopen of a ticket carrying metadata.unsafe now fires the same alert the
 * first report did, through the same module
 * (lib/campus-walk/urgent-alert.ts), carrying the occurrence number so the
 * phone says "9th time" rather than reading like a fresh report. One reopen
 * fires one alert: the send sits on the single, linear path below, and the
 * undelivered alarm behind it is keyed per (task, occurrence).
 *
 * ── ROUTING IS NOT RE-IMPLEMENTED HERE ───────────────────────────────────
 * Due date by kind/unsafe, the EAO fallback when there is no valid owner,
 * and leave reassignment are the exact rules createWalkTask already runs for
 * a brand-new report. This file calls campus-walk-service's exported
 * `routeAccountable` rather than keeping a second, driftable copy of that
 * logic — the whole point of "reopen the original task" is that a
 * recurrence gets the SAME routing a fresh report would get.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import {
  routeAccountable,
  mapStaffToProfilesLocal,
  type WalkKind
} from '@/lib/services/campus-walk/campus-walk-service';
import {
  sendUrgentConditionAlert,
  type UrgentAlertOutcome
} from '@/lib/campus-walk/urgent-alert';

/**
 * Terminal states a ticket must be in before "same as before" applies. A
 * ticket still in `review` is awaiting the Director's approval, not
 * closed — reopening it would fight the approval flow instead of recording
 * a recurrence, so that is refused with its own explicit reason below.
 */
const REOPENABLE_STATUS_KEYS = new Set(['done', 'cancelled']);

export interface ReopenAsRepeatInput {
  taskId: string;
  /** profiles.id of whoever tapped the button. D2 (Director-only) is enforced by the caller, not here. */
  reopenedByProfileId: string;
}

export type ReopenAsRepeatResult =
  | {
      ok: true;
      taskId: string;
      /** Total times this problem has been reported, original filing counted as occurrence #1. */
      occurrenceCount: number;
      dueDate: string;
      accountableProfileId: string | null;
      routedToEaoNoOwner: boolean;
      onApprovedLeave: boolean;
      /**
       * True when this reopen could NOT establish an accountable owner in
       * project_task_assignees — either routing found nobody at all (not
       * even the EAO fallback), or the delete/delete/insert RACI write
       * itself failed. The status/due-date/occurrence-log changes above
       * still committed (this stays ok:true — a RACI hiccup must not undo a
       * reopen that already landed), but the ticket now has nobody
       * accountable and cannot close until someone is assigned. Recorded on
       * metadata.accountable_assignment_failed and pushed to whoever
       * reopened it (input.reopenedByProfileId, D2-gated to the Director) as
       * a bell notification — never left silent the way the naive two-step
       * RACI write this replaced was.
       */
      ownerAssignmentFailed: boolean;
      /**
       * D6 on a recurrence (Director ruling, 2026-09-04). Present ONLY when
       * the reopened ticket is marked unsafe; undefined otherwise, so an
       * ordinary recurrence's result shape is unchanged. Carries whether a
       * phone was actually reached — the caller is expected to surface
       * `failureReason` rather than discard it, because a danger reported for
       * the ninth time that paged nobody must not read as one that did.
       */
      urgentAlert?: UrgentAlertOutcome;
    }
  | {
      ok: false;
      code: 'not_found' | 'wrong_lane' | 'not_closed' | 'lookup_failed' | 'update_failed';
      /** Plain-English, safe to show verbatim to the Director. Never a redirect (house rule #27). */
      error: string;
    };

interface TaskForReopen {
  id: string;
  project_id: string | null;
  title: string;
  status_key: string;
  owner_staff_id: string | null;
  metadata: Record<string, any>;
}

/**
 * Reopen the original ticket as a recorded recurrence. The caller already
 * knows exactly which task this is (D7 — no matching happens in here); this
 * function's whole job is to reopen it correctly and log the occurrence.
 *
 * Returns a discriminated result rather than null-on-failure (unlike
 * createWalkTask/cancelWalkTask): a Director's direct tap on a specific
 * ticket needs a specific, visible reason if it does not go through, not a
 * generic failure.
 */
export async function reopenAsRepeat(
  db: SupabaseClient,
  input: ReopenAsRepeatInput
): Promise<ReopenAsRepeatResult> {
  try {
    const { data: existing, error: fetchError } = await db
      .from('project_tasks')
      .select('id, project_id, title, status_key, owner_staff_id, metadata')
      .eq('id', input.taskId)
      .maybeSingle();

    if (fetchError) {
      console.error('[campus-walk/repeats] lookup failed:', fetchError.message);
      return {
        ok: false,
        code: 'lookup_failed',
        error: 'We could not load this ticket just now. Please try again in a moment.'
      };
    }
    if (!existing?.id) {
      return { ok: false, code: 'not_found', error: 'That ticket no longer exists.' };
    }

    const task = existing as TaskForReopen;
    const metadata: Record<string, any> = { ...(task.metadata ?? {}) };

    // Refuse any task that is not a campus-walk ticket — same rule
    // app/api/campus-walk/fix/route.ts enforces on its own lane. With
    // project_* RLS open to any authenticated user (auth.uid() IS NOT NULL
    // for read AND write), an unscoped writer here would let "same as
    // before" reopen any project task in the institution.
    if (metadata.source !== 'campus-walk') {
      return {
        ok: false,
        code: 'wrong_lane',
        error: 'This screen only reopens campus walk tickets, and that is a different kind of task.'
      };
    }

    if (!REOPENABLE_STATUS_KEYS.has(task.status_key)) {
      return {
        ok: false,
        code: 'not_closed',
        error:
          task.status_key === 'review'
            ? 'This ticket is still awaiting approval — "same as before" applies once it is closed or withdrawn.'
            : 'This ticket is already open — there is nothing to reopen.'
      };
    }

    // Who is currently accountable — the same resolution order
    // app/api/campus-walk/fix/route.ts uses: project_task_assignees
    // role='accountable', falling back to owner_staff_id (that assignees
    // insert is best-effort at creation time, so it can legitimately be
    // missing).
    const { data: accountableRow } = await db
      .from('project_task_assignees')
      .select('staff_id')
      .eq('task_id', task.id)
      .eq('role', 'accountable')
      .maybeSingle();
    const currentAccountableStaffId =
      (accountableRow?.staff_id as string | null) ?? task.owner_staff_id;

    // Map back to an ACTIVE profile id. A departed/deactivated accountable
    // naturally resolves to null here, and routeAccountable's own EAO
    // fallback below picks it up exactly the way "no owner supplied" does on
    // first filing — no separate branch needed for that case.
    let candidateProfileId: string | null = null;
    if (currentAccountableStaffId) {
      const profileMap = await mapStaffToProfilesLocal(db, [currentAccountableStaffId]);
      candidateProfileId = profileMap.get(currentAccountableStaffId) ?? null;
    }

    const kind: WalkKind = metadata.kind === 'system_gap' ? 'system_gap' : 'symptom';
    const isUnsafe = Boolean(metadata.unsafe);

    const routing = await routeAccountable(db, { kind, isUnsafe, candidateProfileId });

    // ── D7 occurrence log ────────────────────────────────────────────────
    // The original filing is occurrence #1 implicitly — its own created_at
    // is that record, no reopen event exists for it. A missing counter
    // means this is the first repeat, so it defaults to 1 before this
    // reopen increments it. metadata.occurrences is append-only: prior
    // entries are copied forward untouched, never overwritten or trimmed.
    const priorCount = Number(metadata.occurrence_count ?? 1);
    const occurrenceCount = priorCount + 1;
    const priorOccurrences = Array.isArray(metadata.occurrences) ? metadata.occurrences : [];
    const nowIso = new Date().toISOString();
    const occurrenceEntry = {
      occurrence_number: occurrenceCount,
      at: nowIso,
      reopened_by_profile_id: input.reopenedByProfileId,
      reopened_from_status_key: task.status_key
    };

    const newMetadata: Record<string, any> = {
      ...metadata,
      occurrence_count: occurrenceCount,
      occurrences: [...priorOccurrences, occurrenceEntry],
      // Clears prior close/cancel bookkeeping so the task reads as freshly
      // actionable. This also keeps the photo-retention cron correct: it
      // reads metadata.cancelled_at as the "closed" date for a cancelled
      // task (app/api/cron/campus-walk-photo-retention/route.ts), and that
      // date must not survive into a task that is open again.
      cancelled: false,
      cancelled_reason: null,
      cancelled_at: null,
      cancelled_by_profile_id: null,
      accountable_routed_to_eao_no_owner: routing.routedToEaoNoOwner,
      reassigned_from_profile_id: routing.onApprovedLeave ? routing.leaveOriginalProfileId : null,
      blocked: routing.onApprovedLeave
        ? {
            at: nowIso,
            by_profile_id: null,
            by_staff_id: null,
            by_name: 'Campus Walk (auto — assignee on leave)',
            reason_code: 'other',
            reason: 'Reassigned accountable is on approved leave; task auto-reassigned.',
            due_date_at_block: routing.dueDate
          }
        : null,
      sla: routing.onApprovedLeave ? { paused_at: nowIso, paused_days_total: 0 } : metadata.sla ?? null
    };

    const { error: updateError } = await db
      .from('project_tasks')
      .update({
        status_key: 'todo',
        completed_at: null,
        is_blocked: routing.onApprovedLeave,
        is_overdue: false,
        due_date: routing.dueDate,
        owner_staff_id: routing.accountableStaffId,
        metadata: newMetadata
      })
      .eq('id', task.id);

    if (updateError) {
      console.error('[campus-walk/repeats] update failed:', updateError.message);
      return {
        ok: false,
        code: 'update_failed',
        error: 'We could not reopen this ticket just now. Please try again.'
      };
    }

    // Mutable view of what is on the row right now, so the two best-effort
    // follow-up writes below (the urgent-alert outcome, and the unowned-reopen
    // flags) compose instead of clobbering one another. Each advances it only
    // after its own write actually landed.
    let persistedMetadata: Record<string, any> = newMetadata;

    // ── D6 on a recurrence (Director ruling, 2026-09-04) ────────────────────
    // Placed here, immediately after the reopen commits and BEFORE the RACI
    // sync below, for the same reason createWalkTask puts it before its own
    // attachment/RACI/notification steps: those are bookkeeping that can
    // survive arriving a second late, and if anything after this point fails
    // the phone has still rung. routeAccountable() above has already settled
    // who owns the recurrence — including the EAO fallback and any on-leave
    // reassignment — so no recipient logic is duplicated here, and paging the
    // intended owner is right even if the assignee write below then fails
    // (that failure has its own alarm).
    let urgentAlert: UrgentAlertOutcome | undefined;
    if (isUnsafe) {
      const geo = metadata.geo as { lat?: unknown; lng?: unknown } | null | undefined;
      urgentAlert = await sendUrgentConditionAlert(db, {
        taskId: task.id,
        title: task.title,
        dueDate: routing.dueDate,
        category: (metadata.category as string | null) ?? null,
        locationHint:
          geo && geo.lat != null && geo.lng != null ? `${geo.lat}, ${geo.lng}` : null,
        accountableProfileId: routing.accountableProfileId,
        // "Block C — 9th time" on the phone, and the key that stops occurrence
        // #1's undelivered alarm from suppressing occurrence #9's.
        occurrenceNumber: occurrenceCount
      });

      const withAlert = { ...persistedMetadata, urgent_alert: urgentAlert };
      try {
        const { error: alertMetaError } = await db
          .from('project_tasks')
          .update({ metadata: withAlert })
          .eq('id', task.id);
        if (alertMetaError) {
          console.error(
            '[campus-walk/repeats] could not record the urgent-alert outcome on the task:',
            alertMetaError.message
          );
        } else {
          persistedMetadata = withAlert;
        }
      } catch (e: any) {
        console.error(
          '[campus-walk/repeats] urgent-alert metadata write threw:',
          e?.message ?? e
        );
      }
    }

    // Keep RACI's accountable role in sync with any re-routing (EAO
    // fallback / leave reassignment). Delete/delete/insert — the exact shape
    // lib/campus-walk/chase-up.ts's departure-handover path uses (read only;
    // not duplicated here, same shape) — because the DB carries TWO unique
    // constraints on project_task_assignees: ix_pta_one_accountable allows at
    // most one 'accountable' row per task, and uq_project_task_assignees
    // allows at most one role per (task_id, staff_id). So any pre-existing
    // row for the INCOMING accountable (e.g. they were already Consulted on
    // this task) has to be cleared FIRST, then the outgoing accountable row,
    // before the new Accountable row can be inserted without a 23505. The
    // two-step this replaced (delete role only, then insert) 23505'd on
    // exactly that first case, and its try/catch swallowed the failure after
    // the outgoing row was already gone — leaving the task with NO
    // accountable row at all, silently, until the next reopen. Best-effort in
    // the sense that a RACI failure must not undo the reopen that already
    // committed above, but not silent any more: a failure is recorded and
    // reported right below.
    let ownerAssignmentFailed = false;
    let ownerAssignmentFailureReason: 'no_owner_resolved' | 'assignee_write_failed' | null = null;

    if (!routing.accountableStaffId) {
      // Not even the EAO fallback resolved anyone — routeAccountable has
      // already console.error'd why (no EAO role/fallback email configured).
      // There is nothing to write to project_task_assignees: this reopen has
      // produced a ticket with no accountable owner, and that must be said,
      // not left to read as a normal success below.
      ownerAssignmentFailed = true;
      ownerAssignmentFailureReason = 'no_owner_resolved';
    } else if (routing.accountableStaffId !== currentAccountableStaffId) {
      try {
        await db
          .from('project_task_assignees')
          .delete()
          .eq('task_id', task.id)
          .eq('staff_id', routing.accountableStaffId);
        await db
          .from('project_task_assignees')
          .delete()
          .eq('task_id', task.id)
          .eq('role', 'accountable');
        const { error: insErr } = await db
          .from('project_task_assignees')
          .insert({ task_id: task.id, staff_id: routing.accountableStaffId, role: 'accountable' });
        if (insErr) throw new Error(insErr.message);
      } catch (e: any) {
        console.error('[campus-walk/repeats] RACI update failed:', e?.message ?? e);
        ownerAssignmentFailed = true;
        ownerAssignmentFailureReason = 'assignee_write_failed';
      }
    }

    // A reopen that could not establish an accountable owner must say so —
    // recorded on the task itself (best-effort follow-up write; must not
    // undo the reopen that already committed above, same doctrine as
    // everything else in this function) and pushed to whoever reopened it.
    // D2 gates this whole flow to the Director already, so notifying
    // input.reopenedByProfileId IS notifying the Director — no separate
    // director-resolution lookup needed. Nothing else in this codebase
    // watches for "accountable row missing" the way it watches for overdue
    // due dates, so without this the ticket goes quiet.
    if (ownerAssignmentFailed) {
      try {
        await db
          .from('project_tasks')
          .update({
            metadata: {
              ...persistedMetadata,
              accountable_assignment_failed: true,
              accountable_assignment_failure_reason: ownerAssignmentFailureReason
            }
          })
          .eq('id', task.id);
      } catch (e: any) {
        console.error('[campus-walk/repeats] failure-flag write failed:', e?.message ?? e);
      }

      try {
        await createBellNotification(db, {
          recipientIds: [input.reopenedByProfileId],
          createdBy: input.reopenedByProfileId,
          title: `Reopened but unowned — needs a manual assignment (occurrence #${occurrenceCount})`,
          body:
            ownerAssignmentFailureReason === 'no_owner_resolved'
              ? `"${task.title}" was reopened as a recurrence, but no candidate owner and no Executive Admin Officer could be resolved. It has nobody accountable and will not close until someone is assigned.`
              : `"${task.title}" was reopened as a recurrence, but assigning the new accountable owner failed. It has nobody accountable and will not close until someone is assigned.`,
          url: '/projects',
          category: 'campus-walk:reopen-unowned',
          metadata: { task_id: task.id, source: 'campus-walk', reason: ownerAssignmentFailureReason }
        });
      } catch (e: any) {
        console.error('[campus-walk/repeats] unowned-reopen notification failed:', e?.message ?? e);
      }
    }

    // Notifications mirror createWalkTask's own routing notices — best
    // effort, independently guarded, never allowed to undo the reopen that
    // already committed above.
    if (routing.routedToEaoNoOwner && routing.accountableProfileId) {
      try {
        await createBellNotification(db, {
          recipientIds: [routing.accountableProfileId],
          createdBy: input.reopenedByProfileId,
          title: `Campus Walk reopened — needs an owner (occurrence #${occurrenceCount})`,
          body: `"${task.title}" recurred and no active owner could be found, so it has been routed to you as Executive Admin Officer.`,
          url: '/projects',
          category: 'campus-walk:eao-routed',
          metadata: { task_id: task.id, source: 'campus-walk' }
        });
      } catch (e: any) {
        console.error('[campus-walk/repeats] EAO notification failed:', e?.message ?? e);
      }
    }
    if (routing.onApprovedLeave && routing.accountableProfileId) {
      try {
        await createBellNotification(db, {
          recipientIds: [routing.accountableProfileId],
          createdBy: input.reopenedByProfileId,
          title: `Campus Walk reopened — occurrence #${occurrenceCount}`,
          body: `"${task.title}" recurred. The assignee on record is on approved leave, so the SLA clock is paused.`,
          url: '/projects',
          category: 'campus-walk:leave-reassigned',
          metadata: { task_id: task.id, source: 'campus-walk', reason: 'assignee_on_leave' }
        });
      } catch (e: any) {
        console.error('[campus-walk/repeats] leave notification failed:', e?.message ?? e);
      }
    }

    return {
      ok: true,
      taskId: task.id,
      occurrenceCount,
      dueDate: routing.dueDate,
      accountableProfileId: routing.accountableProfileId,
      routedToEaoNoOwner: routing.routedToEaoNoOwner,
      onApprovedLeave: routing.onApprovedLeave,
      ownerAssignmentFailed,
      urgentAlert
    };
  } catch (e: any) {
    console.error('[campus-walk/repeats] reopenAsRepeat threw:', e?.message ?? e);
    return {
      ok: false,
      code: 'lookup_failed',
      error: 'Something went wrong reopening this ticket. Please try again.'
    };
  }
}

/**
 * Reader helper for "Block C — 9th time" style labels — pure, no I/O, so any
 * screen (or a future notification) can read the count consistently without
 * reaching into metadata shape directly. Returns 1 for a task that has never
 * been reopened (metadata.occurrence_count unset), matching "the original
 * filing is occurrence #1" from the header above.
 */
export function getOccurrenceCount(metadata: Record<string, unknown> | null | undefined): number {
  const raw = (metadata ?? {})['occurrence_count'];
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1;
}
