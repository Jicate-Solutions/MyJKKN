// lib/services/cohorts/coordinator-notifications.ts
//
// Telling people about programme-coordinator changes (decisions D12, D5, D8).
//
// SERVER-ONLY. Every function takes the service-role client, because writing a
// notification is gated in the database by is_admin() — a coordinator who holds
// notifications.create still cannot insert one, so a browser-side send would open
// the screen and then silently do nothing
// (ref feedback_lc_announcement_rls_is_admin).
//
// NO NEW NOTIFICATION MECHANISM. Delivery is lib/social/notify.ts's deliverInApp,
// which does the two writes the bell actually reads (`notifications` +
// `user_notifications`) and is idempotent on `notifications.idempotency_key`.
// That key is a PARTIAL unique index, so upsert(onConflict:) fails at runtime and
// is never used here — deliverInApp inserts and handles the collision itself
// (ref feedback_partial_unique_index_cannot_arbitrate_on_conflict).
//
// Every function returns quietly. A notification that did not go out must never
// fail the appointment, or the removal, or a learner's registration.

import type { SupabaseClient } from '@supabase/supabase-js';

import { deliverInApp } from '@/lib/social/notify';
import {
  programmeApplicationsUrl,
  programmeLabel,
} from '@/lib/services/cohorts/programme-coordinator-constants';

/** One row of `cohort_coordinators`, as this module reads it. */
export interface CoordinatorAppointment {
  id: string;
  user_id: string;
  programme_kind: string;
  cohort_id: string | null;
  status: string | null;
  note: string | null;
  appointed_by: string | null;
  appointed_at: string | null;
  removed_at: string | null;
  removed_by: string | null;
  removal_reason: string | null;
}

export const COORDINATOR_APPOINTMENT_COLUMNS =
  'id, user_id, programme_kind, cohort_id, status, note, appointed_by, appointed_at, removed_at, removed_by, removal_reason';

/** Where the COO goes to fix a missing coordinator. */
export const COORDINATORS_SCREEN_URL =
  '/startup-studio/school-of-influence/admin/coordinators';

/**
 * Roles that are appointing in their OWN right rather than as a coordinator.
 * 'owner' is included for completeness even though the live role list calls the
 * equivalent seat 'ceo' — an unknown key here simply never matches.
 */
const PRIVILEGED_ROLE_KEYS = [
  'super_admin',
  'admin',
  'administrator',
  'coo',
  'ceo',
  'owner',
];

function displayName(
  row: { full_name?: string | null; email?: string | null } | null | undefined
): string {
  return row?.full_name?.trim() || row?.email?.trim() || 'Someone at JKKN';
}

/** Read one person's name for use in a sentence. */
async function nameOf(
  admin: SupabaseClient,
  userId: string | null
): Promise<string> {
  if (!userId) return 'Someone at JKKN';
  const { data } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle();
  return displayName(data as { full_name?: string | null; email?: string | null } | null);
}

/** The batch's name in words, or null when the appointment covers the programme. */
async function cohortName(
  admin: SupabaseClient,
  cohortId: string | null
): Promise<string | null> {
  if (!cohortId) return null;
  const { data } = await admin
    .from('cohorts')
    .select('name')
    .eq('id', cohortId)
    .maybeSingle();
  const name = (data as { name?: string | null } | null)?.name;
  return name?.trim() ? name.trim() : null;
}

/** "School of Influence" or "School of Influence — Batch A". */
function scopeText(programmeKind: string, batch: string | null): string {
  const programme = programmeLabel(programmeKind);
  return batch ? `${programme} — ${batch}` : programme;
}

/**
 * The programme's event, so the "you are now a coordinator" card links to the
 * queue itself rather than to a screen that must first work out which programme
 * was meant (BUG-005799 / BUG-005800).
 *
 * Read the same way the whole module reads it: a batch's config points at its
 * source event. Ambiguity is answered by sending nothing — two live programmes
 * means the screen should offer both BY NAME, which it now does, rather than
 * this function picking one. Returns null on any doubt; the link still works.
 */
