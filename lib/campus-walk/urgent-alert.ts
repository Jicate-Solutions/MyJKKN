// lib/campus-walk/urgent-alert.ts
// ============================================================================
// Campus Walk — D6, THE URGENT LANE.
//
// Spec: specs/campus-walk-2026-08-17.md
//   | D6 | Dangerous conditions | Urgent lane, phone alert (SMS/WhatsApp), NOT
//   | in-app. Same-day deadline. |
// and the open question the spec left for later, on its own "decide before
// build" list:
//   - [ ] Urgent channel (D6) — SMS or WhatsApp, which number of record
// Director ruling, 2026-09-03: when an observation is marked UNSAFE a phone
// alert goes out STRAIGHT AWAY. Not an in-app note, not a digest, not
// email-only.
//
// ── WHAT WAS ALREADY HERE, AND WHAT WAS NOT ─────────────────────────────────
// Half of D6 shipped with the module and is untouched by this file: the
// capture screen's unsafe toggle and its second confirm, the same-day due date
// (DUE_IN_DAYS.unsafe = 0 in campus-walk-service.ts), `metadata.unsafe` on the
// task, and unsafe-first ordering on both the review and fix screens.
//
// The half that did NOT ship is the half D6 exists for. An exposed wire and a
// dusty windowsill both landed as a project_tasks row and then waited to be
// noticed — the unsafe one merely sorted higher in the same list. The capture
// screen has been telling the observer, in the confirm dialog it shows before
// the toggle turns on, that marking a condition unsafe "creates a same-day
// deadline and an immediate phone alert". Until this file that sentence was
// half true. This is the missing half.
//
// ── WHY WHATSAPP AND NOT SMS ────────────────────────────────────────────────
// The spec left the channel open; the repo had already closed it. SMS in this
// codebase is marketing plumbing and telephony, not alerting:
// SMSCampaignService (lib/services/admission/sms-campaign-service.ts) is a
// campaign sender behind MSG91/Twilio provider config, ExotelClient.sendSms is
// part of the call pipeline, and lib/services/notification/notification-service.ts
// still carries `// await sendSMS(notification)` commented out. There is no
// wired, general-purpose "send this person a text now" path.
//
// WhatsApp is wired, and it is what the time-critical alerts already use:
//   - lib/services/hr/form-submission-notifications.ts states the rule in its
//     own header — "whatsapp -> whatsapp-api-client -> sendTextMessage. Looks
//     up recipient phone from profiles.phone_number", with "sms -> not yet
//     wired" one line below it;
//   - lib/services/meetings/meeting-workflow-runner.ts pages meeting attendees
//     through the identical convenience export;
//   - lib/services/auth/parent-otp-service.ts sends OTPs — the most
//     time-critical message this platform has — the same way.
// Campus Walk's own service file is a deliberate copy of meeting-trigger-
// service's shape (see its header). Following the sibling engine's phone path
// is reuse; standing up an SMS provider here would be a parallel mechanism.
//
// ── WHO GETS PAGED ──────────────────────────────────────────────────────────
// Nobody new. The Accountable — whoever routeAccountable() has just decided
// owns this observation, already carrying that function's EAO fallback and its
// on-leave reassignment. No new recipient table, no new role lookup, no
// per-category subscriber list.
//
// The Director is resolved by resolveDirectors() + validateTargeting() — the
// exact pair lib/campus-walk/chase-up.ts uses for its day-5 escalation rung
// and app/api/campus-walk/fix/route.ts uses for its unsafe-block alert. It
// covers the three role paths and falls back to super admins on its own.
//
// ── DIRECTOR RULING, 2026-09-04 ─────────────────────────────────────────────
// "Always copy me, and re-alert on repeats." It changed WHEN that resolver
// runs, not who it finds:
//
//   1. The Director is copied on EVERY unsafe alert, not only when the
//      Accountable cannot be reached. The Accountable is still the primary
//      recipient; the Director is added alongside them.
//   2. A recurrence re-alerts. lib/campus-walk/repeats.ts calls this module on
//      every D7 reopen of an unsafe ticket, so "Block C, ninth time, still
//      unsafe" pages a phone instead of going quiet.
//
// The two situations the Director can now be in are NOT collapsed into one
// flag, because operationally they mean opposite things:
//
//   role 'director_copy'     + usedFallback false -> normal. The owner was
//                                                    paged, the Director was
//                                                    copied.
//   role 'director_fallback' + usedFallback true  -> the owner could NOT be
//                                                    paged and the Director
//                                                    stood in. The routing
//                                                    table has a hole worth
//                                                    fixing.
//
// 'director_fallback' therefore keeps exactly the meaning it had before this
// ruling — records already persisted under the old behaviour still read
// correctly — and the always-copy case got its own new value rather than
// quietly redefining that one.
//
// Nobody is paged twice: a Director who IS the resolved Accountable is paged
// once, as 'accountable'.
//
// ── FAIL LOUDLY, NEVER SILENTLY ─────────────────────────────────────────────
// The rest of this lane is fail-soft on purpose: the Director is standing in a
// corridor, and losing the routing must never lose the photograph. That
// calculus inverts here. A dangerous condition that quietly pages nobody is
// worse than the slow inbox D6 was written to escape, because it looks handled.
//
// So this module never throws (an alert failure must not roll back an
// already-created task, and must not lose the photo) but it also never fails
// quietly. When nothing reaches a phone it does all four of:
//   1. console.error with the reason;
//   2. raises an in-app alarm to the Director — the named fallback made
//      visible — under a per-task idempotency key, the same convention as the
//      fix route's unsafe-block alert;
//   3. records the outcome on `metadata.urgent_alert`, so the failure is
//      durable and auditable rather than living only in a log line;
//   4. returns it, so the intake route can hand it back to the capture screen
//      and the observer learns, at the scene, that they must go and tell
//      somebody themselves.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import {
  resolveDirectors,
  validateTargeting,
} from '@/lib/services/director-desk/handover-chase-service';

