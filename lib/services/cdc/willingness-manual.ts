/**
 * Manual willingness (2026-09-23): CDC or an assigned coordinator marks chosen
 * learners as Willing on their behalf — for learners who confirmed in person,
 * by phone, or have no login. Writes the same cdc_drive_willingness row the
 * learner form writes, with `via: 'staff-manual'` in the audit and NO academic
 * figures (those are the learner's own declaration; the office fills nothing
 * it did not hear). Existing Willing rows are left untouched.
 *
 * Callers gate access (cdc.drives.edit OR assigned coordinator) and pass the
 * service-role client: coordinators cannot write this table under RLS.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CdcDrive } from '@/types/cdc';
import { CDC_DRIVE_STATUS_LABELS } from '@/types/cdc';

/** Stages at which the office may still add willing learners by hand. */
const MANUAL_WILLING_STATUSES = new Set(['announced', 'willingness_open', 'eligibility_locked', 'attendance_day']);

export interface ManualWillingResult {
  marked: number;
  already_willing: number;
  unknown: number;
}

export function canMarkWillingManually(drive: Pick<CdcDrive, 'status'>): { ok: boolean; reason: string | null } {
  if (MANUAL_WILLING_STATUSES.has(drive.status)) return { ok: true, reason: null };
  return {
    ok: false,
    reason: `Willingness cannot be changed while the drive is ${CDC_DRIVE_STATUS_LABELS[drive.status]}.`,
  };
}

export async function markWillingManually(
  service: SupabaseClient,
  drive: Pick<CdcDrive, 'id' | 'status' | 'institution_semesters'>,
  learnerIds: string[],
  actorId: string,
  actorRole: 'cdc' | 'coordinator'
): Promise<ManualWillingResult> {
  const gate = canMarkWillingManually(drive);
  if (!gate.ok) throw new Error(gate.reason!);

  const ids = Array.from(new Set(learnerIds.filter((v) => typeof v === 'string' && v.length > 0)));
  if (ids.length === 0) return { marked: 0, already_willing: 0, unknown: 0 };
  if (ids.length > 1000) throw new Error('Select at most 1000 learners at a time.');

  const [{ data: learners, error: lErr }, { data: existing, error: wErr }] = await Promise.all([
    service
      .from('learners_profiles')
      .select('id, first_name, last_name, college_email, student_email, student_mobile, program_id, institution_id, semester_id')
      .in('id', ids),
    service.from('cdc_drive_willingness').select('id, learner_id, status, willingness_audit').eq('drive_id', drive.id).in('learner_id', ids),
  ]);
  if (lErr) throw lErr;
  if (wErr) throw wErr;

  const now = new Date().toISOString();
  const via = actorRole === 'coordinator' ? 'coordinator-manual' : 'staff-manual';
  const existingByLearner = new Map((existing ?? []).map((w) => [w.learner_id as string, w]));
  const known = new Map((learners ?? []).map((l) => [l.id as string, l]));

  let marked = 0;
  let already = 0;
  const inserts: Record<string, unknown>[] = [];
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];

  for (const learnerId of ids) {
    const l = known.get(learnerId);
    if (!l) continue;
    const row = existingByLearner.get(learnerId);
    if (row?.status === 'willing' || row?.status === 'confirmed') {
      already += 1;
      continue;
    }
    const audit = { at: now, actor: actorId, from_status: row?.status ?? null, to_status: 'willing', via };
    const snapshot = {
      mode: 'manual',
      institution_semesters: drive.institution_semesters ?? [],
      learner_program_id: l.program_id ?? null,
      learner_institution_id: l.institution_id ?? null,
      learner_semester_id: l.semester_id ?? null,
      snapshot_at: now,
    };
    const details = {
      learner_name: [l.first_name, l.last_name].map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean).join(' ') || null,
      learner_email: (l.college_email as string | null) || (l.student_email as string | null) || null,
      learner_mobile: (l.student_mobile as string | null) || null,
    };
    marked += 1;
    if (row) {
      const prev = Array.isArray(row.willingness_audit) ? (row.willingness_audit as unknown[]) : [];
      updates.push({
        id: row.id as string,
        payload: {
          status: 'willing',
          declared_at: now,
          declared_by_user_id: actorId,
          updated_at: now,
          withdrawn_at: null,
          withdrawn_reason: null,
          eligibility_snapshot: snapshot,
          willingness_audit: [...prev, audit],
          ...details,
        },
      });
    } else {
      inserts.push({
        drive_id: drive.id,
        learner_id: learnerId,
        status: 'willing',
        declared_at: now,
        declared_by_user_id: actorId,
        eligibility_snapshot: snapshot,
        willingness_audit: [audit],
        ...details,
      });
    }
  }

  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await service.from('cdc_drive_willingness').insert(inserts.slice(i, i + 500));
    if (error) throw error;
  }
  for (const u of updates) {
    const { error } = await service.from('cdc_drive_willingness').update(u.payload).eq('id', u.id);
    if (error) throw error;
  }

  return { marked, already_willing: already, unknown: ids.length - known.size };
}
