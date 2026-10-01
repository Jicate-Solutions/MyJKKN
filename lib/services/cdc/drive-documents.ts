/**
 * lib/services/cdc/drive-documents.ts
 *
 * Per-learner drive documents + bulk upload batches.
 *
 * Bulk flow (three calls, so 200 files never travel in one request):
 *   1. preview  — filenames only → match against the drive's learners, flag
 *                 existing documents. Nothing is stored.
 *   2. start    — coordinator's reviewed plan → a batch row (OFF-2026-0001).
 *      upload   — ONE file per request; the server RE-CHECKS that the learner
 *                 belongs to the drive, then Drive upload + DB row.
 *   3. finish   — per-file outcomes → batch totals + audit.
 *
 * Pool of learners a file may be matched to (resolveDocumentPool — narrowest
 * stage reached wins): SELECTED learners once any decision says selected,
 * else finalized participants, else learners who answered Willing.
 *
 * Existing document → the coordinator chooses skip / replace / new version.
 * Nothing is ever overwritten silently; the old row stays with is_current=false.
 *
 * Service-role client required; the API gates on cdc.drives.edit first.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadCdcDriveDocument } from '@/lib/google/drive-upload';
import { logActivity } from './drive-day';
import { extensionOf, isAllowedDocumentFile, matchFilename, type MatchCandidate } from './document-matching';
import type {
  CdcBulkExistingMode,
  CdcBulkPreviewRow,
  CdcDocumentBatch,
  CdcDocumentType,
  CdcDrive,
} from '@/types/cdc';

export const DOCUMENT_TYPE_LABEL: Record<CdcDocumentType, string> = {
  offer_letter: 'Offer Letter',
  appointment_letter: 'Appointment Letter',
  joining_letter: 'Joining Letter',
  internship_letter: 'Internship Letter',
  training_letter: 'Training Letter',
  salary_letter: 'Salary Letter',
  other: 'Other Document',
};

/** Google Drive sub-folder + stored-name suffix + batch code prefix per type. */
const TYPE_META: Record<CdcDocumentType, { folder: string; suffix: string; code: string }> = {
  offer_letter: { folder: 'Offer Letters', suffix: 'OfferLetter', code: 'OFF' },
  appointment_letter: { folder: 'Appointment Letters', suffix: 'AppointmentLetter', code: 'APP' },
  joining_letter: { folder: 'Joining Letters', suffix: 'JoiningLetter', code: 'JOI' },
  internship_letter: { folder: 'Internship Letters', suffix: 'InternshipLetter', code: 'INT' },
  training_letter: { folder: 'Training Letters', suffix: 'TrainingLetter', code: 'TRN' },
  salary_letter: { folder: 'Salary Letters', suffix: 'SalaryLetter', code: 'SAL' },
  other: { folder: 'Other Documents', suffix: 'Document', code: 'DOC' },
};

export const DOCUMENT_TYPES = Object.keys(TYPE_META) as CdcDocumentType[];
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024; // hosting request-body ceiling is ~4.5 MB
export const MAX_BULK_FILES = 500;

export const ALLOWED_DOCUMENT_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export interface DocumentCandidate extends MatchCandidate {
  institution_name: string | null;
}

export type DocumentPool = 'selected' | 'participants' | 'willing';

/** Which learners documents are matched against right now (narrowest stage reached wins). */
export async function resolveDocumentPool(service: SupabaseClient, drive: CdcDrive): Promise<{ pool: DocumentPool; learnerIds: string[] }> {
  const { data: sel, error: selErr } = await service.from('cdc_drive_selections').select('learner_id').eq('drive_id', drive.id).eq('decision', 'selected');
  // A missing table (migration not applied yet) simply means "no selection stage".
  if (!selErr && (sel ?? []).length > 0) return { pool: 'selected', learnerIds: (sel ?? []).map((r) => r.learner_id as string) };
  if (drive.participants_finalized_at) {
    const { data, error } = await service.from('cdc_drive_participants').select('learner_id').eq('drive_id', drive.id).eq('status', 'active');
    if (error) throw error;
    if ((data ?? []).length > 0) return { pool: 'participants', learnerIds: (data ?? []).map((r) => r.learner_id as string) };
  }
  const { data, error } = await service.from('cdc_drive_willingness').select('learner_id').eq('drive_id', drive.id).in('status', ['willing', 'confirmed']);
  if (error) throw error;
  return { pool: 'willing', learnerIds: (data ?? []).map((r) => r.learner_id as string) };
}