/**
 * Who a phone alert was aimed at, and on what authority.
 *
 * 'director_fallback' predates the 2026-09-04 always-copy ruling and keeps its
 * original meaning — the Director paged INSTEAD of an unreachable owner.
 * 'director_copy' is the new, normal case: the Director paged IN ADDITION to a
 * reachable owner. Persisted records carry these values, so the old one is
 * never repurposed.
 */
export type UrgentAlertRole = 'accountable' | 'director_fallback' | 'director_copy';

/** One resolved, dialable target. */
export interface UrgentAlertTarget {
  profileId: string;
  /** Normalised, digits only, country code included. */
  phone: string;
  role: UrgentAlertRole;
}

/** Per-target delivery record, persisted onto the task and returned to the caller. */
export interface UrgentAlertAttempt {
  profile_id: string;
  role: UrgentAlertRole;
  ok: boolean;
  error?: string;
}

export interface UrgentAlertOutcome {
  /** False when the observation was not marked unsafe — this lane did not run. */
  attempted: boolean;
  /** How many phones actually accepted the message. */
  delivered: number;
  attempts: UrgentAlertAttempt[];
  /**
   * True when the Accountable could not be paged and the Director was used
   * INSTEAD. Deliberately unchanged by the 2026-09-04 always-copy ruling: this
   * flag still means "the owner was unreachable", never "a Director is on the
   * message" — which is now true of every alert and would therefore say
   * nothing. See `directorCopied`.
   */
  usedFallback: boolean;
  /**
   * True when the Accountable WAS reachable and a Director was added as an
   * additional recipient — the normal case under the 2026-09-04 ruling. Never
   * true at the same time as `usedFallback`: when the Director is already the
   * primary recipient there is nothing to copy them on.
   */
  directorCopied: boolean;
  /**
   * Why no Director copy went out when one was expected. Null when a copy was
   * sent, when the Director IS the Accountable (already paged, once), and when
   * `usedFallback` is true. Non-null means "always copy me" quietly did not
   * happen for this alert — recorded rather than only logged, so it is
   * auditable on the task.
   */
  directorCopyReason: string | null;
  /**
   * Null when at least one phone was reached. Otherwise a short, plain reason
   * — this is the field that must never be allowed to pass unnoticed.
   */
  failureReason: string | null;
  /** ISO timestamp of the attempt. */
  at: string;
}

