/**
 * lib/services/cdc/drive-day.ts
 *
 * Drive-day slice of the campus-drive lifecycle:
 *
 *   willingness (Willing) ─finalize─▶ participants ─▶ attendance roster
 *                                        ▲
 *                     coordinators ──────┘ (assigned staff mark attendance)
 *
 * One continuous chain keyed on (drive_id, learner_id). Learner details are
 * always joined from learners_profiles through buildAssignedLearners — nothing
 * is typed twice and nothing is copied into CDC tables.
 *
 * Service-role client required (multi-college audience, cross-user notify);
 * callers gate with resolveDriveDayAccess() FIRST.
 *
 * Notifications reuse the shared implementation (fanoutNotification + the
 * web-push sender behind /notifications/admin/new). Keys are per recipient set,
 * so re-finalizing never notifies a learner twice.
 */

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import { sendWebPushNotifications } from '@/lib/notifications/web-push';
import { buildAssignedLearners } from './drive-assigned';
import { learnerDriveUrl } from './drive-notifications';
import { CdcDriveService } from './drive-service';
import type {
  CdcDrive,
  CdcDriveAssignedRow,
  CdcDriveAttendanceRow,
  CdcDriveAttendanceStatus,
  CdcDriveAttendanceSummary,
  CdcDriveCoordinator,
  CdcDriveParticipantRow,
} from '@/types/cdc';

export const DRIVE_DAY_ROUND = 1;

export const ATTENDANCE_STATUSES: CdcDriveAttendanceStatus[] = [
  'present',
  'absent',
  'late',
  'excused',
  'not_attended',
];

export const ATTENDANCE_LABEL: Record<CdcDriveAttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
  not_attended: 'Not Attended',
};

