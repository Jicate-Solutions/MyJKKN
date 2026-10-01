/**
 * HR intake helper — the server side. SERVER ONLY.
 *
 * The helper prepares, a person decides. createBatch reads a CVViZ export and the
 * resume files, cleans every row, spots duplicates, reads resumes (through the
 * injected ResumeExtractor) and stores ONE proposal per row. decide records what a
 * person chose; when they correct where a CVViZ title goes, that correction
 * becomes a match rule credited to them. apply files the decided rows through the
 * careers path: the resume into the job's Drive folder, and an hr_job_applications
 * row with source 'cvviz_import'. Each row succeeds or fails on its own.
 *
 * TWO CLIENTS, ON PURPOSE.
 *   db    — the caller's own session. Every intake table, every job read and
 *           every rule write goes through it, so RLS decides what this person can
 *           see and change (hr.recruitment.create + institution access).
 *   admin — the service role, for exactly four things: the private 'hr-intake'
 *           bucket (no client storage policy exists), duplicate lookups across
 *           every college (a person who applied at another college is still the
 *           same person), the hr_job_applications insert (its INSERT policy only
 *           admits applicants filing for themselves — the careers path uses the
 *           service role for the same reason), and the rule usage counter.
 *           Every admin WRITE happens only after the session client has shown
 *           that this person can see the batch, the row and the job.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { uploadResumeToJobFolder } from '@/lib/google/drive-upload';
import type {
  ApplyResult,
  DecideRequest,
  IntakeAction,
  IntakeBatch,
  IntakeCandidate,
  IntakeConfidence,
  IntakeDuplicate,
  IntakeDuplicateKind,
  IntakeMatchRule,
  IntakeOpenJob,
  IntakeRow,
  PrepareRequest,
  ResumeExtract,
  ResumeExtractor,
  UploadUrlRequest,
  UploadUrlResponse,
} from '@/types/hr-intake';
import { findSameFileDuplicates } from '@/lib/hr/intake/dedupe';
import { isGeneralPool, normaliseJobTitle, phoneVariants } from '@/lib/hr/intake/normalise';
import { IntakeParseError, parseExport, type ParsedRow } from '@/lib/hr/intake/parse-export';
import { proposeMatch, type MatchJob } from '@/lib/hr/intake/propose-match';
import {
  isZipBytes,
  matchResumeFile,
  safeStorageName,
  sniffResumeMime,
  type UploadedFile,
} from '@/lib/hr/intake/resume-files';
import {
  APPLY_CONCURRENCY,
  EXTRACTION_CONCURRENCY,
  LIMITS_TEXT,
  MAX_EXTRACTIONS_PER_BATCH,
  MAX_RESUME_BYTES,
  MAX_RESUME_FILES,
  UPLOAD_MIME_ALIASES,
  UPLOAD_TYPES,
} from '@/lib/hr/intake/limits';
import { checkResumeSize, expandZip, UploadLimitError } from './expand-upload';
import { chunkIdsForIn, selectInChunks } from '@/lib/utils/postgrest-in-chunks';

export const INTAKE_BUCKET = 'hr-intake';

/** A refusal with the HTTP status the route should answer with. */
export class IntakeError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'IntakeError';
  }
}

export interface IntakeActor {
  id: string;
  name: string | null;
  institution_id: string | null;
}

export interface IntakeDeps {
  db: SupabaseClient;
  admin: SupabaseClient;
  upload: typeof uploadResumeToJobFolder;
  extractor: ResumeExtractor | null;
  now?: () => Date;
  newId?: () => string;
}

export interface SkippedFile {
  file_name: string;
  reason: string;
}

