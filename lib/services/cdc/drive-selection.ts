/**
 * lib/services/cdc/drive-selection.ts
 *
 * Selection decisions + the "Selected learners" view of a drive:
 *
 *   participants ─▶ attendance ─▶ decision (selected / waitlisted / rejected / hold)
 *                                   └─▶ documents (offer / appointment / joining …)
 *
 * Same (drive_id, learner_id) key as every other stage. Decisions are separate
 * from evaluation marks so the HR-evaluation slice can plug in later.
 *
 * Service-role client required; the API gates the caller first.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getAttendanceRoster, logActivity } from './drive-day';
import type {
  CdcDocumentType,
  CdcDrive,
  CdcDriveSelectionRow,
  CdcDriveSelectionSummary,
  CdcSelectionDecision,
} from '@/types/cdc';

export const SELECTION_DECISIONS: CdcSelectionDecision[] = ['selected', 'waitlisted', 'rejected', 'hold'];

export const SELECTION_LABEL: Record<CdcSelectionDecision, string> = {
  selected: 'Selected',
  waitlisted: 'Waitlisted',
  rejected: 'Rejected',
  hold: 'Hold',
};

/** Decisions may be recorded from the drive day until the drive is closed. */
const DECISION_STATUSES = new Set(['eligibility_locked', 'attendance_day', 'results_announced']);

export function canRecordDecisions(drive: Pick<CdcDrive, 'status' | 'participants_finalized_at'>): { ok: boolean; reason: string | null } {
  if (!drive.participants_finalized_at) return { ok: false, reason: 'Finalize participants first.' };
  if (!DECISION_STATUSES.has(drive.status)) {
    return { ok: false, reason: drive.status === 'closed' ? 'This drive is closed.' : 'Decisions open once participants are finalized.' };
  }
  return { ok: true, reason: null };
}

export function summarizeSelection(rows: Array<Pick<CdcDriveSelectionRow, 'decision' | 'attendance_status' | 'documents'>>): CdcDriveSelectionSummary {
  const s: CdcDriveSelectionSummary = {
    participants: rows.length,
    attended: 0,
    selected: 0,
    waitlisted: 0,
    rejected: 0,
    hold: 0,
    undecided: 0,
    offer_uploaded: 0,
    offer_pending: 0,
  };
  for (const r of rows) {
    if (r.attendance_status === 'present' || r.attendance_status === 'late') s.attended += 1;
    if (!r.decision) s.undecided += 1;
    else s[r.decision] += 1;
    if (r.decision === 'selected') {
      if (r.documents.some((d) => d.document_type === 'offer_letter')) s.offer_uploaded += 1;
      else s.offer_pending += 1;
    }
  }
  return s;
}

export async function getSelectionView(
  service: SupabaseClient,
  drive: CdcDrive,
  opts: { releaseProfileContact: boolean }
): Promise<{ rows: CdcDriveSelectionRow[]; summary: CdcDriveSelectionSummary }> {
  const [{ rows: roster }, selRes, docRes] = await Promise.all([
    getAttendanceRoster(service, drive, opts),
    service.from('cdc_drive_selections').select('learner_id, decision, remarks, decided_at, decided_by').eq('drive_id', drive.id),
    service
      .from('cdc_drive_documents')
      .select('id, learner_id, document_type, file_name, version, status, uploaded_at')
      .eq('drive_id', drive.id)
      .eq('is_current', true),
  ]);
  if (selRes.error) throw selRes.error;
  if (docRes.error) throw docRes.error;

  const selBy = new Map(((selRes.data ?? []) as Array<Record<string, any>>).map((s) => [s.learner_id as string, s]));
  const docsBy = new Map<string, CdcDriveSelectionRow['documents']>();
  for (const d of (docRes.data ?? []) as Array<Record<string, any>>) {
    const list = docsBy.get(d.learner_id) ?? [];
    list.push({
      id: d.id,
      document_type: d.document_type as CdcDocumentType,
      file_name: d.file_name,
      version: d.version,
      status: d.status,
      uploaded_at: d.uploaded_at,
    });
    docsBy.set(d.learner_id, list);
  }

  const deciderIds = Array.from(new Set(Array.from(selBy.values()).map((s) => s.decided_by).filter((v): v is string => !!v)));
  const deciderName = new Map<string, string>();
  if (deciderIds.length) {
    const { data: profs } = await service.from('profiles').select('id, full_name').in('id', deciderIds);
    (profs ?? []).forEach((p) => deciderName.set(p.id as string, (p.full_name as string) ?? ''));
  }

  const rows: CdcDriveSelectionRow[] = roster.map((r) => {
    const s = selBy.get(r.learner_id);
    return {
      ...r,
      decision: (s?.decision as CdcSelectionDecision | undefined) ?? null,
      decision_remarks: s?.remarks ?? null,
      decided_at: s?.decided_at ?? null,
      decided_by_name: s?.decided_by ? deciderName.get(s.decided_by) ?? null : null,
      documents: docsBy.get(r.learner_id) ?? [],
    };
  });
  return { rows, summary: summarizeSelection(rows) };
}