async function soleProgrammeEventId(
  admin: SupabaseClient,
  programmeKind: string
): Promise<string | null> {
  const { data, error } = await admin
    .from('cohorts')
    .select('config')
    .eq('kind', programmeKind)
    .is('archived_at', null);
  if (error) return null;
  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<{ config?: unknown }>) {
    const raw = (row.config as { source_event_id?: unknown } | null)
      ?.source_event_id;
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (id) ids.add(id);
  }
  return ids.size === 1 ? Array.from(ids)[0] : null;
}

/**
 * Everyone who holds the COO seat, by either route: the multi-role table, or the
 * legacy `profiles.role`. Both are checked because removing a user_roles row does
 * NOT clear profiles.role, so the two can disagree
 * (ref feedback_removing_a_role_leaves_profiles_role_stale).
 */
export async function cooRecipients(admin: SupabaseClient): Promise<string[]> {
  const ids = new Set<string>();

  const { data: role } = await admin
    .from('custom_roles')
    .select('id')
    .eq('role_key', 'coo')
    .maybeSingle();
  const roleId = (role as { id?: string } | null)?.id;
  if (roleId) {
    const { data: holders } = await admin
      .from('user_roles')
      .select('user_id')
      .eq('role_id', roleId);
    for (const h of (holders ?? []) as Array<{ user_id?: string | null }>) {
      if (h.user_id) ids.add(h.user_id);
    }
  }

  const { data: legacy } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'coo');
  for (const p of (legacy ?? []) as Array<{ id?: string | null }>) {
    if (p.id) ids.add(p.id);
  }

  return Array.from(ids);
}

/**
 * Was this person appointing in their own right (COO / super admin / owner)?
 *
 * D5 asks for a copy to the COO when the appointer "was acting as a coordinator".
 * The test used here is the simpler and safer inverse: anyone who is NOT one of
 * those seats and still got past the database's own permission check was acting
 * as a coordinator. Asking the question that way also covers a coordinator who
 * steps THEMSELVES down — by the time the notification is sent their own row is
 * no longer active, so a "is this person a coordinator right now?" test would
 * quietly skip the COO copy for exactly the change the COO most needs to see.
 */
async function actorIsPrivileged(
  admin: SupabaseClient,
  actorId: string
): Promise<boolean> {
  const { data: profile } = await admin
    .from('profiles')
    .select('is_super_admin, role')
    .eq('id', actorId)
    .maybeSingle();
  const p = profile as { is_super_admin?: boolean | null; role?: string | null } | null;
  if (p?.is_super_admin === true) return true;
  if (p?.role && PRIVILEGED_ROLE_KEYS.includes(p.role)) return true;

  const { data: roles } = await admin
    .from('user_roles')
    .select('custom_roles(role_key)')
    .eq('user_id', actorId);
  for (const r of (roles ?? []) as Array<{ custom_roles?: { role_key?: string | null } | null }>) {
    const key = r.custom_roles?.role_key;
    if (key && PRIVILEGED_ROLE_KEYS.includes(key)) return true;
  }
  return false;
}

/**
 * D12 + D5 — tell the person, and tell the COO when a coordinator made the change.
 *
 * The idempotency key carries the moment of the change (appointed_at / removed_at)
 * as well as the appointment id, so an appointment that is removed, put back and
 * removed again is announced each time rather than being swallowed as a repeat.
 */
