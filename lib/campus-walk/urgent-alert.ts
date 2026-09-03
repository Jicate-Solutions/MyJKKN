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
// The named fallback, when that produces nobody reachable, is the Director,
// resolved by resolveDirectors() + validateTargeting() — the exact pair
// lib/campus-walk/chase-up.ts uses for its day-5 escalation rung and
// app/api/campus-walk/fix/route.ts uses for its unsafe-block alert. It covers
// the three role paths and falls back to super admins on its own.
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

/** Who a phone alert was aimed at, and on what authority. */
export type UrgentAlertRole = 'accountable' | 'director_fallback';

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
  /** True when the Accountable could not be paged and the Director was used instead. */
  usedFallback: boolean;
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
 * The Accountable first, the Director only if that produced nobody dialable.
 *
 * Deliberately NOT "the Accountable AND the Director every time". Who receives
 * an alert is a Director decision, not a developer one, and the ruling on
 * record says the alert goes to whoever owns the condition. resolveDirectors()
 * appears here strictly as the named fallback the brief requires — the person
 * of last resort when the ownership chain, which already includes an EAO
 * fallback and on-leave reassignment upstream in routeAccountable(), still
 * ends at a profile with no usable number.
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
  opts: { taskId: string; title: string; reason: string }
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
      metadata: { task_id: opts.taskId, source: 'campus-walk', reason: opts.reason },
      idempotencyKey: `campus-walk-unsafe-alert-undelivered:${opts.taskId}`,
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
    failureReason: null,
    at,
  };

  try {
    const resolved = await resolveUrgentAlertTargets(db, input.accountableProfileId);
    outcome.usedFallback = resolved.usedFallback;

    if (resolved.targets.length === 0) {
      outcome.failureReason = resolved.reason ?? 'no reachable recipient';
      console.error(
        `[campus-walk/urgent] UNSAFE alert not sent for task ${input.taskId}: ${outcome.failureReason}`
      );
      await raiseUndeliveredAlarm(db, {
        taskId: input.taskId,
        title: input.title,
        reason: outcome.failureReason,
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
      await raiseUndeliveredAlarm(db, { taskId: input.taskId, title: input.title, reason });
      return outcome;
    }

    const text = buildUrgentAlertText({
      title: input.title,
      dueDate: input.dueDate,
      category: input.category ?? null,
      locationHint: input.locationHint ?? null,
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

    if (outcome.delivered === 0) {
      outcome.failureReason = 'every phone alert attempt failed to send';
      console.error(
        `[campus-walk/urgent] UNSAFE alert reached nobody for task ${input.taskId}: ${outcome.failureReason}`
      );
      await raiseUndeliveredAlarm(db, {
        taskId: input.taskId,
        title: input.title,
        reason: outcome.failureReason,
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
      });
    } catch {
      /* raiseUndeliveredAlarm already logs its own failures */
    }
    return outcome;
  }
}