/** Present and Late both count as having attended (keeps the legacy boolean in sync). */
export function attendedOf(status: CdcDriveAttendanceStatus): boolean {
  return status === 'present' || status === 'late';
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export interface DriveDayAccess {
  /** cdc.drives.edit — may finalize, assign, and correct attendance at any stage. */
  canManage: boolean;
  /** cdc.drives.view — may read everything. */
  canView: boolean;
  /** Assigned coordinator of THIS drive. */
  isCoordinator: boolean;
  /** May the caller mark attendance right now? */
  canMark: boolean;
  /** Why marking is refused (null when allowed). */
  markBlockedReason: string | null;
}

/** Statuses in which assigned coordinators may mark; afterwards only managers may correct. */
const COORDINATOR_MARK_STATUSES = new Set(['eligibility_locked', 'attendance_day']);
const MANAGER_MARK_STATUSES = new Set(['eligibility_locked', 'attendance_day', 'results_announced']);

export function computeMarkAccess(
  drive: Pick<CdcDrive, 'status' | 'participants_finalized_at'>,
  who: { canManage: boolean; isCoordinator: boolean }
): { canMark: boolean; reason: string | null } {
  if (!who.canManage && !who.isCoordinator) {
    return { canMark: false, reason: 'You are not assigned to this drive.' };
  }
  if (!drive.participants_finalized_at) {
    return { canMark: false, reason: 'Participants have not been finalized yet.' };
  }
  if (who.canManage) {
    return MANAGER_MARK_STATUSES.has(drive.status)
      ? { canMark: true, reason: null }
      : { canMark: false, reason: 'Attendance is closed for this drive.' };
  }
  return COORDINATOR_MARK_STATUSES.has(drive.status)
    ? { canMark: true, reason: null }
    : { canMark: false, reason: 'Results are out — only the CDC office can correct attendance now.' };
}

export async function resolveDriveDayAccess(
  session: SupabaseClient,
  service: SupabaseClient,
  userId: string,
  drive: Pick<CdcDrive, 'id' | 'status' | 'participants_finalized_at'>
): Promise<DriveDayAccess> {
  const [{ data: canEdit }, { data: canView }, { data: coord }] = await Promise.all([
    session.rpc('user_has_permission', { permission_name: 'cdc.drives.edit' }),
    session.rpc('user_has_permission', { permission_name: 'cdc.drives.view' }),
    service.from('cdc_drive_coordinators').select('id').eq('drive_id', drive.id).eq('user_id', userId).maybeSingle(),
  ]);
  const canManage = canEdit === true;
  const isCoordinator = !!coord;
  const mark = computeMarkAccess(drive, { canManage, isCoordinator });
  return {
    canManage,
    canView: canView === true || canManage,
    isCoordinator,
    canMark: mark.canMark,
    markBlockedReason: mark.reason,
  };
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

export interface ActivityEntry {
  drive_id: string;
  learner_id?: string | null;
  actor_id: string;
  actor_role?: string | null;
  action: string;
  previous_value?: unknown;
  new_value?: unknown;
  reason?: string | null;
  ip_address?: string | null;
}

/** Audit must never break the action it describes: failures are logged, not thrown. */
export async function logActivity(service: SupabaseClient, entries: ActivityEntry[]): Promise<void> {
  if (entries.length === 0) return;
  for (let i = 0; i < entries.length; i += 500) {
    const { error } = await service.from('cdc_drive_activity_log').insert(
      entries.slice(i, i + 500).map((e) => ({
        drive_id: e.drive_id,
        learner_id: e.learner_id ?? null,
        actor_id: e.actor_id,
        actor_role: e.actor_role ?? null,
        action: e.action,
        previous_value: e.previous_value ?? null,
        new_value: e.new_value ?? null,
        reason: e.reason ?? null,
        ip_address: e.ip_address ?? null,
      }))
    );
    if (error) {
      console.error('[cdc/drive-day] activity log write failed:', error);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Notifications (shared implementation)
// ---------------------------------------------------------------------------

function keyOf(prefix: string, driveId: string, userIds: string[]): string {
  const digest = createHash('sha1').update([...userIds].sort().join(',')).digest('hex').slice(0, 16);
  return `${prefix}:${driveId}:${digest}`;
}

async function notifyUsers(
  service: SupabaseClient,
  opts: { prefix: string; driveId: string; userIds: string[]; actorId: string; title: string; body: string; url: string; category: string; event: string }
): Promise<number> {
  const userIds = Array.from(new Set(opts.userIds.filter(Boolean)));
  if (userIds.length === 0) return 0;
  const fanout = await fanoutNotification(service, {
    title: opts.title,
    body: opts.body,
    userIds,
    createdBy: opts.actorId,
    category: opts.category,
    kind: 'work_item',
    priority: 'high',
    url: opts.url,
    idempotencyKey: keyOf(opts.prefix, opts.driveId, userIds),
    metadata: { event: opts.event, drive_id: opts.driveId, recipient_count: userIds.length },
    source: 'cdc-drives',
  });
  if (fanout.skipped || !fanout.notificationId) return 0;
  await sendWebPushNotifications(userIds, {
    id: fanout.notificationId,
    title: opts.title,
    body: opts.body,
    url: opts.url,
    priority: 'high',
    created_at: new Date().toISOString(),
  });
  return fanout.notified;
}

async function userIdsOfLearners(service: SupabaseClient, learnerIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < learnerIds.length; i += 200) {
    const { data, error } = await service
      .from('profiles')
      .select('id, learner_id')
      .in('learner_id', learnerIds.slice(i, i + 200))
      .eq('is_active', true);
    if (error) throw error;
    (data ?? []).forEach((p) => {
      if (p.learner_id && p.id) out.set(p.learner_id as string, p.id as string);
    });
  }
  return out;
}

function driveWhenWhere(drive: CdcDrive): string {
  const parts: string[] = [];
  if (drive.drive_date) parts.push(`Date: ${drive.drive_date}`);
  if (drive.drive_start_time) parts.push(`Time: ${drive.drive_start_time.slice(0, 5)}`);
  if (drive.venue_label) parts.push(`Venue: ${drive.venue_label}`);
  return parts.length ? ` ${parts.join(' · ')}.` : '';
}

async function notifyShortlisted(service: SupabaseClient, drive: CdcDrive, learnerIds: string[], actorId: string): Promise<number> {
  if (learnerIds.length === 0) return 0;
  const map = await userIdsOfLearners(service, learnerIds);
  const notified = await notifyUsers(service, {
    prefix: 'cdc_drive_shortlisted',
    driveId: drive.id,
    userIds: Array.from(map.values()),
    actorId,
    title: `You are shortlisted: ${drive.title}`,
    body: `You are on the final participant list for ${drive.title}.${driveWhenWhere(drive)} Report on time with your ID card and resume.`,
    url: learnerDriveUrl(drive.id),
    category: 'cdc.drive.shortlisted',
    event: 'cdc_drive_shortlisted',
  });
  if (notified > 0) {
    await service
      .from('cdc_drive_participants')
      .update({ notified_at: new Date().toISOString() })
      .eq('drive_id', drive.id)
      .in('learner_id', Array.from(map.keys()));
  }
  return notified;
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

interface ParticipantDbRow {
  learner_id: string;
  source: 'willing' | 'added';
  status: 'active' | 'removed';
  remarks: string | null;
  added_at: string;
  removed_at: string | null;
  notified_at: string | null;
}

export interface ParticipantsView {
  finalized_at: string | null;
  /** Every learner in the audience (plus responders), each flagged with participation. */
  rows: CdcDriveParticipantRow[];
  counts: { audience: number; willing: number; participants: number; added: number; removed: number };
}

function toParticipantRow(a: CdcDriveAssignedRow, p: ParticipantDbRow | undefined, finalized: boolean): CdcDriveParticipantRow {
  const active = p?.status === 'active';
  return {
    ...a,
    is_participant: active,
    // Before finalization the default proposal is "everyone who said Willing".
    proposed: finalized ? active : a.bucket === 'willing',
    participant_source: p?.source ?? null,
    participant_status: p?.status ?? null,
    participant_remarks: p?.remarks ?? null,
    participant_added_at: p?.added_at ?? null,
    participant_notified_at: p?.notified_at ?? null,
  };
}

export async function getParticipantsView(
  service: SupabaseClient,
  drive: CdcDrive,
  opts: { releaseProfileContact: boolean }
): Promise<ParticipantsView> {
  const [{ rows: assigned }, { data: parts, error }] = await Promise.all([
    buildAssignedLearners(service, drive, opts),
    service.from('cdc_drive_participants').select('learner_id, source, status, remarks, added_at, removed_at, notified_at').eq('drive_id', drive.id),
  ]);
  if (error) throw error;
  const byLearner = new Map<string, ParticipantDbRow>();
  ((parts ?? []) as ParticipantDbRow[]).forEach((p) => byLearner.set(p.learner_id, p));
  const finalized = !!drive.participants_finalized_at;
  const rows = assigned.map((a) => toParticipantRow(a, byLearner.get(a.learner_id), finalized));
  const active = rows.filter((r) => r.is_participant);
  return {
    finalized_at: drive.participants_finalized_at ?? null,
    rows,
    counts: {
      audience: rows.length,
      willing: rows.filter((r) => r.bucket === 'willing').length,
      participants: active.length,
      added: active.filter((r) => r.participant_source === 'added').length,
      removed: rows.filter((r) => r.participant_status === 'removed').length,
    },
  };
}

export interface FinalizeResult {
  drive: CdcDrive;
  participants: number;
  notified: number;
  status_changed: boolean;
}

/**
 * Finalize the participant list. `learnerIds` is the ticked set from the
 * screen (defaults to everyone Willing). Moves a willingness_open drive to
 * eligibility_locked ("Participants Finalized"), which also freezes learner
 * responses. Safe to call again: the list is reconciled, and only learners
 * who were not already notified get the shortlist notification.
 */
export async function finalizeParticipants(
  session: SupabaseClient,
  service: SupabaseClient,
  drive: CdcDrive,
  learnerIds: string[] | null,
  actorId: string
): Promise<FinalizeResult> {
  if (!['willingness_open', 'eligibility_locked', 'attendance_day'].includes(drive.status)) {
    throw new Error('Participants can be finalized once willingness has opened and before results are announced.');
  }
  const { rows } = await buildAssignedLearners(service, drive, { releaseProfileContact: false });
  const audience = new Map(rows.map((r) => [r.learner_id, r]));
  const chosen = (learnerIds ?? rows.filter((r) => r.bucket === 'willing').map((r) => r.learner_id)).filter((id) => audience.has(id));
  if (chosen.length === 0) throw new Error('Select at least one participant.');

  const { data: existingRaw, error: exErr } = await service
    .from('cdc_drive_participants')
    .select('learner_id, status, notified_at')
    .eq('drive_id', drive.id);
  if (exErr) throw exErr;
  const existing = new Map(((existingRaw ?? []) as Array<{ learner_id: string; status: string; notified_at: string | null }>).map((e) => [e.learner_id, e]));
  const chosenSet = new Set(chosen);
  const now = new Date().toISOString();

  const upserts = chosen.map((id) => ({
    drive_id: drive.id,
    learner_id: id,
    source: audience.get(id)?.bucket === 'willing' ? 'willing' : 'added',
    status: 'active',
    added_by: actorId,
    removed_by: null,
    removed_at: null,
    updated_at: now,
  }));
  for (let i = 0; i < upserts.length; i += 500) {
    const { error } = await service.from('cdc_drive_participants').upsert(upserts.slice(i, i + 500), { onConflict: 'drive_id,learner_id' });
    if (error) throw error;
  }
  const toRemove = Array.from(existing.entries()).filter(([id, e]) => e.status === 'active' && !chosenSet.has(id)).map(([id]) => id);
  if (toRemove.length) {
    const { error } = await service
      .from('cdc_drive_participants')
      .update({ status: 'removed', removed_by: actorId, removed_at: now, updated_at: now })
      .eq('drive_id', drive.id)
      .in('learner_id', toRemove);
    if (error) throw error;
  }

  const { error: stampErr } = await service
    .from('cdc_drives')
    .update({ participants_finalized_at: drive.participants_finalized_at ?? now, participants_finalized_by: actorId, updated_at: now, updated_by: actorId })
    .eq('id', drive.id);
  if (stampErr) throw stampErr;

  let current = drive;
  let status_changed = false;
  if (drive.status === 'willingness_open') {
    current = await CdcDriveService.transitionDrive(
      session,
      drive.id,
      { to_status: 'eligibility_locked', reason: `Participants finalized (${chosen.length})` },
      actorId
    );
    status_changed = true;
  } else {
    current = (await CdcDriveService.getDrive(service, drive.id)) ?? drive;
  }

  await logActivity(service, [
    { drive_id: drive.id, actor_id: actorId, action: 'participants_finalized', new_value: { participants: chosen.length, removed: toRemove.length } },
    ...toRemove.map((id) => ({ drive_id: drive.id, learner_id: id, actor_id: actorId, action: 'participant_removed', previous_value: { status: 'active' }, new_value: { status: 'removed' } })),
  ]);

  const fresh = chosen.filter((id) => !existing.get(id)?.notified_at);
  let notified = 0;
  try {
    notified = await notifyShortlisted(service, current, fresh, actorId);
  } catch (err) {
    console.error('[cdc/drive-day] shortlist notification failed', err);
  }
  return { drive: current, participants: chosen.length, notified, status_changed };
}

/** Add or remove individual learners after finalization (audited; add notifies only that learner). */
export async function changeParticipants(
  service: SupabaseClient,
  drive: CdcDrive,
  action: 'add' | 'remove',
  learnerIds: string[],
  actorId: string,
  reason: string | null
): Promise<{ changed: number; notified: number }> {
  if (!drive.participants_finalized_at) throw new Error('Finalize participants first.');
  if (drive.status === 'closed' || drive.status === 'cancelled') throw new Error('This drive can no longer be changed.');
  const { rows } = await buildAssignedLearners(service, drive, { releaseProfileContact: false });
  const audience = new Map(rows.map((r) => [r.learner_id, r]));
  const ids = Array.from(new Set(learnerIds)).filter((id) => audience.has(id));
  if (ids.length === 0) throw new Error('No matching learners in this drive’s audience.');
  const now = new Date().toISOString();

  if (action === 'add') {
    const { error } = await service.from('cdc_drive_participants').upsert(
      ids.map((id) => ({
        drive_id: drive.id,
        learner_id: id,
        source: audience.get(id)?.bucket === 'willing' ? 'willing' : 'added',
        status: 'active',
        remarks: reason,
        added_by: actorId,
        added_at: now,
        removed_by: null,
        removed_at: null,
        updated_at: now,
      })),
      { onConflict: 'drive_id,learner_id' }
    );
    if (error) throw error;
    await logActivity(service, ids.map((id) => ({ drive_id: drive.id, learner_id: id, actor_id: actorId, action: 'participant_added', new_value: { status: 'active' }, reason })));
    let notified = 0;
    try {
      notified = await notifyShortlisted(service, drive, ids, actorId);
    } catch (err) {
      console.error('[cdc/drive-day] add-participant notification failed', err);
    }
    return { changed: ids.length, notified };
  }

  const { error } = await service
    .from('cdc_drive_participants')
    .update({ status: 'removed', remarks: reason, removed_by: actorId, removed_at: now, updated_at: now })
    .eq('drive_id', drive.id)
    .in('learner_id', ids);
  if (error) throw error;
  await logActivity(service, ids.map((id) => ({ drive_id: drive.id, learner_id: id, actor_id: actorId, action: 'participant_removed', previous_value: { status: 'active' }, new_value: { status: 'removed' }, reason })));
  return { changed: ids.length, notified: 0 };
}

// ---------------------------------------------------------------------------
// Coordinators
// ---------------------------------------------------------------------------

// Embedded team-member record, aliased `member` (joined through the staff_id FK).
const COORDINATOR_COLUMNS =
  'id, drive_id, staff_id, user_id, assigned_at, notified_at, member:staff_id(first_name, last_name, staff_id, designation, email, institution_id)';

export async function listCoordinators(service: SupabaseClient, driveId: string): Promise<CdcDriveCoordinator[]> {
  const { data, error } = await service
    .from('cdc_drive_coordinators')
    .select(COORDINATOR_COLUMNS)
    .eq('drive_id', driveId)
    .order('assigned_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Array<Record<string, any>>).map((r) => ({
    id: r.id,
    drive_id: r.drive_id,
    staff_id: r.staff_id,
    user_id: r.user_id ?? null,
    assigned_at: r.assigned_at,
    notified_at: r.notified_at ?? null,
    name: `${r.member?.first_name ?? ''} ${r.member?.last_name ?? ''}`.trim() || 'Unknown',
    staff_code: r.member?.staff_id ?? null,
    designation: r.member?.designation ?? null,
    email: r.member?.email ?? null,
    has_login: !!r.user_id,
  }));
}

/** Replace the coordinator set. Newly assigned staff with a login get one "Drive Assigned" notification. */
export async function setCoordinators(
  service: SupabaseClient,
  drive: CdcDrive,
  staffIds: string[],
  actorId: string
): Promise<{ coordinators: CdcDriveCoordinator[]; added: number; removed: number; notified: number }> {
  const wanted = Array.from(new Set(staffIds.filter(Boolean)));
  const { data: currentRaw, error: curErr } = await service.from('cdc_drive_coordinators').select('staff_id').eq('drive_id', drive.id);
  if (curErr) throw curErr;
  const current = new Set(((currentRaw ?? []) as Array<{ staff_id: string }>).map((c) => c.staff_id));
  const toAdd = wanted.filter((id) => !current.has(id));
  const toRemove = Array.from(current).filter((id) => !wanted.includes(id));

  let newUserIds: string[] = [];
  if (toAdd.length) {
    const { data: staffRows, error: sErr } = await service.from('staff').select('id, profile_id').in('id', toAdd);
    if (sErr) throw sErr;
    const profileOf = new Map(((staffRows ?? []) as Array<{ id: string; profile_id: string | null }>).map((s) => [s.id, s.profile_id]));
    const known = toAdd.filter((id) => profileOf.has(id));
    if (known.length) {
      const { error } = await service.from('cdc_drive_coordinators').insert(
        known.map((id) => ({ drive_id: drive.id, staff_id: id, user_id: profileOf.get(id) ?? null, assigned_by: actorId }))
      );
      if (error) throw error;
      newUserIds = known.map((id) => profileOf.get(id)).filter((v): v is string => !!v);
    }
  }
  if (toRemove.length) {
    const { error } = await service.from('cdc_drive_coordinators').delete().eq('drive_id', drive.id).in('staff_id', toRemove);
    if (error) throw error;
  }

  await logActivity(service, [
    ...toAdd.map((id) => ({ drive_id: drive.id, actor_id: actorId, action: 'coordinator_assigned', new_value: { staff_id: id } })),
    ...toRemove.map((id) => ({ drive_id: drive.id, actor_id: actorId, action: 'coordinator_removed', previous_value: { staff_id: id } })),
  ]);

  let notified = 0;
  try {
    notified = await notifyUsers(service, {
      prefix: 'cdc_drive_coordinator_assigned',
      driveId: drive.id,
      userIds: newUserIds,
      actorId,
      title: `Drive assigned: ${drive.title}`,
      body: `You are a coordinator for ${drive.title}.${driveWhenWhere(drive)} Open the drive to mark attendance on the day.`,
      url: `/cdc/drives/${drive.id}/attendance`,
      category: 'cdc.drive.coordinator_assigned',
      event: 'cdc_drive_coordinator_assigned',
    });
    if (notified > 0) {
      await service.from('cdc_drive_coordinators').update({ notified_at: new Date().toISOString() }).eq('drive_id', drive.id).in('user_id', newUserIds);
    }
  } catch (err) {
    console.error('[cdc/drive-day] coordinator notification failed', err);
  }

  return { coordinators: await listCoordinators(service, drive.id), added: toAdd.length, removed: toRemove.length, notified };
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

interface AttendanceDbRow {
  learner_id: string;
  status: CdcDriveAttendanceStatus | null;
  attended: boolean;
  attended_at: string | null;
  remarks: string | null;
  marked_by: string | null;
  updated_by: string | null;
  updated_at: string;
}

export function summarizeAttendance(rows: Array<Pick<CdcDriveAttendanceRow, 'attendance_status'>>): CdcDriveAttendanceSummary {
  const s: CdcDriveAttendanceSummary = { total: rows.length, present: 0, absent: 0, late: 0, excused: 0, not_attended: 0, unmarked: 0 };
  for (const r of rows) {
    if (!r.attendance_status) s.unmarked += 1;
    else s[r.attendance_status] += 1;
  }
  return s;
}

export async function getAttendanceRoster(
  service: SupabaseClient,
  drive: CdcDrive,
  opts: { releaseProfileContact: boolean }
): Promise<{ rows: CdcDriveAttendanceRow[]; summary: CdcDriveAttendanceSummary; preview: boolean }> {
  const [{ rows: assigned }, { data: parts, error: pErr }, { data: att, error: aErr }] = await Promise.all([
    buildAssignedLearners(service, drive, opts),
    service.from('cdc_drive_participants').select('learner_id').eq('drive_id', drive.id).eq('status', 'active'),
    service
      .from('cdc_drive_attendance')
      .select('learner_id, status, attended, attended_at, remarks, marked_by, updated_by, updated_at')
      .eq('drive_id', drive.id)
      .eq('round_no', DRIVE_DAY_ROUND),
  ]);
  if (pErr) throw pErr;
  if (aErr) throw aErr;
  const participantIds = new Set(((parts ?? []) as Array<{ learner_id: string }>).map((p) => p.learner_id));
  const attBy = new Map(((att ?? []) as AttendanceDbRow[]).map((a) => [a.learner_id, a]));

  const markerIds = Array.from(new Set(Array.from(attBy.values()).map((a) => a.updated_by ?? a.marked_by).filter((v): v is string => !!v)));
  const markerName = new Map<string, string>();
  if (markerIds.length) {
    const { data: profs } = await service.from('profiles').select('id, full_name').in('id', markerIds);
    (profs ?? []).forEach((p) => markerName.set(p.id as string, (p.full_name as string) ?? ''));
  }

  // Before finalization there is no participant list yet. Show who WOULD be on
  // it (everyone who answered Willing) as a read-only preview, so the page is
  // never an unexplained blank. Marking stays blocked until CDC finalizes.
  const preview = !drive.participants_finalized_at;
  const rows: CdcDriveAttendanceRow[] = assigned
    .filter((a) => (preview ? a.bucket === 'willing' : participantIds.has(a.learner_id)))
    .map((a) => {
      const x = attBy.get(a.learner_id);
      const marker = x ? x.updated_by ?? x.marked_by : null;
      return {
        ...a,
        attendance_status: x?.status ?? (x ? (x.attended ? 'present' : 'absent') : null),
        attendance_marked_at: x?.attended_at ?? x?.updated_at ?? null,
        attendance_marked_by: marker ? markerName.get(marker) ?? null : null,
        attendance_remarks: x?.remarks ?? null,
      };
    })
    .sort((l, r) => (l.register_number ?? '').localeCompare(r.register_number ?? ''));
  return { rows, summary: summarizeAttendance(rows), preview };
}

/** Mark (or correct) attendance for a set of finalized participants. Every change is audited with its previous value. */
export async function markAttendance(
  service: SupabaseClient,
  drive: CdcDrive,
  learnerIds: string[],
  status: CdcDriveAttendanceStatus,
  remarks: string | null,
  actor: { id: string; role: string | null; ip: string | null }
): Promise<{ marked: number }> {
  if (!ATTENDANCE_STATUSES.includes(status)) throw new Error('Unknown attendance status.');
  const ids = Array.from(new Set(learnerIds.filter(Boolean)));
  if (ids.length === 0) throw new Error('Select at least one learner.');

  const { data: parts, error: pErr } = await service
    .from('cdc_drive_participants')
    .select('learner_id')
    .eq('drive_id', drive.id)
    .eq('status', 'active')
    .in('learner_id', ids);
  if (pErr) throw pErr;
  const valid = ((parts ?? []) as Array<{ learner_id: string }>).map((p) => p.learner_id);
  if (valid.length === 0) throw new Error('None of the selected learners are finalized participants of this drive.');

  const { data: prevRaw, error: prevErr } = await service
    .from('cdc_drive_attendance')
    .select('learner_id, status, remarks')
    .eq('drive_id', drive.id)
    .eq('round_no', DRIVE_DAY_ROUND)
    .in('learner_id', valid);
  if (prevErr) throw prevErr;
  const prev = new Map(((prevRaw ?? []) as Array<{ learner_id: string; status: string | null; remarks: string | null }>).map((p) => [p.learner_id, p]));

  const now = new Date().toISOString();
  const { error } = await service.from('cdc_drive_attendance').upsert(
    valid.map((id) => ({
      drive_id: drive.id,
      learner_id: id,
      round_no: DRIVE_DAY_ROUND,
      status,
      attended: attendedOf(status),
      attended_at: now,
      remarks: remarks ?? prev.get(id)?.remarks ?? null,
      marked_by: actor.id,
      updated_by: actor.id,
      updated_at: now,
    })),
    { onConflict: 'drive_id,learner_id,round_no' }
  );
  if (error) throw error;

  await logActivity(
    service,
    valid
      .filter((id) => prev.get(id)?.status !== status)
      .map((id) => ({
        drive_id: drive.id,
        learner_id: id,
        actor_id: actor.id,
        actor_role: actor.role,
        action: prev.has(id) ? 'attendance_changed' : 'attendance_marked',
        previous_value: prev.has(id) ? { status: prev.get(id)?.status ?? null } : null,
        new_value: { status },
        reason: remarks,
        ip_address: actor.ip,
      }))
  );
  return { marked: valid.length };
}

/**
 * Undo a wrong mark: the learner goes back to "Not marked". The row is removed
 * (there is no status to keep) and the previous status is preserved in the
 * activity log, so the correction is traceable.
 */
export async function clearAttendance(
  service: SupabaseClient,
  drive: CdcDrive,
  learnerIds: string[],
  reason: string | null,
  actor: { id: string; role: string | null; ip: string | null }
): Promise<{ cleared: number }> {
  const ids = Array.from(new Set(learnerIds.filter(Boolean)));
  if (ids.length === 0) throw new Error('Select at least one learner.');

  const { data: prevRaw, error: prevErr } = await service
    .from('cdc_drive_attendance')
    .select('learner_id, status, attended')
    .eq('drive_id', drive.id)
    .eq('round_no', DRIVE_DAY_ROUND)
    .in('learner_id', ids);
  if (prevErr) throw prevErr;
  const prev = (prevRaw ?? []) as Array<{ learner_id: string; status: string | null; attended: boolean }>;
  if (prev.length === 0) return { cleared: 0 };

  const { error } = await service
    .from('cdc_drive_attendance')
    .delete()
    .eq('drive_id', drive.id)
    .eq('round_no', DRIVE_DAY_ROUND)
    .in('learner_id', prev.map((p) => p.learner_id));
  if (error) throw error;

  await logActivity(
    service,
    prev.map((p) => ({
      drive_id: drive.id,
      learner_id: p.learner_id,
      actor_id: actor.id,
      actor_role: actor.role,
      action: 'attendance_cleared',
      previous_value: { status: p.status ?? (p.attended ? 'present' : 'absent') },
      new_value: { status: null },
      reason,
      ip_address: actor.ip,
    }))
  );
  return { cleared: prev.length };
}

/** What the learner may see about their own participation (own row only). */
export async function getLearnerParticipation(
  service: SupabaseClient,
  drive: Pick<CdcDrive, 'id' | 'participants_finalized_at'>,
  learnerId: string
): Promise<{ finalized: boolean; is_participant: boolean; attendance_status: CdcDriveAttendanceStatus | null }> {
  if (!drive.participants_finalized_at) return { finalized: false, is_participant: false, attendance_status: null };
  const [{ data: p }, { data: a }] = await Promise.all([
    service.from('cdc_drive_participants').select('status').eq('drive_id', drive.id).eq('learner_id', learnerId).maybeSingle(),
    service.from('cdc_drive_attendance').select('status, attended').eq('drive_id', drive.id).eq('learner_id', learnerId).eq('round_no', DRIVE_DAY_ROUND).maybeSingle(),
  ]);
  return {
    finalized: true,
    is_participant: p?.status === 'active',
    attendance_status: (a?.status as CdcDriveAttendanceStatus | null) ?? (a ? (a.attended ? 'present' : 'absent') : null),
  };
}