export async function notifyCoordinatorChange(
  admin: SupabaseClient,
  input: {
    appointment: CoordinatorAppointment;
    action: 'appointed' | 'removed';
    actorId: string;
  }
): Promise<void> {
  const { appointment, action, actorId } = input;
  const batch = await cohortName(admin, appointment.cohort_id);
  const where = scopeText(appointment.programme_kind, batch);
  const actorName = await nameOf(admin, actorId);
  const link =
    programmeApplicationsUrl(
      appointment.programme_kind,
      await soleProgrammeEventId(admin, appointment.programme_kind)
    ) ?? undefined;
  const stamp =
    (action === 'appointed' ? appointment.appointed_at : appointment.removed_at) ??
    'unknown';

  if (action === 'appointed') {
    await deliverInApp(admin, {
      recipientId: appointment.user_id,
      title: `You are now a coordinator — ${where}`,
      body:
        `${actorName} made you a coordinator for ${where}. ` +
        (link
          ? 'You can now open the applications screen and work through who has applied.'
          : 'You can now run this programme for your batch.'),
      url: link,
      category: 'cohorts:coordinator',
      idempotencyKey: `cohort-coordinator:appointed:${appointment.id}:${stamp}`,
      metadata: {
        appointment_id: appointment.id,
        programme_kind: appointment.programme_kind,
        cohort_id: appointment.cohort_id,
      },
    });
  } else {
    const reason = appointment.removal_reason?.trim();
    await deliverInApp(admin, {
      recipientId: appointment.user_id,
      title: `You are no longer a coordinator — ${where}`,
      body:
        `${actorName} removed you as a coordinator for ${where}.` +
        (reason ? ` Reason given: ${reason}` : ''),
      url: link,
      category: 'cohorts:coordinator',
      idempotencyKey: `cohort-coordinator:removed:${appointment.id}:${stamp}`,
      metadata: {
        appointment_id: appointment.id,
        programme_kind: appointment.programme_kind,
        cohort_id: appointment.cohort_id,
      },
    });
  }

  // D5 — a coordinator changing the coordinator list is something the COO should
  // read the same day. A COO or super admin doing it needs no copy of their own act.
  if (await actorIsPrivileged(admin, actorId)) return;

  const person = await nameOf(admin, appointment.user_id);
  const coos = await cooRecipients(admin);
  for (const cooId of coos) {
    await deliverInApp(admin, {
      recipientId: cooId,
      title: `Coordinator change — ${where}`,
      body:
        action === 'appointed'
          ? `${actorName}, a coordinator, appointed ${person} for ${where}.`
          : `${actorName}, a coordinator, removed ${person} from ${where}.`,
      url: COORDINATORS_SCREEN_URL,
      category: 'cohorts:coordinator',
      // One card per change, fanned out to every COO seat: deliverInApp adds the
      // second and later recipients to the card the first one created.
      idempotencyKey: `cohort-coordinator:${action}:${appointment.id}:${stamp}:coo`,
      metadata: {
        appointment_id: appointment.id,
        programme_kind: appointment.programme_kind,
      },
    });
  }
}

/**
 * D8 — an application arrived for a programme that has NOBODY appointed to read it.
 *
 * Sent at most once per programme per day: the key carries the date, so a busy
 * application day produces one card and not a flood. Returns quietly whatever
 * happens; the caller must never let this affect the applicant.
 */
export async function alertCooWhenNoActiveCoordinator(
  admin: SupabaseClient,
  programmeKind: string
): Promise<void> {
  const { data: active, error } = await admin
    .from('cohort_coordinators')
    .select('id')
    .eq('programme_kind', programmeKind)
    .eq('status', 'active')
    .limit(1);
  // A failed read is NOT proof that nobody is appointed. Staying quiet on an
  // unknown beats crying wolf at the COO every time the query hiccups.
  if (error || (active ?? []).length > 0) return;

  const where = programmeLabel(programmeKind);
  // Campus time, not UTC. On a UTC date the "day" would roll over at 05:30 IST,
  // so an application at 01:00 would land in the previous day's bucket and be
  // swallowed as a repeat of a message sent the evening before.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const coos = await cooRecipients(admin);
  for (const cooId of coos) {
    await deliverInApp(admin, {
      recipientId: cooId,
      title: `${where} has no coordinator`,
      body:
        `Someone applied to ${where} today, and no coordinator is appointed, so ` +
        'nobody is set to read it. Appoint a coordinator so applications get an answer.',
      url: COORDINATORS_SCREEN_URL,
      category: 'cohorts:coordinator',
      idempotencyKey: `cohort-coordinator:none:${programmeKind}:${today}`,
      metadata: { programme_kind: programmeKind },
    });
  }
}