/** Record (or change) a decision for a set of finalized participants. `null` clears it. */
export async function recordDecisions(
  service: SupabaseClient,
  drive: CdcDrive,
  learnerIds: string[],
  decision: CdcSelectionDecision | null,
  remarks: string | null,
  actor: { id: string; ip: string | null }
): Promise<{ changed: number }> {
  const gate = canRecordDecisions(drive);
  if (!gate.ok) throw new Error(gate.reason ?? 'Decisions cannot be recorded right now.');
  if (decision !== null && !SELECTION_DECISIONS.includes(decision)) throw new Error('Unknown decision.');
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
    .from('cdc_drive_selections')
    .select('learner_id, decision')
    .eq('drive_id', drive.id)
    .in('learner_id', valid);
  if (prevErr) throw prevErr;
  const prev = new Map(((prevRaw ?? []) as Array<{ learner_id: string; decision: string }>).map((p) => [p.learner_id, p.decision]));
  const now = new Date().toISOString();

  if (decision === null) {
    const { error } = await service.from('cdc_drive_selections').delete().eq('drive_id', drive.id).in('learner_id', valid);
    if (error) throw error;
  } else {
    const { error } = await service.from('cdc_drive_selections').upsert(
      valid.map((id) => ({ drive_id: drive.id, learner_id: id, decision, remarks, decided_by: actor.id, decided_at: now, updated_at: now })),
      { onConflict: 'drive_id,learner_id' }
    );
    if (error) throw error;
  }

  const changedIds = valid.filter((id) => (prev.get(id) ?? null) !== decision);
  await logActivity(
    service,
    changedIds.map((id) => ({
      drive_id: drive.id,
      learner_id: id,
      actor_id: actor.id,
      action: prev.has(id) ? 'selection_changed' : 'selection_recorded',
      previous_value: prev.has(id) ? { decision: prev.get(id) } : null,
      new_value: { decision },
      reason: remarks,
      ip_address: actor.ip,
    }))
  );
  return { changed: changedIds.length };
}

/** What the learner may see once results are announced: own decision + own current documents. */
export async function getLearnerOutcome(
  service: SupabaseClient,
  drive: Pick<CdcDrive, 'id' | 'status'>,
  learnerId: string
): Promise<{ decision: CdcSelectionDecision | null; documents: Array<{ id: string; document_type: CdcDocumentType; file_name: string; uploaded_at: string }> }> {
  if (drive.status !== 'results_announced' && drive.status !== 'closed') return { decision: null, documents: [] };
  const [{ data: sel }, { data: docs }] = await Promise.all([
    service.from('cdc_drive_selections').select('decision').eq('drive_id', drive.id).eq('learner_id', learnerId).maybeSingle(),
    service
      .from('cdc_drive_documents')
      .select('id, document_type, file_name, uploaded_at')
      .eq('drive_id', drive.id)
      .eq('learner_id', learnerId)
      .eq('is_current', true)
      .order('uploaded_at', { ascending: true }),
  ]);
  return {
    decision: (sel?.decision as CdcSelectionDecision | undefined) ?? null,
    documents: ((docs ?? []) as Array<Record<string, any>>).map((d) => ({
      id: d.id,
      document_type: d.document_type as CdcDocumentType,
      file_name: d.file_name,
      uploaded_at: d.uploaded_at,
    })),
  };
}