/**
 * Free-text phone column in, dialable number out (digits only, country code
 * included), or null when there is nothing usable.
 *
 * `profiles.phone_number` is operator-entered and unconstrained, so it arrives
 * as "9894116664", "+91 98941 16664", "091-9894116664" and worse. The existing
 * WhatsApp callers hand it to the Cloud API exactly as stored
 * (form-submission-notifications.ts passes `p.phone_number` raw); that is
 * tolerable for an approval nudge that can be chased by other means, and not
 * tolerable for the one message whose whole purpose is to arrive within
 * minutes. Cleaning it here is additive — it never widens who is paged, only
 * whether the number reaches them.
 *
 * COUNTRY CODE: a bare 10-digit number is read as Indian (+91). Every campus,
 * every member of staff and every number of record in this deployment is
 * Indian, and a 10-digit local number is by far the most common way the column
 * is filled. A number that already carries a country code (11-15 digits) is
 * passed through untouched, so an international number stored in full still
 * works.
 */
export function normaliseWhatsAppNumber(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // Trunk prefix: "0 98941 16664" is a local dialling habit, not a country code.
  while (digits.startsWith('0')) digits = digits.slice(1);
  if (!digits) return null;

  // Bare local number — assume the country this campus is in.
  if (digits.length === 10) digits = `91${digits}`;

  // E.164 allows up to 15 digits; below 11 (after the step above) there is no
  // country code and no way to guess one that would not be a wrong number.
  if (digits.length < 11 || digits.length > 15) return null;
  return digits;
}

export interface UrgentAlertCopyInput {
  title: string;
  /** YYYY-MM-DD. D6 makes this today. */
  dueDate: string | null;
  category?: string | null;
  /** Human-readable place, when one was captured. */
  locationHint?: string | null;
  /**
   * D7 occurrence number. 1, or absent, is the original filing. Anything
   * higher is a recurrence and says so on the phone — an alert that reads
   * identically on the 9th report as on the 1st does not escalate, which is
   * the whole point of re-alerting on repeats.
   */
  occurrenceNumber?: number | null;
}

