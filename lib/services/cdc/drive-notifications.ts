/**
 * lib/services/cdc/drive-notifications.ts
 *
 * "Willingness open" learner notification for a CDC drive.
 *
 * Reuses the admin Send-Notification implementation (/notifications/admin/new)
 * piece by piece rather than re-implementing it:
 *   - fanoutNotification()      → notifications row + user_notifications links,
 *                                 idempotent on notifications.idempotency_key
 *   - sendWebPushNotifications() → the exact push sender behind
 *                                 POST /api/notifications/send
 *
 * Recipients = learners inside the drive's institution + semester targeting
 * (lib/services/cdc/drive-targeting.ts) MINUS learners who already have a
 * 'sent' row in cdc_drive_notification_log for this drive. That makes the
 * call safe to repeat (re-opening, re-saving, editing the audience after the
 * drive is open): only newly eligible learners are notified, nobody twice.
 *
 * Every attempt is written to cdc_drive_notification_log per learner
 * (bell row id, push outcome, targeting at the time) — the audit trail behind
 * "learner X in semester 6 did not get the notification".
 *
 * The click-through URL is the learner willingness page, not the coordinator
 * detail page.
 */

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import { sendWebPushNotifications, type PushResult } from '@/lib/notifications/web-push';
import { resolveTargetLearners, type TargetLearnerRow } from './drive-targeting';
import type { CdcDrive } from '@/types/cdc';

export const CDC_WILLINGNESS_NOTIFICATION_TYPE = 'cdc.drive.willingness_open';

/** Student-facing deep link for a drive — the only URL notifications should carry. */
export function learnerDriveUrl(driveId: string): string {
  return `/cdc/drives/${driveId}/willingness`;
}

/**
 * One key per (drive, recipient set). The same delta twice → same key → the
 * shared helper returns `idempotent` and no second bell row / push goes out.
 */
export function willingnessBatchKey(driveId: string, userIds: string[]): string {
  const digest = createHash('sha1').update([...userIds].sort().join(',')).digest('hex').slice(0, 16);
  return `cdc_drive_willingness_open:${driveId}:${digest}`;
}

export interface DriveNotifyResult {
  /** Learners inside the audience right now (with a login). */
  targeted_learners: number;
  /** Audience members with no linked login — logged as no_profile, cannot be reached. */
  unlinked_learners: number;
  /** Already notified earlier for this drive — skipped (duplicate guard). */
  already_notified: number;
  /** Bell rows created in this run. */
  notified: number;
  skipped?: 'idempotent' | 'no_recipients' | 'no_created_by' | 'no_targeting';
  notification_id?: string;
  push?: PushResult;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function alreadySentLearnerIds(service: SupabaseClient, driveId: string): Promise<Set<string>> {
  const { data, error } = await service
    .from('cdc_drive_notification_log')
    .select('learner_id')
    .eq('drive_id', driveId)
    .eq('notification_type', CDC_WILLINGNESS_NOTIFICATION_TYPE)
    .eq('status', 'sent')
    .limit(50000);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.learner_id as string));
}