/**
 * Is THIS learner allowed a document on this drive? Same narrowest-stage rule as
 * resolveDocumentPool, but it asks about one learner with three parallel
 * single-row probes instead of downloading the whole pool — this runs once per
 * uploaded file.
 */
export async function isLearnerInDocumentPool(service: SupabaseClient, drive: CdcDrive, learnerId: string): Promise<boolean> {
  const [anySelected, mySelection, myParticipation, myWillingness] = await Promise.all([
    service.from('cdc_drive_selections').select('id', { count: 'exact', head: true }).eq('drive_id', drive.id).eq('decision', 'selected'),
    service.from('cdc_drive_selections').select('decision').eq('drive_id', drive.id).eq('learner_id', learnerId).maybeSingle(),
    service.from('cdc_drive_participants').select('status').eq('drive_id', drive.id).eq('learner_id', learnerId).maybeSingle(),
    service.from('cdc_drive_willingness').select('status').eq('drive_id', drive.id).eq('learner_id', learnerId).maybeSingle(),
  ]);
  // Selection stage reached (and the table exists) → only selected learners.
  if (!anySelected.error && (anySelected.count ?? 0) > 0) return mySelection.data?.decision === 'selected';
  if (drive.participants_finalized_at && !myParticipation.error) return myParticipation.data?.status === 'active';
  const w = myWillingness.data?.status as string | undefined;
  return w === 'willing' || w === 'confirmed';
}