const ACTIONS: IntakeAction[] = ['file_under_job', 'merge_existing', 'needs_new_job', 'skip'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
/** A claim older than this is treated as abandoned (the request died midway). */
const APPLY_CLAIM_TTL_MS = 10 * 60 * 1000;

const nowOf = (deps: IntakeDeps) => (deps.now ? deps.now() : new Date());
const idOf = (deps: IntakeDeps) => (deps.newId ? deps.newId() : crypto.randomUUID());

// ---------------------------------------------------------------------------
// Records <-> contract shapes
// ---------------------------------------------------------------------------

interface BatchRecord {
  id: string;
  source: 'cvviz_export';
  file_name: string;
  institution_id: string | null;
  created_by: string;
  created_by_name: string | null;
  status: IntakeBatch['status'];
  row_count: number;
  skipped_files: SkippedFile[] | null;
  parsed_rows?: ParsedRow[] | null;
  created_at: string;
}

export interface RowRecord {
  id: string;
  batch_id: string;
  row_index: number;
  candidate: IntakeCandidate;
  cvviz_job_title_norm: string | null;
  resume_file_name: string | null;
  resume_matched_upload: boolean;
  resume_storage_path: string | null;
  resume_extract: ResumeExtract | null;
  duplicate_kind: IntakeDuplicateKind;
  duplicate_ref_id: string | null;
  duplicate_note: string | null;
  proposal_action: IntakeAction;
  proposal_job_id: string | null;
  proposal_job_title: string | null;
  proposal_institution_id: string | null;
  proposal_confidence: IntakeConfidence;
  proposal_reasons: string[];
  proposal_rule_id: string | null;
  proposal_rule_author_name: string | null;
  decision_action: IntakeAction | null;
  decision_job_id: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_corrected: boolean;
  apply_claimed_at: string | null;
  application_id: string | null;
  applied_at: string | null;
  apply_error: string | null;
}

interface RuleRecord {
  id: string;
  cvviz_job_title_norm: string;
  job_id: string;
  institution_id: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  times_used: number;
}

/** An open job plus what filing needs. */
interface LoadedJob extends MatchJob {
  job_code: string | null;
}

export function toIntakeRow(r: RowRecord): IntakeRow {
  return {
    id: r.id,
    batch_id: r.batch_id,
    row_index: r.row_index,
    candidate: r.candidate,
    resume: {
      file_name: r.resume_file_name,
      matched_upload: r.resume_matched_upload,
      storage_path: r.resume_storage_path,
      extract: r.resume_extract,
    },
    duplicate: { kind: r.duplicate_kind, ref_id: r.duplicate_ref_id, note: r.duplicate_note },
    proposal: {
      action: r.proposal_action,
      job_id: r.proposal_job_id,
      job_title: r.proposal_job_title,
      institution_id: r.proposal_institution_id,
      confidence: r.proposal_confidence,
      reasons: r.proposal_reasons ?? [],
      rule_id: r.proposal_rule_id,
      rule_author_name: r.proposal_rule_author_name,
    },
    decision: r.decision_action && r.decided_by && r.decided_at
      ? {
          action: r.decision_action,
          job_id: r.decision_job_id,
          decided_by: r.decided_by,
          decided_by_name: r.decided_by_name,
          decided_at: r.decided_at,
          corrected: r.decision_corrected,
        }
      : null,
    applied: r.applied_at
      ? { application_id: r.application_id ?? null, applied_at: r.applied_at, error: r.apply_error ?? null }
      : null,
  };
}

function toIntakeBatch(b: BatchRecord, decided: number, applied: number): IntakeBatch {
  return {
    id: b.id,
    source: b.source,
    file_name: b.file_name,
    created_by: b.created_by,
    created_by_name: b.created_by_name,
    created_at: b.created_at,
    status: b.status,
    row_count: b.row_count,
    decided_count: decided,
    applied_count: applied,
  };
}

const toOpenJob = (j: MatchJob): IntakeOpenJob => ({
  id: j.id,
  title: j.title,
  institution_id: j.institution_id,
  institution_name: j.institution_name,
  department_name: j.department_name,
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const BATCH_COLUMNS = 'id, source, file_name, institution_id, created_by, created_by_name, status, row_count, skipped_files, created_at';

function dbFail(what: string, error: unknown): IntakeError {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? 'unknown error';
  if (code === '42501') return new IntakeError(`You do not have access to ${what}.`, 403);
  return new IntakeError(`Could not ${what}: ${message}`, 500);
}

/** Open jobs this person can see (RLS on hr_recruitment_jobs), still accepting applications. */
async function loadOpenJobs(deps: IntakeDeps): Promise<LoadedJob[]> {
  const { data, error } = await deps.db
    .from('hr_recruitment_jobs')
    .select('id, title, job_code, institution_id, requirements, closes_at, institution:institutions(name), department:departments(department_name)')
    .eq('status', 'open')
    .order('title', { ascending: true })
    .limit(2000);
  if (error) throw dbFail('read the open jobs', error);
  const now = nowOf(deps).getTime();
  return ((data ?? []) as Record<string, unknown>[])
    .filter((r) => !r.closes_at || Date.parse(String(r.closes_at)) > now)
    .map((r) => {
      const inst = r.institution as { name?: string } | null;
      const dept = r.department as { department_name?: string } | null;
      const req = (r.requirements ?? {}) as { qualifications?: unknown };
      return {
        id: String(r.id),
        title: String(r.title ?? ''),
        job_code: (r.job_code as string | null) ?? null,
        institution_id: (r.institution_id as string | null) ?? null,
        institution_name: inst?.name ?? null,
        department_name: dept?.department_name ?? null,
        qualifications: Array.isArray(req.qualifications)
          ? req.qualifications.filter((q): q is string => typeof q === 'string')
          : [],
      };
    });
}

async function loadRules(deps: IntakeDeps): Promise<RuleRecord[]> {
  const { data, error } = await deps.db
    .from('hr_intake_match_rules')
    .select('id, cvviz_job_title_norm, job_id, institution_id, created_by, created_by_name, created_at, times_used')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw dbFail('read the match rules', error);
  return (data ?? []) as RuleRecord[];
}

const ruleToContract = (r: RuleRecord, jobTitle: string | null): IntakeMatchRule => ({
  id: r.id,
  cvviz_job_title_norm: r.cvviz_job_title_norm,
  job_id: r.job_id,
  job_title: jobTitle,
  created_by: r.created_by,
  created_by_name: r.created_by_name,
  created_at: r.created_at,
  times_used: r.times_used,
});

async function loadBatchRecord(deps: IntakeDeps, batchId: string, withParsedRows = false): Promise<BatchRecord> {
  if (!isUuid(batchId)) throw new IntakeError('Batch not found, or you do not have access to it.', 404);
  const { data, error } = await deps.db
    .from('hr_intake_batches')
    .select(withParsedRows ? `${BATCH_COLUMNS}, parsed_rows` : BATCH_COLUMNS)
    .eq('id', batchId)
    .maybeSingle();
  if (error) throw dbFail('read the batch', error);
  if (!data) throw new IntakeError('Batch not found, or you do not have access to it.', 404);
  return data as unknown as BatchRecord;
}

async function loadRows(deps: IntakeDeps, batchId: string): Promise<RowRecord[]> {
  const { data, error } = await deps.db
    .from('hr_intake_rows')
    .select('*')
    .eq('batch_id', batchId)
    .order('row_index', { ascending: true })
    .limit(5000);
  if (error) throw dbFail('read the batch rows', error);
  return (data ?? []) as RowRecord[];
}

const countDecided = (rows: Pick<RowRecord, 'decided_at'>[]) => rows.filter((r) => r.decided_at).length;
const countApplied = (rows: Pick<RowRecord, 'application_id'>[]) => rows.filter((r) => r.application_id).length;

export async function listBatches(deps: IntakeDeps): Promise<IntakeBatch[]> {
  const { data, error } = await deps.db
    .from('hr_intake_batches')
    .select(BATCH_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw dbFail('read the batches', error);
  const batches = (data ?? []) as BatchRecord[];
  const rows = await selectInChunks<{ batch_id: string; decided_at: string | null; application_id: string | null }>(
    batches.map((b) => b.id),
    (chunk) => deps.db.from('hr_intake_rows').select('batch_id, decided_at, application_id').in('batch_id', chunk),
  ).catch((e) => {
    throw dbFail('count the decided rows', e);
  });
  return batches.map((b) => {
    const mine = rows.filter((r) => r.batch_id === b.id);
    return toIntakeBatch(b, countDecided(mine), countApplied(mine));
  });
}

export async function getBatch(
  deps: IntakeDeps,
  batchId: string,
): Promise<{ batch: IntakeBatch; rows: IntakeRow[]; open_jobs: IntakeOpenJob[]; skipped_files: SkippedFile[] }> {
  const batch = await loadBatchRecord(deps, batchId);
  const [rows, jobs] = await Promise.all([loadRows(deps, batchId), loadOpenJobs(deps)]);
  return {
    batch: toIntakeBatch(batch, countDecided(rows), countApplied(rows)),
    rows: rows.map(toIntakeRow),
    open_jobs: jobs.map(toOpenJob),
    skipped_files: batch.skipped_files ?? [],
  };
}

// ---------------------------------------------------------------------------
// Duplicates already in MyJKKN (service role: across every college)
// ---------------------------------------------------------------------------

/** Characters that would break a PostgREST or() filter or act as a wildcard there. */
const UNSAFE_FOR_OR = /[*(),"\\]/;

export async function findExistingRecords(
  admin: SupabaseClient,
  people: { key: number; email: string | null; phone: string | null }[],
): Promise<Map<number, IntakeDuplicate>> {
  const emails = [...new Set(people.map((p) => p.email).filter((e): e is string => !!e))];
  const phones = [...new Set(people.map((p) => p.phone).filter((p): p is string => !!p))];

  // Both application write paths lower-case the email, so equality is exact.
  const apps = await selectInChunks<{ id: string; email: string }>(emails, (chunk) =>
    admin.from('hr_job_applications').select('id, email').in('email', chunk));

  // Candidate emails were typed by people in any case: match without case,
  // then keep only exact (lower-cased) matches, because "_" and "%" are LIKE
  // wildcards and would otherwise match other addresses.
  const candByEmail: { id: string; email: string | null }[] = [];
  const ilikeable = emails.filter((e) => !UNSAFE_FOR_OR.test(e));
  for (const chunk of chunkIdsForIn(ilikeable, 40)) {
    const { data, error } = await admin
      .from('hr_recruitment_candidates')
      .select('id, email')
      .or(chunk.map((e) => `email.ilike.${e}`).join(','));
    if (error) throw error;
    candByEmail.push(...((data ?? []) as { id: string; email: string | null }[]));
  }
  const variants = phones.flatMap(phoneVariants);
  const candByPhone = await selectInChunks<{ id: string; phone: string | null }>(variants, (chunk) =>
    admin.from('hr_recruitment_candidates').select('id, phone').in('phone', chunk));

  const appByEmail = new Map(apps.map((a) => [a.email.toLowerCase(), a.id]));
  const candEmail = new Map<string, string>();
  for (const c of candByEmail) if (c.email) candEmail.set(c.email.trim().toLowerCase(), c.id);
  const candPhone = new Map<string, string>();
  for (const c of candByPhone) {
    const digits = (c.phone ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    if (digits.length === 10) candPhone.set(digits, c.id);
  }

  const out = new Map<number, IntakeDuplicate>();
  for (const p of people) {
    const app = p.email ? appByEmail.get(p.email) : undefined;
    if (app) {
      out.set(p.key, { kind: 'existing_application', ref_id: app, note: 'Already applied in MyJKKN (same email)' });
      continue;
    }
    const byEmail = p.email ? candEmail.get(p.email) : undefined;
    const byPhone = p.phone ? candPhone.get(p.phone) : undefined;
    if (byEmail || byPhone) {
      out.set(p.key, {
        kind: 'existing_candidate',
        ref_id: (byEmail ?? byPhone) as string,
        note: `Already a candidate in MyJKKN (same ${byEmail ? 'email' : 'phone number'})`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// createBatch -> createUploadUrls -> prepareBatch
// ---------------------------------------------------------------------------
// Vercel caps a request body near 4.5 MB, so resumes never pass through a
// route: the export is posted (parsed at once and held on the batch), each
// resume goes straight to the private bucket through a signed upload URL, and
// prepare then pairs, reads and proposes.

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function createBatch(
  deps: IntakeDeps,
  actor: IntakeActor,
  exportFile: UploadedFile,
): Promise<{ batch: IntakeBatch }> {
  let parsed: ParsedRow[];
  try {
    parsed = parseExport(exportFile.name, exportFile.bytes);
  } catch (e) {
    if (e instanceof IntakeParseError) throw new IntakeError(e.message, 400);
    throw e;
  }
  const { data, error } = await deps.db
    .from('hr_intake_batches')
    .insert({
      id: idOf(deps),
      source: 'cvviz_export',
      file_name: exportFile.name.slice(0, 255),
      institution_id: actor.institution_id,
      created_by: actor.id,
      created_by_name: actor.name,
      status: 'preparing',
      row_count: parsed.length,
      parsed_rows: parsed,
    })
    .select(BATCH_COLUMNS)
    .single();
  if (error || !data) throw dbFail('start the batch', error);
  return { batch: toIntakeBatch(data as BatchRecord, 0, 0) };
}

const ALLOWED_UPLOAD_MIMES = new Set(Object.values(UPLOAD_TYPES));

/** The content type a file may be uploaded with, or null when it is not a resume type. */
export function resolveUploadType(name: string, type: string | null | undefined): string | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const raw = (type ?? '').toLowerCase().trim();
  const given = UPLOAD_MIME_ALIASES[raw] ?? raw;
  if (ALLOWED_UPLOAD_MIMES.has(given)) return given;
  if (given === '' || given === 'application/octet-stream') return UPLOAD_TYPES[ext] ?? null;
  return null;
}

function uniquePath(batchId: string, name: string, taken: Set<string>): string {
  const safe = safeStorageName(name);
  const dot = safe.lastIndexOf('.');
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : '';
  let candidate = `${batchId}/${safe}`;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${batchId}/${stem}-${n}${ext}`;
  taken.add(candidate);
  return candidate;
}

export async function createUploadUrls(
  deps: IntakeDeps,
  batchId: string,
  body: Partial<UploadUrlRequest> | null,
): Promise<UploadUrlResponse> {
  const batch = await loadBatchRecord(deps, batchId);
  if (batch.status !== 'preparing') {
    throw new IntakeError('Resumes can only be added before the batch is prepared.', 409);
  }
  const files = body?.files;
  if (!Array.isArray(files) || files.length === 0) throw new IntakeError('files must list at least one file.', 400);
  if (files.length > MAX_RESUME_FILES) {
    throw new IntakeError(`At most ${LIMITS_TEXT.files} files at a time.`, 400);
  }
  const checked = files.map((f) => {
    const name = typeof f?.name === 'string' ? f.name.trim() : '';
    if (!name) throw new IntakeError('Every file needs a name.', 400);
    const size = Number(f?.size);
    if (!Number.isFinite(size) || size <= 0) throw new IntakeError(`"${name}" is empty.`, 400);
    if (size > MAX_RESUME_BYTES) {
      throw new IntakeError(`"${name}" is larger than ${LIMITS_TEXT.resume}. Each file must be ${LIMITS_TEXT.resume} or smaller.`, 413);
    }
    const contentType = resolveUploadType(name, f?.type);
    if (!contentType) throw new IntakeError(`"${name}" is not a PDF, Word, JPG, PNG or ZIP file.`, 400);
    return { name, contentType };
  });

  const { data: present, error: listErr } = await deps.admin.storage.from(INTAKE_BUCKET).list(batchId, { limit: 1000 });
  if (listErr) throw new IntakeError(`Could not check the files already uploaded: ${listErr.message}`, 500);
  const presentPaths = new Set((present ?? []).map((o) => `${batchId}/${o.name}`));
  const taken = new Set<string>();
  const planned = checked.map((f) => ({ ...f, path: uniquePath(batchId, f.name, taken) }));
  const newCount = planned.filter((p) => !presentPaths.has(p.path)).length;
  if (presentPaths.size + newCount > MAX_RESUME_FILES) {
    throw new IntakeError(`A batch takes at most ${LIMITS_TEXT.files} files; ${presentPaths.size} are already uploaded.`, 400);
  }

  const uploads: UploadUrlResponse['uploads'] = [];
  for (const p of planned) {
    // upsert: uploading the same file name again replaces it rather than failing.
    const { data, error } = await deps.admin.storage.from(INTAKE_BUCKET).createSignedUploadUrl(p.path, { upsert: true });
    if (error || !data) throw new IntakeError(`Could not prepare the upload for "${p.name}": ${error?.message ?? 'no URL returned'}`, 500);
    uploads.push({ name: p.name, path: data.path ?? p.path, signed_url: data.signedUrl, token: data.token, content_type: p.contentType });
  }
  return { uploads };
}

interface StoredResume {
  name: string;
  bytes: Uint8Array;
  path: string;
  mime: string;
}

/** Read every uploaded file back from storage, expanding zips, enforcing the limits. */
async function collectUploads(
  deps: IntakeDeps,
  batchId: string,
  uploaded: { name: string; path: string }[],
): Promise<{ files: StoredResume[]; skipped: SkippedFile[]; zipPaths: string[]; junkPaths: string[] }> {
  const files: StoredResume[] = [];
  const skipped: SkippedFile[] = [];
  const zipPaths: string[] = [];
  const junkPaths: string[] = [];
  let zipCount = 0;
  for (const u of uploaded) {
    const { data: blob, error } = await deps.admin.storage.from(INTAKE_BUCKET).download(u.path);
    if (error || !blob) {
      throw new IntakeError(`"${u.name}" was not uploaded, or its upload did not finish. Upload it again.`, 400);
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    checkResumeSize(u.name, bytes.byteLength);
    const mime = sniffResumeMime(bytes);
    if (mime) {
      files.push({ name: u.name, bytes, path: u.path, mime });
    } else if (isZipBytes(bytes)) {
      zipPaths.push(u.path);
      zipCount += 1;
      const inner = await expandZip(u.name, bytes, MAX_RESUME_FILES - files.length);
      let k = 0;
      for (const f of inner) {
        const innerMime = sniffResumeMime(f.bytes);
        if (!innerMime) {
          skipped.push({ file_name: f.name, reason: 'Not a PDF, Word or image file' });
          continue;
        }
        k += 1;
        const path = `${batchId}/zip${zipCount}-${k}-${safeStorageName(f.name)}`;
        const { error: upErr } = await deps.admin.storage
          .from(INTAKE_BUCKET)
          .upload(path, f.bytes, { contentType: innerMime, upsert: true });
        if (upErr) throw new IntakeError(`Could not store "${f.name}" from "${u.name}": ${upErr.message}`, 500);
        files.push({ name: f.name, bytes: f.bytes, path, mime: innerMime });
      }
    } else {
      skipped.push({ file_name: u.name, reason: 'Not a PDF, Word or image file' });
      junkPaths.push(u.path);
    }
    if (files.length > MAX_RESUME_FILES) {
      throw new UploadLimitError(`More than ${LIMITS_TEXT.files} resume files. Upload at most ${LIMITS_TEXT.files} at a time.`);
    }
  }
  return { files, skipped, zipPaths, junkPaths };
}

export async function prepareBatch(
  deps: IntakeDeps,
  _actor: IntakeActor,
  batchId: string,
  body: Partial<PrepareRequest> | null,
): Promise<{ batch: IntakeBatch; rows: IntakeRow[] }> {
  const batch = await loadBatchRecord(deps, batchId, true);
  if (batch.status !== 'preparing') {
    // Already prepared: calling again returns the same batch and rows.
    const rows = await loadRows(deps, batchId);
    return { batch: toIntakeBatch(batch, countDecided(rows), countApplied(rows)), rows: rows.map(toIntakeRow) };
  }

  const raw = body?.uploaded ?? [];
  if (!Array.isArray(raw)) throw new IntakeError('uploaded must be a list of { name, path }.', 400);
  const seenPaths = new Set<string>();
  const uploaded: { name: string; path: string }[] = [];
  for (const u of raw) {
    const name = typeof u?.name === 'string' ? u.name.trim() : '';
    const path = typeof u?.path === 'string' ? u.path.trim() : '';
    if (!name || !path) throw new IntakeError('Every uploaded file needs its name and path.', 400);
    if (!path.startsWith(`${batchId}/`) || path.includes('..') || path.slice(batchId.length + 1).includes('/')) {
      throw new IntakeError(`"${name}" was not uploaded to this batch.`, 400);
    }
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);
    uploaded.push({ name, path });
  }
  if (uploaded.length > MAX_RESUME_FILES) throw new IntakeError(`At most ${LIMITS_TEXT.files} files in a batch.`, 400);

  const parsed = Array.isArray(batch.parsed_rows) ? batch.parsed_rows : null;
  if (!parsed) throw new IntakeError('The export rows of this batch are missing. Upload the export again.', 409);

  // Claim the batch so two prepare calls cannot run at once.
  const now = nowOf(deps);
  const stale = new Date(now.getTime() - APPLY_CLAIM_TTL_MS).toISOString();
  const { data: claimed, error: claimErr } = await deps.db
    .from('hr_intake_batches')
    .update({ prepare_claimed_at: now.toISOString() })
    .eq('id', batchId)
    .eq('status', 'preparing')
    .or(`prepare_claimed_at.is.null,prepare_claimed_at.lt.${stale}`)
    .select('id');
  if (claimErr) throw dbFail('start preparing the batch', claimErr);
  if (!claimed || claimed.length === 0) {
    throw new IntakeError('This batch is already being prepared. Try again in a minute.', 409);
  }

  try {
    const { files, skipped, zipPaths, junkPaths } = await collectUploads(deps, batchId, uploaded);

    // --- pair each row with its resume ---
    const pairing = new Map<number, StoredResume | null>();
    const used = new Set<StoredResume>();
    for (const row of parsed) {
      const hit = matchResumeFile(row.file_name, files);
      pairing.set(row.row_index, hit);
      if (hit) used.add(hit);
    }
    const unusedPaths: string[] = [];
    for (const f of files) {
      if (!used.has(f)) {
        skipped.push({ file_name: f.name, reason: 'No row in the export names this file' });
        unusedPaths.push(f.path);
      }
    }

    // --- what the helper compares against ---
    const [jobs, rules] = await Promise.all([loadOpenJobs(deps), loadRules(deps)]);

    // --- duplicates: earlier in this file, then already in MyJKKN ---
    const sameFile = findSameFileDuplicates(parsed);
    const existing = await findExistingRecords(
      deps.admin,
      parsed
        .filter((r) => !sameFile.has(r.row_index))
        .map((r) => ({ key: r.row_index, email: r.candidate.email, phone: r.candidate.phone })),
    ).catch((e) => {
      throw dbFail('check MyJKKN for the same people', e);
    });

    // --- read resumes: only rows that may be filed, each file once, capped ---
    const toRead: StoredResume[] = [];
    const overCap = new Set<StoredResume>();
    for (const row of parsed) {
      if (sameFile.has(row.row_index) || existing.has(row.row_index)) continue;
      const s = pairing.get(row.row_index);
      if (!s || toRead.includes(s) || overCap.has(s)) continue;
      if (toRead.length < MAX_EXTRACTIONS_PER_BATCH) toRead.push(s);
      else overCap.add(s);
    }
    const extracts = new Map<StoredResume, ResumeExtract | 'unreadable' | null>();
    if (deps.extractor) {
      const extractor = deps.extractor;
      const results = await mapLimit(toRead, EXTRACTION_CONCURRENCY, async (s) => {
        try {
          return await extractor({ fileName: s.name, bytes: s.bytes, mimeType: s.mime });
        } catch (e) {
          console.warn('[hr/intake] resume extraction did not complete', { path: s.path, message: (e as Error)?.message });
          return 'unreadable' as const;
        }
      });
      toRead.forEach((s, i) => extracts.set(s, results[i] ?? null));
    }

    // --- one proposal per row ---
    const ids = new Map(parsed.map((r) => [r.row_index, idOf(deps)]));
    const byIndex = new Map(parsed.map((r) => [r.row_index, r]));
    const ruleUse = new Map<string, number>();
    const rulesForMatch: IntakeMatchRule[] = rules.map((r) => ruleToContract(r, null));
    const records = parsed.map((row) => {
      const s = pairing.get(row.row_index) ?? null;
      const read = s ? extracts.get(s) : undefined;
      const extract = read && read !== 'unreadable' ? read : null;
      const extra: string[] = [];
      if (row.file_name && !s) extra.push('Resume file was not in the upload');
      if (s && overCap.has(s) && deps.extractor) extra.push(`Resume not read: this batch already had ${MAX_EXTRACTIONS_PER_BATCH} read`);
      if (read === 'unreadable') extra.push('Could not read the resume');

      const same = sameFile.get(row.row_index);
      const duplicate: IntakeDuplicate = same
        ? { kind: 'same_file', ref_id: ids.get(same.ref_row_index) ?? null, note: same.note }
        : existing.get(row.row_index) ?? { kind: 'none', ref_id: null, note: null };

      const proposal = proposeMatch({
        candidate: row.candidate,
        extract,
        resume_file_name: s?.name ?? row.file_name,
        duplicate,
        duplicate_of_job_title: same ? byIndex.get(same.ref_row_index)?.candidate.cvviz_job_title ?? null : null,
        duplicate_of_row_index: same?.ref_row_index ?? null,
        openJobs: jobs,
        rules: rulesForMatch,
        extra_reasons: extra,
      });
      if (proposal.rule_id) ruleUse.set(proposal.rule_id, (ruleUse.get(proposal.rule_id) ?? 0) + 1);

      return {
        id: ids.get(row.row_index)!,
        batch_id: batchId,
        row_index: row.row_index,
        candidate: row.candidate,
        cvviz_job_title_norm: normaliseJobTitle(row.candidate.cvviz_job_title ?? '') || null,
        resume_file_name: s?.name ?? row.file_name,
        resume_matched_upload: !!s,
        resume_storage_path: s?.path ?? null,
        resume_extract: extract,
        duplicate_kind: duplicate.kind,
        duplicate_ref_id: duplicate.ref_id,
        duplicate_note: duplicate.note,
        proposal_action: proposal.action,
        proposal_job_id: proposal.job_id,
        proposal_job_title: proposal.job_title,
        proposal_institution_id: proposal.institution_id,
        proposal_confidence: proposal.confidence,
        proposal_reasons: proposal.reasons,
        proposal_rule_id: proposal.rule_id,
        proposal_rule_author_name: proposal.rule_author_name,
      };
    });

    // A previous attempt that broke halfway may have left rows: start clean.
    const { error: clearErr } = await deps.db.from('hr_intake_rows').delete().eq('batch_id', batchId);
    if (clearErr) throw dbFail('clear an earlier attempt', clearErr);
    // Earliest rows first, so a same-file pointer always names a row already written.
    for (const chunk of chunkIdsForIn(records, 100)) {
      const { error } = await deps.db.from('hr_intake_rows').insert(chunk);
      if (error) throw dbFail('save the batch rows', error);
    }

    const { data: ready, error: readyErr } = await deps.db
      .from('hr_intake_batches')
      .update({ status: 'ready', skipped_files: skipped, parsed_rows: null, prepare_claimed_at: null })
      .eq('id', batchId)
      .select(BATCH_COLUMNS)
      .single();
    if (readyErr || !ready) throw dbFail('finish preparing the batch', readyErr);

    // The zips (now expanded), and files no row uses, are not kept.
    const drop = [...zipPaths, ...junkPaths, ...unusedPaths];
    if (drop.length > 0) {
      const { error } = await deps.admin.storage.from(INTAKE_BUCKET).remove(drop);
      if (error) console.warn('[hr/intake] unused uploads not removed', { batchId, message: error.message });
    }
    await recordRuleUse(deps, ruleUse);

    const rows = await loadRows(deps, batchId);
    return { batch: toIntakeBatch(ready as BatchRecord, 0, 0), rows: rows.map(toIntakeRow) };
  } catch (e) {
    // Leave the batch preparable again: no half-written rows, claim released.
    await deps.db.from('hr_intake_rows').delete().eq('batch_id', batchId);
    await deps.db.from('hr_intake_batches').update({ prepare_claimed_at: null }).eq('id', batchId);
    throw e;
  }
}

/** times_used counts proposals a rule shaped. A counter, so the service role writes it. */
async function recordRuleUse(deps: IntakeDeps, use: Map<string, number>): Promise<void> {
  const at = nowOf(deps).toISOString();
  for (const [id, n] of use) {
    const { data, error } = await deps.admin.from('hr_intake_match_rules').select('times_used').eq('id', id).maybeSingle();
    if (error || !data) {
      console.warn('[hr/intake] rule usage not recorded', { id, message: error?.message });
      continue;
    }
    const { error: upErr } = await deps.admin
      .from('hr_intake_match_rules')
      .update({ times_used: Number((data as { times_used: number }).times_used ?? 0) + n, last_used_at: at })
      .eq('id', id);
    if (upErr) console.warn('[hr/intake] rule usage not recorded', { id, message: upErr.message });
  }
}

// ---------------------------------------------------------------------------
// decide / acceptHigh
// ---------------------------------------------------------------------------

async function loadRow(deps: IntakeDeps, rowId: string): Promise<RowRecord> {
  if (!isUuid(rowId)) throw new IntakeError('Row not found, or you do not have access to it.', 404);
  const { data, error } = await deps.db.from('hr_intake_rows').select('*').eq('id', rowId).maybeSingle();
  if (error) throw dbFail('read the row', error);
  if (!data) throw new IntakeError('Row not found, or you do not have access to it.', 404);
  return data as RowRecord;
}

/** True when deciding `action`/`jobId` on a row with this proposal teaches a rule. */
export function correctionTeachesRule(
  proposal: Pick<RowRecord, 'proposal_action' | 'proposal_job_id'>,
  action: IntakeAction,
  jobId: string | null,
  cvvizJobTitle: string | null,
): boolean {
  if (action !== 'file_under_job' || !jobId) return false;
  if (isGeneralPool(cvvizJobTitle)) return false;
  if (proposal.proposal_action === 'needs_new_job') return true;
  return proposal.proposal_action === 'file_under_job' && proposal.proposal_job_id !== jobId;
}

/**
 * One rule per normalised title within what this person can see: a correction
 * replaces the rule they can see (moving it to the new job and crediting them)
 * and retires any other visible rule for the same title. Writes go through the
 * session client, so RLS refuses a rule for a job outside the person's colleges.
 */
export async function learnRule(
  deps: IntakeDeps,
  actor: IntakeActor,
  norm: string,
  job: Pick<MatchJob, 'id' | 'title' | 'institution_id'>,
): Promise<IntakeMatchRule> {
  const { data: visible, error } = await deps.db
    .from('hr_intake_match_rules')
    .select('id, institution_id')
    .eq('cvviz_job_title_norm', norm);
  if (error) throw dbFail('read the match rules', error);
  const list = (visible ?? []) as { id: string; institution_id: string | null }[];
  const keep = list.find((r) => r.institution_id === job.institution_id) ?? list[0];
  const fields = {
    cvviz_job_title_norm: norm,
    job_id: job.id,
    institution_id: job.institution_id,
    created_by: actor.id,
    created_by_name: actor.name,
    times_used: 0,
    last_used_at: null,
  };
  const others = list.filter((r) => r !== keep).map((r) => r.id);
  if (others.length > 0) {
    const { error: delErr } = await deps.db.from('hr_intake_match_rules').delete().in('id', others);
    if (delErr) throw dbFail('replace the older match rule', delErr);
  }
  const query = keep
    ? deps.db.from('hr_intake_match_rules').update(fields).eq('id', keep.id)
    : deps.db.from('hr_intake_match_rules').insert(fields);
  const { data: saved, error: saveErr } = await query
    .select('id, cvviz_job_title_norm, job_id, institution_id, created_by, created_by_name, created_at, times_used')
    .single();
  if (saveErr) throw dbFail('save the match rule', saveErr);
  return ruleToContract(saved as RuleRecord, job.title);
}

export async function decide(
  deps: IntakeDeps,
  actor: IntakeActor,
  rowId: string,
  body: Partial<DecideRequest> | null,
): Promise<{ row: IntakeRow; rule: IntakeMatchRule | null; rule_error: string | null }> {
  const action = body?.action;
  if (!action || !ACTIONS.includes(action)) {
    throw new IntakeError(`action must be one of: ${ACTIONS.join(', ')}`, 400);
  }
  const jobId = action === 'file_under_job' ? body?.job_id ?? null : null;
  if (action === 'file_under_job' && !isUuid(jobId)) {
    throw new IntakeError('Pick the job to file this candidate under.', 400);
  }

  const row = await loadRow(deps, rowId);
  const batch = await loadBatchRecord(deps, row.batch_id);
  if (batch.status === 'closed') throw new IntakeError('This batch is closed.', 409);
  if (row.application_id) throw new IntakeError('Already filed in MyJKKN; it cannot be changed here.', 409);

  let job: LoadedJob | undefined;
  if (action === 'file_under_job') {
    job = (await loadOpenJobs(deps)).find((j) => j.id === jobId);
    if (!job) throw new IntakeError('That job is not open, or you do not have access to it.', 400);
  }

  const corrected = action !== row.proposal_action || (action === 'file_under_job' && jobId !== row.proposal_job_id);
  const { data, error } = await deps.db
    .from('hr_intake_rows')
    .update({
      decision_action: action,
      decision_job_id: jobId,
      decided_by: actor.id,
      decided_by_name: actor.name,
      decided_at: nowOf(deps).toISOString(),
      decision_corrected: corrected,
      applied_at: null,
      apply_error: null,
    })
    .eq('id', row.id)
    .is('application_id', null)
    .select('*')
    .maybeSingle();
  if (error) throw dbFail('save the decision', error);
  if (!data) throw new IntakeError('Already filed in MyJKKN; it cannot be changed here.', 409);

  let rule: IntakeMatchRule | null = null;
  let ruleError: string | null = null;
  const norm = row.cvviz_job_title_norm ?? normaliseJobTitle(row.candidate.cvviz_job_title ?? '');
  if (job && norm && correctionTeachesRule(row, action, jobId, row.candidate.cvviz_job_title)) {
    try {
      rule = await learnRule(deps, actor, norm, job);
    } catch (e) {
      // The decision stands; the card says the lesson was not kept.
      ruleError = e instanceof Error ? e.message : 'The match rule could not be saved.';
      console.error('[hr/intake] match rule not saved', { rowId, message: ruleError });
    }
  }
  return { row: toIntakeRow(data as RowRecord), rule, rule_error: ruleError };
}

export async function acceptHigh(deps: IntakeDeps, actor: IntakeActor, batchId: string): Promise<{ decided: number }> {
  const batch = await loadBatchRecord(deps, batchId);
  if (batch.status === 'closed') throw new IntakeError('This batch is closed.', 409);
  const rows = (await loadRows(deps, batchId)).filter(
    (r) => !r.decision_action && !r.application_id && r.proposal_confidence === 'high',
  );
  if (rows.length === 0) return { decided: 0 };

  const needsJob = rows.some((r) => r.proposal_action === 'file_under_job');
  const open = needsJob ? new Set((await loadOpenJobs(deps)).map((j) => j.id)) : new Set<string>();
  const groups = new Map<string, { action: IntakeAction; jobId: string | null; ids: string[] }>();
  for (const r of rows) {
    if (r.proposal_action === 'file_under_job' && (!r.proposal_job_id || !open.has(r.proposal_job_id))) continue;
    const key = `${r.proposal_action}|${r.proposal_job_id ?? ''}`;
    const g = groups.get(key) ?? { action: r.proposal_action, jobId: r.proposal_job_id, ids: [] };
    g.ids.push(r.id);
    groups.set(key, g);
  }

  const at = nowOf(deps).toISOString();
  let decided = 0;
  for (const g of groups.values()) {
    for (const chunk of chunkIdsForIn(g.ids, 100)) {
      const { data, error } = await deps.db
        .from('hr_intake_rows')
        .update({
          decision_action: g.action,
          decision_job_id: g.action === 'file_under_job' ? g.jobId : null,
          decided_by: actor.id,
          decided_by_name: actor.name,
          decided_at: at,
          decision_corrected: false,
        })
        .in('id', chunk)
        .is('decision_action', null)
        .select('id');
      if (error) throw dbFail('save the decisions', error);
      decided += (data ?? []).length;
    }
  }
  return { decided };
}

// ---------------------------------------------------------------------------
// apply — file decided rows through the careers path
// ---------------------------------------------------------------------------

async function existingApplicationId(admin: SupabaseClient, jobId: string, email: string): Promise<string | null> {
  const { data, error } = await admin
    .from('hr_job_applications')
    .select('id')
    .eq('job_id', jobId)
    .eq('email', email.toLowerCase())
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as { id: string } | undefined)?.id ?? null;
}

async function fileOne(deps: IntakeDeps, row: RowRecord, job: LoadedJob | undefined): Promise<ApplyResult> {
  const fail = async (message: string): Promise<ApplyResult> => {
    await deps.db
      .from('hr_intake_rows')
      .update({ apply_error: message, applied_at: nowOf(deps).toISOString(), apply_claimed_at: null })
      .eq('id', row.id)
      .is('application_id', null);
    return { row_id: row.id, ok: false, application_id: null, error: message };
  };
  const done = async (applicationId: string): Promise<ApplyResult> => {
    const { error } = await deps.db
      .from('hr_intake_rows')
      .update({ application_id: applicationId, applied_at: nowOf(deps).toISOString(), apply_error: null, apply_claimed_at: null })
      .eq('id', row.id);
    if (error) {
      // Filed, but the card could not be marked. Say so: a re-run finds the
      // application by email and marks the card then, without filing twice.
      return { row_id: row.id, ok: true, application_id: applicationId, error: `Filed, but the card was not updated: ${error.message}` };
    }
    return { row_id: row.id, ok: true, application_id: applicationId, error: null };
  };

  const c = row.candidate;
  if (!job) return fail('The job is no longer open, or you do not have access to it');
  if (!c.email) return fail('No email address in the export, so it cannot be filed');
  if (!c.phone) return fail(`No usable phone number (${c.phone_issue ?? 'missing'})`);
  if (!row.resume_storage_path) return fail('No resume file was uploaded for this row');

  try {
    const already = await existingApplicationId(deps.admin, job.id, c.email);
    if (already) return done(already);

    // Claim the row so a second, concurrent apply cannot file it again.
    const now = nowOf(deps);
    const stale = new Date(now.getTime() - APPLY_CLAIM_TTL_MS).toISOString();
    const { data: claimed, error: claimErr } = await deps.db
      .from('hr_intake_rows')
      .update({ apply_claimed_at: now.toISOString() })
      .eq('id', row.id)
      .is('application_id', null)
      .or(`apply_claimed_at.is.null,apply_claimed_at.lt.${stale}`)
      .select('id');
    if (claimErr) return fail(`Could not start filing: ${claimErr.message}`);
    if (!claimed || claimed.length === 0) {
      return { row_id: row.id, ok: false, application_id: null, error: 'Already being filed by another request' };
    }

    const { data: blob, error: dlErr } = await deps.admin.storage.from(INTAKE_BUCKET).download(row.resume_storage_path);
    if (dlErr || !blob) return fail(`Could not open the stored resume: ${dlErr?.message ?? 'missing'}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mime = sniffResumeMime(bytes) ?? 'application/octet-stream';
    const file = new File([bytes], row.resume_file_name ?? 'resume', { type: mime });

    const uploaded = await deps.upload({ jobTitle: job.title, jobCode: job.job_code, jobId: job.id, file });

    const extract = row.resume_extract;
    const { data: inserted, error: insErr } = await deps.admin
      .from('hr_job_applications')
      .insert({
        job_id: job.id,
        institution_id: job.institution_id,
        first_name: c.first_name || '-',
        last_name: c.last_name,
        email: c.email.toLowerCase(),
        phone: c.phone,
        current_job_title: c.current_job_title ?? extract?.current_role ?? null,
        current_company: c.current_company,
        current_job_duration_months: null,
        experience_months: extract?.experience_years != null ? Math.max(0, Math.round(extract.experience_years * 12)) : 0,
        qualification: c.qualification ?? extract?.qualification ?? 'Not stated',
        worked_cities: c.cities,
        resume_url: uploaded.url,
        resume_filename: file.name,
        resume_size_bytes: bytes.byteLength,
        drive_file_id: uploaded.driveFileId,
        status: 'pending',
        applicant_user_id: null,
        source: 'cvviz_import',
        consent_at: null,
        cvviz_profile_url: c.cvviz_profile_url,
        submitted_at: c.applied_at ?? nowOf(deps).toISOString(),
      })
      .select('id')
      .single();
    if (insErr || !inserted) {
      // Same choice as the careers path: an insert error may still have
      // committed, so the Drive file is kept rather than deleted.
      console.error('[hr/intake] application insert did not complete; Drive file kept', {
        driveFileId: uploaded.driveFileId, jobId: job.id, code: (insErr as { code?: string } | null)?.code,
      });
      return fail(`Could not save the application: ${insErr?.message ?? 'no row returned'}`);
    }
    return done(String((inserted as { id: string }).id));
  } catch (e) {
    return fail(`Could not file: ${e instanceof Error ? e.message : 'unknown error'}`);
  }
}

/** Close the batch once every row is decided and every filing row is filed; drop the resume copies. */
async function closeIfFinished(deps: IntakeDeps, batchId: string): Promise<void> {
  const rows = await loadRows(deps, batchId);
  const finished = rows.every(
    (r) => r.decision_action && (r.decision_action !== 'file_under_job' || r.application_id),
  );
  if (!finished) return;
  const paths = rows.map((r) => r.resume_storage_path).filter((p): p is string => !!p);
  if (paths.length > 0) {
    const { error } = await deps.admin.storage.from(INTAKE_BUCKET).remove(paths);
    if (error) {
      console.warn('[hr/intake] resume copies not removed; batch stays open', { batchId, message: error.message });
      return;
    }
    await deps.db.from('hr_intake_rows').update({ resume_storage_path: null }).eq('batch_id', batchId);
  }
  await deps.db.from('hr_intake_batches').update({ status: 'closed' }).eq('id', batchId);
}

export async function apply(
  deps: IntakeDeps,
  _actor: IntakeActor,
  batchId: string,
  rowIds?: string[] | null,
): Promise<{ results: ApplyResult[] }> {
  const batch = await loadBatchRecord(deps, batchId);
  if (batch.status === 'closed') throw new IntakeError('This batch is closed.', 409);
  if (rowIds && (!Array.isArray(rowIds) || rowIds.some((id) => typeof id !== 'string'))) {
    throw new IntakeError('row_ids must be a list of row ids.', 400);
  }

  const rows = await loadRows(deps, batchId);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const results: ApplyResult[] = [];
  let targets: RowRecord[];
  if (rowIds && rowIds.length > 0) {
    targets = [];
    for (const id of new Set(rowIds)) {
      const r = byId.get(id);
      if (!r) results.push({ row_id: id, ok: false, application_id: null, error: 'Row not found in this batch' });
      else targets.push(r);
    }
  } else {
    targets = rows.filter((r) => r.decision_action === 'file_under_job');
  }

  const toFile: RowRecord[] = [];
  for (const r of targets) {
    if (r.application_id) {
      results.push({ row_id: r.id, ok: true, application_id: r.application_id, error: null });
    } else if (r.decision_action !== 'file_under_job') {
      results.push({ row_id: r.id, ok: false, application_id: null, error: 'Decide this row as "file under job" first' });
    } else {
      toFile.push(r);
    }
  }

  if (toFile.length > 0) {
    const jobs = new Map((await loadOpenJobs(deps)).map((j) => [j.id, j]));
    const filed = await mapLimit(toFile, APPLY_CONCURRENCY, (r) => fileOne(deps, r, jobs.get(r.decision_job_id ?? '')));
    results.push(...filed);
    await closeIfFinished(deps, batchId).catch((e) => {
      console.warn('[hr/intake] batch not closed', { batchId, message: (e as Error)?.message });
    });
  }
  return { results };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export async function listRules(deps: IntakeDeps): Promise<IntakeMatchRule[]> {
  const rules = await loadRules(deps);
  const jobIds = [...new Set(rules.map((r) => r.job_id))];
  const jobs = await selectInChunks<{ id: string; title: string }>(jobIds, (chunk) =>
    deps.db.from('hr_recruitment_jobs').select('id, title').in('id', chunk),
  ).catch((e) => {
    throw dbFail('read the jobs the rules point at', e);
  });
  const titles = new Map(jobs.map((j) => [j.id, j.title]));
  return rules.map((r) => ruleToContract(r, titles.get(r.job_id) ?? null));
}

export async function deleteRule(deps: IntakeDeps, ruleId: string): Promise<void> {
  if (!isUuid(ruleId)) throw new IntakeError('Rule not found, or you do not have access to it.', 404);
  const { data, error } = await deps.db.from('hr_intake_match_rules').delete().eq('id', ruleId).select('id');
  if (error) throw dbFail('delete the rule', error);
  if (!data || data.length === 0) throw new IntakeError('Rule not found, or you do not have access to it.', 404);
}