export async function notifyDriveWillingnessOpen(
  service: SupabaseClient,
  drive: CdcDrive,
  actorId: string
): Promise<DriveNotifyResult> {
  const targeting = await resolveTargetLearners(service, drive);
  const base: DriveNotifyResult = {
    targeted_learners: targeting.learners.length,
    unlinked_learners: targeting.unlinked.length,
    already_notified: 0,
    notified: 0,
  };

  if ((drive.institution_semesters ?? []).length === 0) {
    return { ...base, skipped: 'no_targeting' };
  }

  const sentBefore = await alreadySentLearnerIds(service, drive.id);
  const fresh = targeting.learners.filter((l) => !sentBefore.has(l.learner_id));
  base.already_notified = targeting.learners.length - fresh.length;

  // Audit the unreachable ones (idempotent upsert; a later fix to their login
  // will let a future run reach them, since only 'sent' rows block re-sends).
  await logRows(
    service,
    drive.id,
    targeting.unlinked
      .filter((l) => !sentBefore.has(l.learner_id))
      .map((l) => ({
        learner_id: l.learner_id,
        user_id: null,
        status: 'no_profile' as const,
        push_status: null,
        push_error: null,
        target_institution_id: l.institution_id,
        target_semester_order: l.semester_order,
        notification_id: null,
        batch_key: null,
        created_by: actorId,
      }))
  );

  const userIds = Array.from(new Set(fresh.map((l) => l.user_id)));
  if (userIds.length === 0) {
    return { ...base, skipped: 'no_recipients' };
  }

  const url = learnerDriveUrl(drive.id);
  const when = drive.drive_date ? ` Drive date: ${drive.drive_date}.` : '';
  const deadline = drive.willingness_window_close_at
    ? ` Respond before ${new Date(drive.willingness_window_close_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`
    : '';
  const title = `Placement drive open: ${drive.title}`;
  const body =
    `${drive.title} is open for willingness.${when}${deadline} ` +
    'Open the drive, review your eligibility details and confirm whether you will participate.';
  const batchKey = willingnessBatchKey(drive.id, userIds);

  const fanout = await fanoutNotification(service, {
    title,
    body,
    userIds,
    createdBy: actorId,
    category: CDC_WILLINGNESS_NOTIFICATION_TYPE,
    kind: 'work_item',
    priority: 'high',
    url,
    idempotencyKey: batchKey,
    metadata: {
      event: 'cdc_drive_willingness_open',
      drive_id: drive.id,
      recipient_count: userIds.length,
      institution_semesters: drive.institution_semesters ?? [],
    },
    source: 'cdc-drives',
  });

  const result: DriveNotifyResult = {
    ...base,
    notified: fanout.notified,
    notification_id: fanout.notificationId,
    skipped: fanout.skipped,
  };

  // Duplicate guard at the bell level: same recipient set already has a row.
  if (fanout.skipped || !fanout.notificationId) return result;

  const push = await sendWebPushNotifications(userIds, {
    id: fanout.notificationId,
    title,
    body,
    url,
    priority: 'high',
    created_at: new Date().toISOString(),
  });
  result.push = push;

  // Per-user push outcome. A user can hold several subscriptions: delivered
  // wins over failed, failed over stale_removed.
  const rank: Record<string, number> = { delivered: 3, failed: 2, stale_removed: 1 };
  const pushByUser = new Map<string, { status: string; error?: string }>();
  for (const d of push.details) {
    const prev = pushByUser.get(d.user_id);
    if (!prev || (rank[d.status] ?? 0) > (rank[prev.status] ?? 0)) {
      pushByUser.set(d.user_id, { status: d.status, error: d.error });
    }
  }
  const vapidUnset = !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY;

  await logRows(
    service,
    drive.id,
    fresh.map((l) => {
      const p = pushByUser.get(l.user_id);
      return {
        learner_id: l.learner_id,
        user_id: l.user_id,
        status: 'sent' as const,
        push_status: vapidUnset ? 'skipped' : p ? p.status : 'no_subscription',
        push_error: p?.error ?? null,
        target_institution_id: l.institution_id,
        target_semester_order: l.semester_order,
        notification_id: fanout.notificationId!,
        batch_key: batchKey,
        created_by: actorId,
      };
    })
  );

  return result;
}

interface LogRow {
  learner_id: string;
  user_id: string | null;
  status: 'sent' | 'no_profile';
  push_status: string | null;
  push_error: string | null;
  target_institution_id: string | null;
  target_semester_order: number | null;
  notification_id: string | null;
  batch_key: string | null;
  created_by: string;
}