export async function getDocumentCandidates(
  service: SupabaseClient,
  drive: CdcDrive,
  /** Pass an already-resolved pool to avoid resolving it twice in one request. */
  resolved?: { learnerIds: string[] }
): Promise<DocumentCandidate[]> {
  const learnerIds = Array.from(new Set((resolved ?? (await resolveDocumentPool(service, drive))).learnerIds));
  const out: DocumentCandidate[] = [];
  for (let i = 0; i < learnerIds.length; i += 200) {
    const { data, error } = await service
      .from('learners_profiles')
      .select('id, first_name, last_name, register_number, roll_number, institution_id')
      .in('id', learnerIds.slice(i, i + 200));
    if (error) throw error;
    for (const l of data ?? []) {
      out.push({
        learner_id: l.id as string,
        name: [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Unnamed learner',
        register_number: (l.register_number as string | null) ?? null,
        roll_number: (l.roll_number as string | null) ?? null,
        institution_name: null,
      });
    }
  }
  return out.sort((a, b) => (a.register_number ?? '').localeCompare(b.register_number ?? ''));
}

interface CurrentDoc {
  id: string;
  learner_id: string;
  version: number;
  file_name: string;
  uploaded_at: string;
}

async function currentDocuments(service: SupabaseClient, driveId: string, type: CdcDocumentType): Promise<Map<string, CurrentDoc>> {
  const { data, error } = await service
    .from('cdc_drive_documents')
    .select('id, learner_id, version, file_name, uploaded_at')
    .eq('drive_id', driveId)
    .eq('document_type', type)
    .eq('is_current', true);
  if (error) throw error;
  return new Map(((data ?? []) as CurrentDoc[]).map((d) => [d.learner_id, d]));
}

// ---------------------------------------------------------------------------
// 1. Preview
// ---------------------------------------------------------------------------

export interface BulkPreview {
  rows: CdcBulkPreviewRow[];
  candidates: DocumentCandidate[];
  summary: { total: number; matched: number; no_match: number; multiple_match: number; existing: number; invalid: number; duplicate_in_batch: number };
  pool: DocumentPool;
}

export async function previewBulkUpload(
  service: SupabaseClient,
  drive: CdcDrive,
  type: CdcDocumentType,
  files: Array<{ name: string; size: number }>
): Promise<BulkPreview> {
  const poolInfo = await resolveDocumentPool(service, drive);
  const [candidates, existing] = await Promise.all([
    getDocumentCandidates(service, drive, poolInfo),
    currentDocuments(service, drive.id, type),
  ]);
  const seenLearner = new Map<string, string>();
  const rows: CdcBulkPreviewRow[] = files.map((f) => {
    const base: CdcBulkPreviewRow = {
      file_name: f.name,
      size_bytes: f.size,
      status: 'no_match',
      learner_id: null,
      learner_name: null,
      register_number: null,
      roll_number: null,
      match_kind: null,
      options: [],
      existing: null,
      reason: null,
    };
    if (!isAllowedDocumentFile(f.name)) return { ...base, status: 'invalid', reason: `.${extensionOf(f.name) || '?'} is not a supported format` };
    if (f.size > MAX_DOCUMENT_BYTES) return { ...base, status: 'invalid', reason: `Larger than ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB` };
    if (f.size === 0) return { ...base, status: 'invalid', reason: 'Empty file' };

    const m = matchFilename(f.name, candidates);
    if (m.status === 'none') return base;
    if (m.status === 'multiple') {
      return {
        ...base,
        status: 'multiple_match',
        options: m.candidates.map((c) => ({ learner_id: c.learner_id, name: c.name, register_number: c.register_number })),
        reason: 'Matches more than one learner — manual review required',
      };
    }
    const c = m.candidate;
    const row: CdcBulkPreviewRow = {
      ...base,
      status: 'matched',
      learner_id: c.learner_id,
      learner_name: c.name,
      register_number: c.register_number,
      roll_number: c.roll_number,
      match_kind: m.kind,
    };
    const prior = seenLearner.get(c.learner_id);
    if (prior) return { ...row, status: 'duplicate_in_batch', reason: `Same learner as ${prior}` };
    seenLearner.set(c.learner_id, f.name);
    const ex = existing.get(c.learner_id);
    if (ex) return { ...row, status: 'existing', existing: { document_id: ex.id, version: ex.version, file_name: ex.file_name, uploaded_at: ex.uploaded_at } };
    return row;
  });

  const count = (s: CdcBulkPreviewRow['status']) => rows.filter((r) => r.status === s).length;
  return {
    rows,
    candidates,
    pool: poolInfo.pool,
    summary: {
      total: rows.length,
      matched: count('matched'),
      no_match: count('no_match'),
      multiple_match: count('multiple_match'),
      existing: count('existing'),
      invalid: count('invalid'),
      duplicate_in_batch: count('duplicate_in_batch'),
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Batch + per-file upload
// ---------------------------------------------------------------------------

async function nextBatchCode(service: SupabaseClient, type: CdcDocumentType): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${TYPE_META[type].code}-${year}-`;
  const { data } = await service
    .from('cdc_drive_document_batches')
    .select('batch_code')
    .like('batch_code', `${prefix}%`)
    .order('batch_code', { ascending: false })
    .limit(1);
  const last = data?.[0]?.batch_code as string | undefined;
  const n = last ? parseInt(last.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(n + 1).padStart(4, '0')}`;
}

export async function startBatch(
  service: SupabaseClient,
  drive: CdcDrive,
  type: CdcDocumentType,
  totals: { total_files: number; matched: number; no_match: number; multiple_match: number; existing_found: number },
  actorId: string
): Promise<CdcDocumentBatch> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const batch_code = await nextBatchCode(service, type);
    const { data, error } = await service
      .from('cdc_drive_document_batches')
      .insert({ batch_code, drive_id: drive.id, document_type: type, uploaded_by: actorId, ...totals })
      .select()
      .single();
    if (!error) return data as CdcDocumentBatch;
    if ((error as { code?: string }).code !== '23505') throw error; // code collision → try the next number
  }
  throw new Error('Could not allocate a batch number. Please try again.');
}

function safeSegment(v: string): string {
  return v.replace(/[^A-Za-z0-9]/g, '').slice(0, 40) || 'learner';
}

export interface StoreDocumentInput {
  drive: CdcDrive;
  recruiterName: string | null;
  type: CdcDocumentType;
  learnerId: string;
  file: File;
  batchId: string | null;
  mode: CdcBulkExistingMode | null;
  actorId: string;
}

export interface StoreDocumentResult {
  outcome: 'uploaded' | 'replaced' | 'new_version' | 'skipped';
  document_id?: string;
  file_name?: string;
  version?: number;
  document_type?: CdcDocumentType;
  uploaded_at?: string;
}

export async function storeDocument(service: SupabaseClient, input: StoreDocumentInput): Promise<StoreDocumentResult> {
  const { drive, type, learnerId, file } = input;
  if (!ALLOWED_DOCUMENT_MIME.has(file.type) && !isAllowedDocumentFile(file.name)) {
    throw new Error('Unsupported file type. Use PDF, DOC, DOCX, JPG or PNG.');
  }
  if (!isAllowedDocumentFile(file.name)) throw new Error('Unsupported file extension.');
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error(`File is larger than ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB.`);

  // Server-side re-check: the learner must belong to this drive's pool. A forged
  // learner_id can never attach a letter to someone outside the drive.
  // Runs ONCE PER FILE in a bulk upload, so it reads only this learner — never
  // the whole candidate list or every current document of the drive.
  const [inPool, folderRes, learnerRes, existingRes] = await Promise.all([
    isLearnerInDocumentPool(service, drive, learnerId),
    // Any earlier document of this drive + type already knows its Drive folder.
    service
      .from('cdc_drive_documents')
      .select('drive_folder_id')
      .eq('drive_id', drive.id)
      .eq('document_type', type)
      .not('drive_folder_id', 'is', null)
      .limit(1)
      .maybeSingle(),
    service.from('learners_profiles').select('id, first_name, last_name, register_number, roll_number').eq('id', learnerId).maybeSingle(),
    service
      .from('cdc_drive_documents')
      .select('id, learner_id, version, file_name, uploaded_at')
      .eq('drive_id', drive.id)
      .eq('document_type', type)
      .eq('learner_id', learnerId)
      .eq('is_current', true)
      .maybeSingle(),
  ]);
  if (learnerRes.error) throw learnerRes.error;
  if (existingRes.error) throw existingRes.error;
  if (!learnerRes.data || !inPool) throw new Error('This learner is not part of the drive.');
  const learner = {
    name: [learnerRes.data.first_name, learnerRes.data.last_name].filter(Boolean).join(' ') || 'Unnamed learner',
    register_number: (learnerRes.data.register_number as string | null) ?? null,
    roll_number: (learnerRes.data.roll_number as string | null) ?? null,
  };
  const existing = (existingRes.data as CurrentDoc | null) ?? null;
  if (existing && (!input.mode || input.mode === 'skip')) return { outcome: 'skipped' };

  const version = existing ? existing.version + 1 : 1;
  const ident = safeSegment(learner.register_number || learner.roll_number || learner.name);
  const ext = extensionOf(file.name) || 'pdf';
  const storedName = `${ident}_${TYPE_META[type].suffix}${version > 1 ? `_v${version}` : ''}.${ext}`;

  // Drive first: if this throws, no DB row claims a file that does not exist.
  const uploaded = await uploadCdcDriveDocument({
    companyName: input.recruiterName,
    driveDate: drive.drive_date,
    typeFolder: TYPE_META[type].folder,
    storedName,
    file,
    knownFolderId: (folderRes.data?.drive_folder_id as string | null | undefined) ?? null,
  });

  const now = new Date().toISOString();
  if (existing) {
    const { error } = await service
      .from('cdc_drive_documents')
      .update({ is_current: false, status: input.mode === 'replace' ? 'replaced' : 'superseded', updated_at: now })
      .eq('id', existing.id);
    if (error) throw error;
  }
  const { data, error } = await service
    .from('cdc_drive_documents')
    .insert({
      drive_id: drive.id,
      learner_id: learnerId,
      register_number: learner.register_number,
      roll_number: learner.roll_number,
      document_type: type,
      file_name: storedName,
      original_name: file.name,
      mime_type: uploaded.mimeType,
      size_bytes: uploaded.sizeBytes,
      drive_file_id: uploaded.driveFileId,
      drive_folder_id: uploaded.driveFolderId,
      batch_id: input.batchId,
      upload_method: input.batchId ? 'bulk' : 'single',
      version,
      is_current: true,
      status: 'uploaded',
      uploaded_by: input.actorId,
      uploaded_at: now,
    })
    .select('id')
    .single();
  if (error) throw error;

  await logActivity(service, [
    {
      drive_id: drive.id,
      learner_id: learnerId,
      actor_id: input.actorId,
      action: `${type}_uploaded`,
      previous_value: existing ? { document_id: existing.id, version: existing.version } : null,
      new_value: { document_id: data.id, version, file_name: storedName, batch_id: input.batchId },
      reason: existing ? input.mode : null,
    },
  ]);

  return {
    outcome: existing ? (input.mode === 'replace' ? 'replaced' : 'new_version') : 'uploaded',
    document_id: data.id as string,
    file_name: storedName,
    version,
    document_type: type,
    uploaded_at: now,
  };
}

// ---------------------------------------------------------------------------
// 3. Finish
// ---------------------------------------------------------------------------

export interface BatchFileResult {
  file_name: string;
  outcome: 'uploaded' | 'replaced' | 'new_version' | 'skipped' | 'failed' | 'no_match' | 'multiple_match' | 'removed' | 'invalid';
  learner_id?: string | null;
  register_number?: string | null;
  reason?: string | null;
}

export async function finishBatch(service: SupabaseClient, batchId: string, driveId: string, results: BatchFileResult[], actorId: string): Promise<CdcDocumentBatch> {
  const n = (o: BatchFileResult['outcome'][]) => results.filter((r) => o.includes(r.outcome)).length;
  const uploaded = n(['uploaded', 'replaced', 'new_version']);
  const failed = n(['failed']);
  const { data, error } = await service
    .from('cdc_drive_document_batches')
    .update({
      status: failed > 0 ? 'completed_with_errors' : 'completed',
      uploaded,
      failed,
      skipped: n(['skipped', 'removed', 'invalid']),
      results: results.slice(0, 1000),
      completed_at: new Date().toISOString(),
    })
    .eq('id', batchId)
    .eq('drive_id', driveId)
    .select()
    .single();
  if (error) throw error;
  await logActivity(service, [
    { drive_id: driveId, actor_id: actorId, action: 'document_batch_completed', new_value: { batch_id: batchId, batch_code: (data as CdcDocumentBatch).batch_code, uploaded, failed } },
  ]);
  return data as CdcDocumentBatch;
}

export async function listBatches(service: SupabaseClient, driveId: string): Promise<CdcDocumentBatch[]> {
  const { data, error } = await service
    .from('cdc_drive_document_batches')
    .select('id, batch_code, drive_id, document_type, status, total_files, matched, uploaded, failed, no_match, multiple_match, existing_found, skipped, uploaded_by, started_at, completed_at')
    .eq('drive_id', driveId)
    .order('started_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = (data ?? []) as CdcDocumentBatch[];
  const ids = Array.from(new Set(rows.map((r) => r.uploaded_by).filter((v): v is string => !!v)));
  if (ids.length) {
    const { data: profs } = await service.from('profiles').select('id, full_name').in('id', ids);
    const name = new Map((profs ?? []).map((p) => [p.id as string, (p.full_name as string) ?? '']));
    rows.forEach((r) => (r.uploaded_by_name = r.uploaded_by ? name.get(r.uploaded_by) ?? null : null));
  }
  return rows;
}
