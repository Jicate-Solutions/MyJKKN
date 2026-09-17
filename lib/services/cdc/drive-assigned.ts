/**
 * lib/services/cdc/drive-assigned.ts
 *
 * The "assigned learners" view of one CDC drive: every learner the drive's
 * institution + semester audience targets, joined with their willingness
 * response (if any) and the notification audit row (if any).
 *
 *   Drive → institution_semesters → targeted learners   (drive-targeting.ts)
 *         ∪ learners with a willingness row              (moved cohort keeps their answer visible)
 *         ⟕ cdc_drive_willingness  (drive_id + learner_id)
 *         ⟕ cdc_drive_notification_log (willingness_open type)
 *
 * No separate assignment table: the audience is derived from the drive's
 * configuration exactly as the notification fan-out derives it.
 *
 * Contact release rule mirrors the responses route: profile email / mobile go
 * out when the caller may view learner profiles (learners.profiles.view or
 * legacy learners.view); otherwise only the contact the learner consented to
 * at submission. CGPA / arrears / additional mobile are ALWAYS snapshot +
 * consent only — they are never recomputed for pending learners.
 *
 * Service-role client required (multi-college audience must not be narrowed by
 * the caller's RLS scope); gate the caller BEFORE calling.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type CdcArrearDetail,
  type CdcAssignedNotificationState,
  type CdcAssignedWillingnessBucket,
  type CdcDrive,
  type CdcDriveAssignedRow,
  type CdcDriveAssignedSummary,
  type CdcWillingnessStatus,
  CDC_ASSIGNED_BUCKET_LABEL,
  CDC_ASSIGNED_NOTIFICATION_LABEL,
} from '@/types/cdc';
import { resolveTargetLearners } from './drive-targeting';
import { CDC_WILLINGNESS_NOTIFICATION_TYPE } from './drive-notifications';

const IN_CHUNK = 200;
const LEARNER_PROFILE_COLUMNS =
  'id, first_name, last_name, register_number, roll_number, student_photo_url, institution_id, department_id, semester_id, student_email, college_email, student_mobile';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function bucketOf(status: CdcWillingnessStatus | null): CdcAssignedWillingnessBucket {
  if (!status) return 'pending';
  if (status === 'willing' || status === 'confirmed') return 'willing';
  return 'not_willing';
}

export const ASSIGNED_BUCKET_LABEL = CDC_ASSIGNED_BUCKET_LABEL;
export const ASSIGNED_NOTIFICATION_LABEL = CDC_ASSIGNED_NOTIFICATION_LABEL;

function notificationStateOf(row: {
  status: string;
  push_status: string | null;
  push_error: string | null;
} | undefined): { state: CdcAssignedNotificationState; detail: string | null } {
  if (!row) return { state: 'not_sent', detail: null };
  if (row.status === 'no_profile') return { state: 'not_sent', detail: 'No linked login — bell and push impossible' };
  switch (row.push_status) {
    case 'delivered':
      return { state: 'sent', detail: 'Bell + push delivered' };
    case 'failed':
    case 'stale_removed':
      return { state: 'failed', detail: row.push_error || 'Push delivery failed (bell notification still sent)' };
    case 'no_subscription':
    case 'opted_out':
      return { state: 'no_push_token', detail: 'Bell notification sent; no push device registered' };
    case 'skipped':
      return { state: 'sent', detail: 'Bell notification sent; push not configured' };
    default:
      return { state: 'sent', detail: 'Bell notification sent' };
  }
}

export interface AssignedFilters {
  institution_id?: string | null;
  semester_order?: number | null;
  bucket?: CdcAssignedWillingnessBucket | null;
  responded?: boolean | null;
  q?: string | null;
}

export interface AssignedResult {
  rows: CdcDriveAssignedRow[];
  summary: CdcDriveAssignedSummary;
}

export function applyAssignedFilters(rows: CdcDriveAssignedRow[], f: AssignedFilters): CdcDriveAssignedRow[] {
  const q = (f.q ?? '').trim().toLowerCase();
  return rows.filter((r) => {
    if (f.institution_id && r.institution_id !== f.institution_id) return false;
    if (f.semester_order != null && r.semester_order !== f.semester_order) return false;
    if (f.bucket && r.bucket !== f.bucket) return false;
    if (f.responded != null && r.responded !== f.responded) return false;
    if (q) {
      const hay = [r.learner_name, r.register_number, r.roll_number, r.email, r.mobile, r.additional_mobile, r.learner_id]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());
      if (!hay.some((v) => v.includes(q))) return false;
    }
    return true;
  });
}

export function summarizeAssigned(rows: CdcDriveAssignedRow[]): CdcDriveAssignedSummary {
  const s: CdcDriveAssignedSummary = { assigned: rows.length, responded: 0, willing: 0, not_willing: 0, pending: 0 };
  for (const r of rows) {
    if (r.responded) s.responded += 1;
    s[r.bucket] += 1;
  }
  return s;
}

/**
 * Build the full (unfiltered) assigned list for a drive. Callers filter with
 * applyAssignedFilters so the summary cards always describe the whole audience.
 */