async function logRows(service: SupabaseClient, driveId: string, rows: LogRow[]): Promise<void> {
  if (rows.length === 0) return;
  for (const part of chunk(rows, 500)) {
    const { error } = await service.from('cdc_drive_notification_log').upsert(
      part.map((r) => ({
        drive_id: driveId,
        notification_type: CDC_WILLINGNESS_NOTIFICATION_TYPE,
        sent_at: new Date().toISOString(),
        ...r,
      })),
      { onConflict: 'drive_id,learner_id,notification_type' }
    );
    if (error) {
      // Audit must never break the send; surface loudly in logs instead.
      console.error('[cdc/drive-notifications] audit log write failed:', error);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Diagnosis — "why did learner X not get the notification?"
// ---------------------------------------------------------------------------

export type LearnerNotifyVerdict =
  | 'not_found'
  | 'not_eligible_institution'
  | 'not_eligible_semester'
  | 'not_active'
  | 'no_profile'
  | 'not_triggered'
  | 'sent_push_delivered'
  | 'sent_push_failed'
  | 'sent_no_subscription'
  | 'sent_push_skipped';

export interface LearnerNotifyDiagnosis {
  verdict: LearnerNotifyVerdict;
  explanation: string;
  learner: {
    id: string;
    name: string;
    register_number: string | null;
    institution_id: string | null;
    semester_order: number | null;
    lifecycle_status: string | null;
    user_id: string | null;
  } | null;
  log: Record<string, unknown> | null;
  deep_link: string;
  willingness_status: string | null;
}

export async function diagnoseLearnerNotification(
  service: SupabaseClient,
  drive: CdcDrive,
  registerNumber: string
): Promise<LearnerNotifyDiagnosis> {
  const deep_link = learnerDriveUrl(drive.id);
  const { data: learner } = await service
    .from('learners_profiles')
    .select('id, first_name, last_name, register_number, institution_id, semester_id, lifecycle_status')
    .ilike('register_number', registerNumber.trim())
    .limit(1)
    .maybeSingle();
  if (!learner) {
    return {
      verdict: 'not_found',
      explanation: 'No learner profile matches this register number.',
      learner: null,
      log: null,
      deep_link,
      willingness_status: null,
    };
  }

  let semester_order: number | null = null;
  if (learner.semester_id) {
    const { data: sem } = await service
      .from('semesters')
      .select('semester_order')
      .eq('id', learner.semester_id)
      .maybeSingle();
    semester_order = (sem?.semester_order as number | null) ?? null;
  }
  const { data: profile } = await service
    .from('profiles')
    .select('id, is_active')
    .eq('learner_id', learner.id)
    .maybeSingle();
  const [{ data: log }, { data: willingness }] = await Promise.all([
    service
      .from('cdc_drive_notification_log')
      .select('*')
      .eq('drive_id', drive.id)
      .eq('learner_id', learner.id)
      .eq('notification_type', CDC_WILLINGNESS_NOTIFICATION_TYPE)
      .maybeSingle(),
    service
      .from('cdc_drive_willingness')
      .select('status')
      .eq('drive_id', drive.id)
      .eq('learner_id', learner.id)
      .maybeSingle(),
  ]);

  const info = {
    id: learner.id as string,
    name: [learner.first_name, learner.last_name].filter(Boolean).join(' '),
    register_number: (learner.register_number as string | null) ?? null,
    institution_id: (learner.institution_id as string | null) ?? null,
    semester_order,
    lifecycle_status: (learner.lifecycle_status as string | null) ?? null,
    user_id: (profile?.id as string | null) ?? null,
  };
  const common = { learner: info, log: (log as Record<string, unknown> | null) ?? null, deep_link, willingness_status: (willingness?.status as string | null) ?? null };

  if (log && log.status === 'sent') {
    const ps = log.push_status as string | null;
    if (ps === 'delivered') {
      return { ...common, verdict: 'sent_push_delivered', explanation: `Bell notification created and push delivered at ${log.sent_at}. If they did not see it, the device may have dismissed it; the bell item and deep link ${deep_link} still work.` };
    }
    if (ps === 'no_subscription' || ps === 'opted_out') {
      return { ...common, verdict: 'sent_no_subscription', explanation: 'Bell notification created, but this learner has no active push subscription (never enabled push on a device, or opted out). They will see it in the app bell.' };
    }
    if (ps === 'skipped') {
      return { ...common, verdict: 'sent_push_skipped', explanation: 'Bell notification created; push was skipped because VAPID keys are not configured on this server.' };
    }
    return { ...common, verdict: 'sent_push_failed', explanation: `Bell notification created but push failed: ${log.push_error ?? 'unknown error'}. The bell item and deep link still work.` };
  }
  if (log && log.status === 'no_profile') {
    return { ...common, verdict: 'no_profile', explanation: 'Learner was in the audience but has no active login (profiles.learner_id link missing), so nothing could be delivered. Link the account and re-save the audience to notify them.' };
  }

  // No log row: work out why they were not in the audience.
  if (!info.institution_id || !drive.institutions.includes(info.institution_id)) {
    return { ...common, verdict: 'not_eligible_institution', explanation: 'Learner\'s institution is not one of the drive\'s institutions.' };
  }
  const entry = (drive.institution_semesters ?? []).find((e) => e.institution_id === info.institution_id);
  const semOk = entry && (entry.semester_orders.length === 0 || (semester_order != null && entry.semester_orders.includes(semester_order)));
  if (!semOk) {
    return { ...common, verdict: 'not_eligible_semester', explanation: `Learner is in semester ${semester_order ?? 'unknown'}; the drive targets ${entry && entry.semester_orders.length ? 'semester ' + entry.semester_orders.join(', ') : 'no semesters'} for this institution.` };
  }
  if (!['active', 'graduated'].includes(info.lifecycle_status ?? '')) {
    return { ...common, verdict: 'not_active', explanation: `Learner lifecycle status is '${info.lifecycle_status}'; only active/graduated learners are notified.` };
  }
  if (!info.user_id || profile?.is_active === false) {
    return { ...common, verdict: 'no_profile', explanation: 'Learner matches the audience but has no active login, so they cannot be notified.' };
  }
  return {
    ...common,
    verdict: 'not_triggered',
    explanation:
      drive.status === 'willingness_open' || ['eligibility_locked', 'attendance_day', 'results_announced', 'closed'].includes(drive.status)
        ? 'Learner matches the audience now but no notification run included them — the audience was probably changed after willingness opened. Re-save the audience to notify newly eligible learners.'
        : `Drive is ${drive.status}; learners are notified when it moves to Willingness Open.`,
  };
}

export type { TargetLearnerRow };