/** 1 -> "1st", 2 -> "2nd", 9 -> "9th", 11 -> "11th". */
function ordinal(n: number): string {
  const v = Math.trunc(Math.abs(n));
  const lastTwo = v % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${v}th`;
  const last = v % 10;
  if (last === 1) return `${v}st`;
  if (last === 2) return `${v}nd`;
  if (last === 3) return `${v}rd`;
  return `${v}th`;
}

/**
 * What the phone actually shows. Pure, so the wording is testable and can be
 * reviewed without running anything.
 *
 * Two rules it must not break:
 *   - D10 attribution: this is a "Management walk" item. The message names a
 *     CONDITION, never the person who photographed it and never the person
 *     being asked to fix it.
 *   - It has to be readable on a lock screen by somebody who is not at a desk,
 *     so the word UNSAFE and the thing itself come first, before any
 *     housekeeping.
 */
export function buildUrgentAlertText(input: UrgentAlertCopyInput): string {
  const title = (input.title ?? '').trim().slice(0, 160) || 'Unsafe condition reported';
  const lines: string[] = [`UNSAFE — ${title}`];

  // Second line, so it survives a lock-screen preview: this is not a new
  // problem, it is one that has come back.
  const occurrence = Number(input.occurrenceNumber);
  if (Number.isFinite(occurrence) && occurrence > 1) {
    lines.push(`Reported again — ${ordinal(occurrence)} time.`);
  }

  const where = (input.locationHint ?? '').trim();
  if (where) lines.push(`Where: ${where.slice(0, 120)}`);

  const category = (input.category ?? '').trim();
  if (category) lines.push(`Type: ${category.slice(0, 60)}`);

  lines.push(
    input.dueDate
      ? `Needs action today (due ${input.dueDate}).`
      : 'Needs action today.'
  );
  lines.push('Reported on a Management walk. Open MyJKKN > Campus Walk to see the photo.');

  return lines.join('\n');
}

/** profiles.id -> a dialable number, for the ids that have one. */
async function fetchPhones(
  db: SupabaseClient,
  profileIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const { data, error } = await db
    .from('profiles')
    .select('id, phone_number')
    .in('id', ids);

  if (error) {
    console.error('[campus-walk/urgent] phone lookup failed:', error.message);
    return out;
  }
  for (const row of (data ?? []) as Array<{ id: string; phone_number: string | null }>) {
    const phone = normaliseWhatsAppNumber(row.phone_number);
    if (phone) out.set(row.id, phone);
  }
  return out;
}

/**
 * The PRIMARY recipient: the Accountable, or the Director standing IN THEIR
 * PLACE when the ownership chain — which already carries an EAO fallback and
 * on-leave reassignment upstream in routeAccountable() — still ends at a
 * profile with no usable number.
 *
 * This answers "who owns this condition, and can they be reached", and nothing
 * else. The 2026-09-04 always-copy ruling is deliberately NOT applied here;
 * resolveUrgentAlertRecipients() below layers it on top. Keeping the two apart
 * is precisely what lets `usedFallback` go on meaning "the owner was
 * unreachable" instead of silently becoming "a Director is on the message".
 */
export async function resolveUrgentAlertTargets(
  db: SupabaseClient,
  accountableProfileId: string | null
): Promise<{ targets: UrgentAlertTarget[]; usedFallback: boolean; reason: string | null }> {
  if (accountableProfileId) {
    const phones = await fetchPhones(db, [accountableProfileId]);
    const phone = phones.get(accountableProfileId);
    if (phone) {
      return {
        targets: [{ profileId: accountableProfileId, phone, role: 'accountable' }],
        usedFallback: false,
        reason: null,
      };
    }
  }

  const why = accountableProfileId
    ? 'the accountable owner has no usable phone number on record'
    : 'no accountable owner could be resolved for this observation';

  // Named fallback. Same resolver the rest of this lane escalates through.
  let directorIds: string[] = [];
  try {
    const director = await resolveDirectors(db);
    const check = validateTargeting(director.ids);
    if (check.ok) directorIds = check.userIds;
    else {
      return {
        targets: [],
        usedFallback: true,
        reason: `${why}, and the Director fallback could not be targeted (${check.reason})`,
      };
    }
  } catch (e: unknown) {
    return {
      targets: [],
      usedFallback: true,
      reason: `${why}, and resolving the Director fallback threw (${e instanceof Error ? e.message : String(e)})`,
    };
  }

  const phones = await fetchPhones(db, directorIds);
  const targets: UrgentAlertTarget[] = directorIds
    .map((profileId): UrgentAlertTarget | null => {
      const phone = phones.get(profileId);
      return phone ? { profileId, phone, role: 'director_fallback' } : null;
    })
    .filter((t): t is UrgentAlertTarget => t !== null);

  if (targets.length === 0) {
    return {
      targets: [],
      usedFallback: true,
      reason: `${why}, and no Director has a usable phone number on record either`,
    };
  }
  return { targets, usedFallback: true, reason: null };
}

/**
 * Everyone who should be paged: the primary recipient above, PLUS the Director
 * as a standing copy (Director ruling, 2026-09-04 — "always copy me").
 *
 * Deduplicated by profile id, so a Director who is also the resolved
 * Accountable is paged once, as 'accountable'. When the primary resolution has
 * ALREADY fallen back to the Director there is nothing to copy — they are on
 * the message — so `directorCopied` stays false and `usedFallback` carries the
 * fact that the owner could not be reached.
 *
 * Never throws. A failure to resolve the copy must not cost the Accountable
 * their alert, so it degrades into `directorCopyReason` and the primary
 * recipient is still paged.
 */
export async function resolveUrgentAlertRecipients(
  db: SupabaseClient,
  accountableProfileId: string | null
): Promise<{
  targets: UrgentAlertTarget[];
  usedFallback: boolean;
  directorCopied: boolean;
  directorCopyReason: string | null;
  reason: string | null;
}> {
  const primary = await resolveUrgentAlertTargets(db, accountableProfileId);

  // The Director is already the recipient. Copying them onto their own message
  // would page one person twice for one condition.
  if (primary.usedFallback) {
    return {
      targets: primary.targets,
      usedFallback: true,
      directorCopied: false,
      directorCopyReason: null,
      reason: primary.reason,
    };
  }

  let directorCopyReason: string | null = null;
  const copies: UrgentAlertTarget[] = [];

  try {
    const director = await resolveDirectors(db);
    const check = validateTargeting(director.ids);
    if (!check.ok) {
      directorCopyReason = `the Director copy could not be targeted (${check.reason})`;
    } else {
      const alreadyPaged = new Set(primary.targets.map((t) => t.profileId));
      const copyIds = check.userIds.filter((id) => !alreadyPaged.has(id));
      if (copyIds.length > 0) {
        const phones = await fetchPhones(db, copyIds);
        for (const profileId of copyIds) {
          const phone = phones.get(profileId);
          if (phone) copies.push({ profileId, phone, role: 'director_copy' });
        }
        if (copies.length === 0) {
          directorCopyReason = 'no Director has a usable phone number on record';
        }
      }
      // copyIds empty => the Director IS the Accountable, already paged once.
      // That is a correct outcome, not a missing copy, so no reason is set.
    }
  } catch (e: unknown) {
    directorCopyReason = `resolving the Director copy threw (${e instanceof Error ? e.message : String(e)})`;
  }

  return {
    targets: [...primary.targets, ...copies],
    usedFallback: false,
    directorCopied: copies.length > 0,
    directorCopyReason,
    reason: primary.reason,
  };
}

/**
 * Idempotency key for the "nobody was paged" alarm.
 *
 * Task-scoped, the same convention the fix route's unsafe-block alert uses: the
 * DB's partial unique index on notifications.idempotency_key — not a
 * read-then-write check — is what stops a retried POST from raising the same
 * alarm twice.
 *
 * The occurrence number is appended only from the SECOND occurrence onward
 * (Director ruling, 2026-09-04 — a recurrence re-alerts). Both halves of that
 * are deliberate: the original filing keeps the exact key it has always had, so
 * alarms already persisted still suppress a retry of the POST that created
 * them; and the 9th reopen is not suppressed by the 1st filing's row, because a
 * danger ignored nine times must be able to raise its ninth alarm.
 */
export function undeliveredAlarmIdempotencyKey(
  taskId: string,
  occurrenceNumber?: number | null
): string {
  const base = `campus-walk-unsafe-alert-undelivered:${taskId}`;
  const n = Number(occurrenceNumber);
  return Number.isFinite(n) && n > 1 ? `${base}:occurrence-${Math.trunc(n)}` : base;
}

/**
 * The in-app alarm raised ONLY when no phone was reached. This is the "fail
 * loudly to a named fallback" step made visible to a human — a log line nobody
 * reads is not a fallback.
 *
 * Keyed on task_id alone, no timestamp component, exactly like the fix route's
 * unsafe-block alert: the DB's partial unique index on
 * notifications.idempotency_key — not a read-then-write check — is what stops a
 * retried intake POST from raising the same alarm twice.
 */
async function raiseUndeliveredAlarm(
  db: SupabaseClient,
  opts: { taskId: string; title: string; reason: string; occurrenceNumber?: number | null }
): Promise<void> {
  try {
    const director = await resolveDirectors(db);
    const check = validateTargeting(director.ids);
    if (!check.ok) {
      console.error(
        `[campus-walk/urgent] UNSAFE alert reached nobody AND the in-app alarm could not be targeted (${check.reason}) — task ${opts.taskId}`
      );
      return;
    }
    await createBellNotification(db, {
      recipientIds: check.userIds,
      createdBy: check.userIds[0],
      title: `NOBODY WAS PAGED — unsafe: ${opts.title.slice(0, 80)}`,
      body:
        `A Management walk item was marked UNSAFE and the immediate phone alert could not be ` +
        `delivered: ${opts.reason}. Nobody has been told by phone. Tell whoever must act, and ` +
        `check the phone number on record.`,
      url: '/campus-walk/review',
      category: 'campus-walk:unsafe-alert-undelivered',
      metadata: {
        task_id: opts.taskId,
        source: 'campus-walk',
        reason: opts.reason,
        occurrence_number: opts.occurrenceNumber ?? 1,
      },
      idempotencyKey: undeliveredAlarmIdempotencyKey(opts.taskId, opts.occurrenceNumber),
    });
  } catch (e: unknown) {
    console.error(
      '[campus-walk/urgent] undelivered-alert alarm failed:',
      e instanceof Error ? e.message : e
    );
  }
}

export interface SendUrgentAlertInput {
  taskId: string;
  title: string;
  dueDate: string | null;
  category?: string | null;
  locationHint?: string | null;
  /** Whoever routeAccountable() settled on, already EAO- and leave-adjusted. */
  accountableProfileId: string | null;
  /**
   * D7 occurrence number, from metadata.occurrence_count. Absent or 1 for the
   * original filing; higher on a reopen (Director ruling, 2026-09-04 — a
   * recurrence re-alerts). It reaches the phone in the message text and scopes
   * the undelivered alarm's idempotency key, so occurrence #9's failure is not
   * suppressed by occurrence #1's.
   */
  occurrenceNumber?: number | null;
}

/**
 * Page a phone about an unsafe condition, right now.
 *
 * Never throws. Returns what happened so the caller can persist it and hand it
 * back to the capture screen.
 */
export async function sendUrgentConditionAlert(
  db: SupabaseClient,
  input: SendUrgentAlertInput
): Promise<UrgentAlertOutcome> {
  const at = new Date().toISOString();
  const outcome: UrgentAlertOutcome = {
    attempted: true,
    delivered: 0,
    attempts: [],
    usedFallback: false,
    directorCopied: false,
    directorCopyReason: null,
    failureReason: null,
    at,
  };

  try {
    const resolved = await resolveUrgentAlertRecipients(db, input.accountableProfileId);
    outcome.usedFallback = resolved.usedFallback;
    outcome.directorCopied = resolved.directorCopied;
    outcome.directorCopyReason = resolved.directorCopyReason;

    if (resolved.targets.length === 0) {
      outcome.failureReason = resolved.reason ?? 'no reachable recipient';
      console.error(
        `[campus-walk/urgent] UNSAFE alert not sent for task ${input.taskId}: ${outcome.failureReason}`
      );
      await raiseUndeliveredAlarm(db, {
        taskId: input.taskId,
        title: input.title,
        reason: outcome.failureReason,
        occurrenceNumber: input.occurrenceNumber,
      });
      return outcome;
    }

    // Lazy import, matching form-submission-notifications.ts: a module that
    // only some observations need should not be loaded by every one of them,
    // and a missing/misconfigured client must degrade into a recorded failure
    // rather than a thrown request.
    let sendTextMessage: ((to: string, text: string) => Promise<unknown>) | null = null;
    try {
      const mod = await import('@/lib/services/whatsapp/whatsapp-api-client');
      if (!mod.isWhatsAppConfigured()) {
        outcome.failureReason = 'WhatsApp is not configured on this deployment';
      } else {
        sendTextMessage = mod.sendTextMessage as typeof sendTextMessage;
      }
    } catch (e: unknown) {
      outcome.failureReason = `WhatsApp client unavailable (${e instanceof Error ? e.message : String(e)})`;
    }

    if (!sendTextMessage) {
      const reason = outcome.failureReason ?? 'WhatsApp client unavailable';
      outcome.failureReason = reason;
      console.error(
        `[campus-walk/urgent] UNSAFE alert not sent for task ${input.taskId}: ${reason}`
      );
      await raiseUndeliveredAlarm(db, {
        taskId: input.taskId,
        title: input.title,
        reason,
        occurrenceNumber: input.occurrenceNumber,
      });
      return outcome;
    }

    const text = buildUrgentAlertText({
      title: input.title,
      dueDate: input.dueDate,
      category: input.category ?? null,
      locationHint: input.locationHint ?? null,
      occurrenceNumber: input.occurrenceNumber,
    });

    for (const target of resolved.targets) {
      try {
        await sendTextMessage(target.phone, text);
        outcome.delivered += 1;
        outcome.attempts.push({ profile_id: target.profileId, role: target.role, ok: true });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        // The number itself is deliberately not logged — it is personal data
        // and the profile id is enough to find the row.
        console.error(
          `[campus-walk/urgent] WhatsApp send failed for ${target.role} ${target.profileId} on task ${input.taskId}:`,
          message
        );
        outcome.attempts.push({
          profile_id: target.profileId,
          role: target.role,
          ok: false,
          error: message.slice(0, 300),
        });
      }
    }

    // `delivered === 0`, not "the Accountable's send failed": the alarm below
    // says NOBODY WAS PAGED, and raising it while a phone did ring would make
    // the one alarm this lane cannot afford to have ignored cry wolf.
    //
    // Since the 2026-09-04 always-copy ruling there is a case this no longer
    // catches: the Accountable's send fails, the Director's copy succeeds, and
    // the person who must ACT was not reached while `delivered` is 1. That is
    // NOT silent — the per-target record on metadata.urgent_alert.attempts
    // carries `{ role: 'accountable', ok: false, error }` and is returned to
    // the caller — but it does not raise its own alarm. Whether it should is a
    // recipient decision, and recipient decisions on this lane are the
    // Director's; it is flagged for him rather than invented here.
    if (outcome.delivered === 0) {
      outcome.failureReason = 'every phone alert attempt failed to send';
      console.error(
        `[campus-walk/urgent] UNSAFE alert reached nobody for task ${input.taskId}: ${outcome.failureReason}`
      );
      await raiseUndeliveredAlarm(db, {
        taskId: input.taskId,
        title: input.title,
        reason: outcome.failureReason,
        occurrenceNumber: input.occurrenceNumber,
      });
    }

    return outcome;
  } catch (e: unknown) {
    // Belt and braces. Everything above is already guarded; this exists so an
    // unexpected throw still produces a recorded, surfaced failure instead of
    // propagating into createWalkTask and losing an already-created task.
    const message = e instanceof Error ? e.message : String(e);
    outcome.failureReason = `urgent alert threw (${message.slice(0, 300)})`;
    console.error(
      `[campus-walk/urgent] UNSAFE alert threw for task ${input.taskId}:`,
      message
    );
    try {
      await raiseUndeliveredAlarm(db, {
        taskId: input.taskId,
        title: input.title,
        reason: outcome.failureReason,
        occurrenceNumber: input.occurrenceNumber,
      });
    } catch {
      /* raiseUndeliveredAlarm already logs its own failures */
    }
    return outcome;
  }
}