export async function buildAssignedLearners(
  service: SupabaseClient,
  drive: Pick<CdcDrive, 'id' | 'institutions' | 'institution_semesters'>,
  opts: { releaseProfileContact: boolean }
): Promise<AssignedResult> {
  // 1. Audience from targeting (ids + semester order as targeted).
  const target = await resolveTargetLearners(service, drive);
  const targetedIds = new Set<string>();
  target.learners.forEach((l) => targetedIds.add(l.learner_id));
  target.unlinked.forEach((l) => targetedIds.add(l.learner_id));

  // 2. Willingness rows for the drive (keyed drive_id + learner_id, unique).
  const { data: wRaw, error: wErr } = await service
    .from('cdc_drive_willingness')
    .select('*')
    .eq('drive_id', drive.id)
    .limit(20000);
  if (wErr) throw wErr;
  const willingness = new Map<string, Record<string, unknown>>();
  (wRaw ?? []).forEach((w) => willingness.set(w.learner_id as string, w as Record<string, unknown>));

  const allIds = Array.from(new Set([...targetedIds, ...willingness.keys()]));
  if (allIds.length === 0) {
    return { rows: [], summary: summarizeAssigned([]) };
  }

  // 3. Notification audit (latest row per learner).
  const notif = new Map<string, { status: string; push_status: string | null; push_error: string | null; sent_at: string }>();
  const { data: nRaw, error: nErr } = await service
    .from('cdc_drive_notification_log')
    .select('learner_id, status, push_status, push_error, sent_at')
    .eq('drive_id', drive.id)
    .eq('notification_type', CDC_WILLINGNESS_NOTIFICATION_TYPE)
    .order('sent_at', { ascending: false })
    .limit(20000);
  if (nErr) throw nErr;
  for (const n of nRaw ?? []) {
    const lid = n.learner_id as string;
    if (!notif.has(lid)) {
      notif.set(lid, {
        status: n.status as string,
        push_status: (n.push_status as string | null) ?? null,
        push_error: (n.push_error as string | null) ?? null,
        sent_at: n.sent_at as string,
      });
    }
  }

  // 4. Learner profiles + lookups.
  const learners = new Map<string, Record<string, unknown>>();
  for (const ids of chunk(allIds, IN_CHUNK)) {
    const { data, error } = await service.from('learners_profiles').select(LEARNER_PROFILE_COLUMNS).in('id', ids);
    if (error) throw error;
    (data ?? []).forEach((l) => learners.set(l.id as string, l as Record<string, unknown>));
  }
  const pick = (k: string) =>
    Array.from(new Set(Array.from(learners.values()).map((l) => l[k] as string | null).filter(Boolean))) as string[];
  const instIds = pick('institution_id');
  const deptIds = pick('department_id');
  const semIds = pick('semester_id');
  const [instRes, deptRes, semRes] = await Promise.all([
    instIds.length ? service.from('institutions').select('id, name').in('id', instIds) : Promise.resolve({ data: [], error: null }),
    deptIds.length ? service.from('departments').select('id, department_name').in('id', deptIds) : Promise.resolve({ data: [], error: null }),
    semIds.length ? service.from('semesters').select('id, semester_name, semester_order').in('id', semIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (instRes.error) throw instRes.error;
  if (deptRes.error) throw deptRes.error;
  if (semRes.error) throw semRes.error;
  const instName = new Map((instRes.data ?? []).map((r: any) => [r.id as string, r.name as string]));
  const deptName = new Map((deptRes.data ?? []).map((r: any) => [r.id as string, r.department_name as string]));
  const semInfo = new Map(
    (semRes.data ?? []).map((r: any) => [r.id as string, { name: r.semester_name as string | null, order: r.semester_order as number | null }])
  );

  // 5. Assemble.
  const rows: CdcDriveAssignedRow[] = [];
  for (const learnerId of allIds) {
    const l = learners.get(learnerId);
    const w = willingness.get(learnerId);
    const sem = l?.semester_id ? semInfo.get(l.semester_id as string) : undefined;
    const status = (w?.status as CdcWillingnessStatus | undefined) ?? null;
    const consented = !!w?.data_consent_at;
    const n = notificationStateOf(notif.get(learnerId));

    const profileName = l
      ? [l.first_name, l.last_name].filter((v) => typeof v === 'string' && v.trim()).join(' ')
      : '';
    const profileEmail = ((l?.student_email as string | null) || (l?.college_email as string | null)) ?? null;
    const profileMobile = (l?.student_mobile as string | null) ?? null;

    let email: string | null = null;
    let mobile: string | null = null;
    let contactSource: CdcDriveAssignedRow['contact_source'] = 'hidden';
    if (opts.releaseProfileContact) {
      email = profileEmail;
      mobile = profileMobile;
      contactSource = 'profile';
    } else if (consented) {
      email = (w?.learner_email as string | null) ?? null;
      mobile = (w?.learner_mobile as string | null) ?? null;
      contactSource = 'consent';
    }

    rows.push({
      learner_id: learnerId,
      learner_name: profileName || (w?.learner_name as string | null) || null,
      register_number: (l?.register_number as string | null) ?? null,
      roll_number: (l?.roll_number as string | null) ?? null,
      photo_url: (l?.student_photo_url as string | null) ?? null,
      institution_id: (l?.institution_id as string | null) ?? null,
      institution_name: l?.institution_id ? instName.get(l.institution_id as string) ?? null : null,
      department_name: l?.department_id ? deptName.get(l.department_id as string) ?? null : null,
      semester_order: sem?.order ?? null,
      semester_label: sem ? (sem.order != null ? `Semester ${sem.order}` : sem.name) : null,
      email,
      mobile,
      additional_mobile: consented ? ((w?.additional_mobile as string | null) ?? null) : null,
      contact_source: contactSource,
      cgpa: consented ? ((w?.cgpa as number | null) ?? null) : null,
      arrears_count: consented ? ((w?.arrears_count as number | null) ?? null) : null,
      arrears_details: consented ? ((w?.arrears_details as CdcArrearDetail[] | null) ?? null) : null,
      data_consent_at: (w?.data_consent_at as string | null) ?? null,
      willingness_status: status,
      bucket: bucketOf(status),
      responded: !!w,
      declared_at: (w?.declared_at as string | null) ?? null,
      notification_state: n.state,
      notification_sent_at: notif.get(learnerId)?.sent_at ?? null,
      notification_detail: n.detail,
      outside_audience: !!w && !targetedIds.has(learnerId),
    });
  }

  rows.sort((a, b) => {
    const ai = a.institution_name ?? '';
    const bi = b.institution_name ?? '';
    if (ai !== bi) return ai.localeCompare(bi);
    const ao = a.semester_order ?? 99;
    const bo = b.semester_order ?? 99;
    if (ao !== bo) return ao - bo;
    return (a.learner_name ?? '').localeCompare(b.learner_name ?? '');
  });

  return { rows, summary: summarizeAssigned(rows) };
}
