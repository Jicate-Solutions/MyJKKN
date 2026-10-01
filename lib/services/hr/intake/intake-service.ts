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
 *   db    — the caller's own session, READ-ONLY. Every intake table and every
 *           job is read through it, so RLS decides what this person can see
 *           (hr.recruitment.create + institution access). Signed-in people hold
 *           no INSERT/UPDATE/DELETE grant on the intake tables at all, so no
 *           column can be written straight through PostgREST.
 *   admin — the service role. EVERY write to the intake tables, the private
 *           'hr-intake' bucket (no client storage policy exists), duplicate
 *           lookups across every college (a person who applied at another
 *           college is still the same person), and the hr_job_applications
 *           insert (its INSERT policy only admits applicants filing for
 *           themselves — the careers path uses the service role likewise).
 *           Every admin WRITE happens only AFTER the session client has shown
 *           that this person can see the batch, the row and the job, and every
 *           name written beside a decision comes from the person's profile on
 *           the server (IntakeActor), never from the request.
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
import { filingBlockers, proposeMatch, type MatchJob } from '@/lib/hr/intake/propose-match';
import {
  isZipBytes,
  matchResumeFileDetailed,
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
  constructor(
    message: string,
    public readonly status: number,
    /** Extra fields for the response body, e.g. the colleges a person may choose from. */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'IntakeError';
  }
}

export interface IntakeActor {
  id: string;
  /** From profiles.full_name, read on the server. */
  name: string | null;
  institution_id: string | null;
  is_super_admin?: boolean;
}

export interface IntakeDeps {
  db: SupabaseClient;
  admin: SupabaseClient;
  upload: typeof uploadResumeToJobFolder;
  /** Removes a Drive file; used to clean up after losing a filing race. Best effort. */
  deleteFile?: (fileId: string) => Promise<boolean>;
  extractor: ResumeExtractor | null;
  now?: () => Date;
  newId?: () => string;
}

/** A college the person may file an upload under. */
export interface IntakeInstitutionChoice {
  id: string;
  name: string;
}

/** Batches with no activity for this long are closed and their resume copies removed. */
export const IDLE_BATCH_DAYS = 30;

/** Card reasons when a resume could not be paired safely (one file, one person). */
export const AMBIGUOUS_RESUME_NOTE = 'Two uploaded files share this name — upload them with distinct names';
export const SHARED_RESUME_NOTE =
  'Another candidate in this export names the same resume file — upload each person’s resume with a distinct name';

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
    // A job with no college is readable at every college, and so would be the
    // application filed under it: the helper never proposes or files one.
    .filter((r) => !!r.institution_id)
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

/**
 * True when this person's session can reach the college. Asked of the same
 * function the RLS policies use, with a NON-NULL id only: that function answers
 * TRUE for NULL, so a missing id is refused here before it is ever asked.
 */
async function canReachInstitution(deps: IntakeDeps, institutionId: string): Promise<boolean> {
  if (!isUuid(institutionId)) return false;
  const { data, error } = await deps.db.rpc('role_has_institution_access', { check_institution_id: institutionId });
  if (error) throw dbFail('check your access to that college', error);
  return data === true;
}

/** The colleges this person can file an upload under, by name. */
export async function accessibleInstitutions(deps: IntakeDeps): Promise<IntakeInstitutionChoice[]> {
  const { data, error } = await deps.db.from('institutions').select('id, name').order('name', { ascending: true }).limit(200);
  if (error) throw dbFail('read the colleges', error);
  const all = ((data ?? []) as { id: string; name: string | null }[]).filter((i) => isUuid(i.id));
  const out: IntakeInstitutionChoice[] = [];
  for (const i of all) {
    if (await canReachInstitution(deps, i.id)) out.push({ id: i.id, name: i.name ?? 'Unnamed college' });
  }
  return out;
}

/**
 * The college a new upload belongs to: the uploader's home college; for someone
 * with none, the college they chose, provided they can reach it. Never NULL — a
 * batch with no college would be visible to HR in every college.
 */
async function resolveBatchInstitution(
  deps: IntakeDeps,
  actor: IntakeActor,
  chosen: string | null | undefined,
): Promise<string> {
  if (actor.institution_id) return actor.institution_id;
  const pick = typeof chosen === 'string' ? chosen.trim() : '';
  if (!pick) {
    throw new IntakeError(
      'Your profile has no college, so choose which college this upload is for.',
      400,
      { needs_institution: true, institutions: await accessibleInstitutions(deps) },
    );
  }
  if (!(await canReachInstitution(deps, pick))) {
    throw new IntakeError(
      'You cannot add candidates for that college. Choose one of the colleges you work with.',
      403,
      { needs_institution: true, institutions: await accessibleInstitutions(deps) },
    );
  }
  return pick;
}

export async function createBatch(
  deps: IntakeDeps,
  actor: IntakeActor,
  exportFile: UploadedFile,
  chosenInstitutionId?: string | null,
): Promise<{ batch: IntakeBatch }> {
  const institutionId = await resolveBatchInstitution(deps, actor, chosenInstitutionId);
  let parsed: ParsedRow[];
  try {
    parsed = parseExport(exportFile.name, exportFile.bytes);
  } catch (e) {
    if (e instanceof IntakeParseError) throw new IntakeError(e.message, 400);
    throw e;
  }
  const { data, error } = await deps.admin
    .from('hr_intake_batches')
    .insert({
      id: idOf(deps),
      source: 'cvviz_export',
      file_name: exportFile.name.slice(0, 255),
      institution_id: institutionId,
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
  // A path already in storage is taken too: the signed URLs never overwrite (upsert: false).
  const taken = new Set<string>(presentPaths);
  const planned = checked.map((f) => ({ ...f, path: uniquePath(batchId, f.name, taken) }));
  const newCount = planned.filter((p) => !presentPaths.has(p.path)).length;
  if (presentPaths.size + newCount > MAX_RESUME_FILES) {
    throw new IntakeError(`A batch takes at most ${LIMITS_TEXT.files} files; ${presentPaths.size} are already uploaded.`, 400);
  }

  const uploads: UploadUrlResponse['uploads'] = [];
  for (const p of planned) {
    // upsert: false — a signed URL can only create a new object, never replace
    // one already uploaded to this batch (the path above is always fresh).
    const { data, error } = await deps.admin.storage.from(INTAKE_BUCKET).createSignedUploadUrl(p.path, { upsert: false });
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
        // "_" first: a loose upload's name never starts with it (safeStorageName),
        // so a zip entry can never overwrite a resume uploaded on its own.
        const path = `${batchId}/_zip${zipCount}-${k}-${safeStorageName(f.name)}`;
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

  // Claim the batch so two prepare calls cannot run at once. The session read
  // above (loadBatchRecord) is the access check; the write is the server's.
  const now = nowOf(deps);
  const stale = new Date(now.getTime() - APPLY_CLAIM_TTL_MS).toISOString();
  const { data: claimed, error: claimErr } = await deps.admin
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

  // Set once the batch is marked ready. After that the rows ARE the batch: a
  // later step failing (tidying storage, counting rule use, re-reading) must
  // never trigger the clean-up below, which would delete every row.
  let committed = false;
  try {
    const { files, skipped, zipPaths, junkPaths } = await collectUploads(deps, batchId, uploaded);

    // --- duplicates earlier in this file (needed to decide who may share a file) ---
    const sameFile = findSameFileDuplicates(parsed);
    // Who may share ONE resume file: rows with the same email only. A shared
    // phone (a family or agency number) or a matching name is not proof of the
    // same person, so it never lets one file serve two rows.
    const emailOf = new Map(parsed.map((r) => [r.row_index, r.candidate.email?.trim().toLowerCase() || null]));
    const personOf = (rowIndex: number): string => {
      const email = emailOf.get(rowIndex);
      return email ? `e:${email}` : `r:${rowIndex}`;
    };

    // --- pair each row with its resume: one file, one person ---
    const pairing = new Map<number, StoredResume | null>();
    const ambiguousRows = new Set<number>();
    const ambiguousFiles = new Set<StoredResume>();
    const sharedRows = new Set<number>();
    for (const row of parsed) {
      const m = matchResumeFileDetailed(row.file_name, files);
      if (m.ambiguous) {
        ambiguousRows.add(row.row_index);
        // Every upload that fits this name equally well is part of the clash.
        for (const f of files) if (matchResumeFileDetailed(row.file_name, [f]).file) ambiguousFiles.add(f);
      }
      pairing.set(row.row_index, m.file);
    }
    // A file may serve several rows only when they are the SAME person (same
    // email, above). Named by two different people, it pairs with neither: a
    // guess could file one person's resume under another's name.
    const peopleByFile = new Map<StoredResume, Set<string>>();
    for (const [rowIndex, f] of pairing) {
      if (!f) continue;
      const set = peopleByFile.get(f) ?? new Set<string>();
      set.add(personOf(rowIndex));
      peopleByFile.set(f, set);
    }
    for (const [rowIndex, f] of pairing) {
      if (f && (peopleByFile.get(f)?.size ?? 0) > 1) {
        pairing.set(rowIndex, null);
        sharedRows.add(rowIndex);
      }
    }
    const used = new Set<StoredResume>();
    for (const f of pairing.values()) if (f) used.add(f);
    const unusedPaths: string[] = [];
    for (const f of files) {
      if (used.has(f)) continue;
      skipped.push({
        file_name: f.name,
        reason: ambiguousFiles.has(f)
          ? 'Another uploaded file has the same name — upload them with distinct names'
          : [...peopleByFile.keys()].includes(f)
            ? 'Two different candidates name this file'
            : 'No row in the export names this file',
      });
      unusedPaths.push(f.path);
    }

    // --- what the helper compares against ---
    const [jobs, rules] = await Promise.all([loadOpenJobs(deps), loadRules(deps)]);

    // --- duplicates already in MyJKKN ---
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
      let failed = 0;
      const results = await mapLimit(toRead, EXTRACTION_CONCURRENCY, async (s) => {
        try {
          return await extractor({ fileName: s.name, bytes: s.bytes, mimeType: s.mime });
        } catch {
          // No file name or path in the log: applicants put phone numbers in them.
          failed += 1;
          return 'unreadable' as const;
        }
      });
      toRead.forEach((s, i) => extracts.set(s, results[i] ?? null));
      if (failed > 0) console.warn('[hr/intake] some resumes could not be read', { batchId, failed, attempted: toRead.length });
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
      if (ambiguousRows.has(row.row_index)) {
        extra.push(AMBIGUOUS_RESUME_NOTE);
      } else if (sharedRows.has(row.row_index)) {
        extra.push(SHARED_RESUME_NOTE);
      } else if (row.file_name && !s) {
        extra.push('Resume file was not in the upload');
      }
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
        duplicate_of_candidate: same ? byIndex.get(same.ref_row_index)?.candidate ?? null : null,
        duplicate_of_resume_uploaded: same ? !!pairing.get(same.ref_row_index) : undefined,
        openJobs: jobs,
        rules: rulesForMatch,
        extra_reasons: extra,
        resume_uploaded: !!s,
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
    const { error: clearErr } = await deps.admin.from('hr_intake_rows').delete().eq('batch_id', batchId);
    if (clearErr) throw dbFail('clear an earlier attempt', clearErr);
    // Earliest rows first, so a same-file pointer always names a row already written.
    for (const chunk of chunkIdsForIn(records, 100)) {
      const { error } = await deps.admin.from('hr_intake_rows').insert(chunk);
      if (error) throw dbFail('save the batch rows', error);
    }

    const { data: ready, error: readyErr } = await deps.admin
      .from('hr_intake_batches')
      .update({ status: 'ready', skipped_files: skipped, parsed_rows: null, prepare_claimed_at: null })
      .eq('id', batchId)
      .select(BATCH_COLUMNS)
      .single();
    if (readyErr || !ready) throw dbFail('finish preparing the batch', readyErr);
    committed = true;

    // Nothing below may undo the batch: each step only logs when it fails.
    const drop = [...zipPaths, ...junkPaths, ...unusedPaths];
    if (drop.length > 0) {
      const { error } = await deps.admin.storage.from(INTAKE_BUCKET).remove(drop);
      if (error) console.warn('[hr/intake] unused uploads not removed', { batchId, count: drop.length, message: error.message });
    }
    await recordRuleUse(deps, ruleUse).catch((e) => {
      console.warn('[hr/intake] rule usage not recorded', { batchId, message: (e as Error)?.message });
    });

    const rows = await loadRows(deps, batchId);
    return { batch: toIntakeBatch(ready as BatchRecord, 0, 0), rows: rows.map(toIntakeRow) };
  } catch (e) {
    if (!committed) {
      // Leave the batch preparable again: no half-written rows, claim released.
      // Only while it is still 'preparing': the "ready" write may have landed
      // even though its reply was lost, and then the rows ARE the batch.
      const { data: still } = await deps.admin
        .from('hr_intake_batches').select('status').eq('id', batchId).maybeSingle();
      if ((still as { status?: string } | null)?.status === 'preparing') {
        await deps.admin.from('hr_intake_rows').delete().eq('batch_id', batchId);
        await deps.admin.from('hr_intake_batches').update({ prepare_claimed_at: null }).eq('id', batchId);
      }
    }
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
 * Remember a correction as a rule for the job's own college. A college's rule
 * for this title is moved to the new job and credited to this person, or a new
 * one is written. Rules of OTHER colleges are never moved or deleted, and there
 * are no college-less rules. The job came from loadOpenJobs, i.e. this person's
 * session can see it; the write itself is the server's (service role).
 */
export async function learnRule(
  deps: IntakeDeps,
  actor: IntakeActor,
  norm: string,
  job: Pick<MatchJob, 'id' | 'title' | 'institution_id'>,
): Promise<IntakeMatchRule> {
  const institutionId = job.institution_id;
  if (!institutionId) {
    throw new IntakeError('This job belongs to no college, so the correction cannot be remembered for next time.', 400);
  }
  const RULE_COLUMNS = 'id, cvviz_job_title_norm, job_id, institution_id, created_by, created_by_name, created_at, times_used';
  const fields = {
    cvviz_job_title_norm: norm,
    job_id: job.id,
    institution_id: institutionId,
    created_by: actor.id,
    created_by_name: actor.name,
    times_used: 0,
    last_used_at: null,
  };
  const findMine = async () => {
    const { data, error } = await deps.admin
      .from('hr_intake_match_rules')
      .select('id')
      .eq('cvviz_job_title_norm', norm)
      .eq('institution_id', institutionId)
      .limit(1);
    if (error) throw dbFail('read the match rules', error);
    return ((data ?? [])[0] as { id: string } | undefined)?.id ?? null;
  };
  const update = (id: string) =>
    deps.admin.from('hr_intake_match_rules').update(fields).eq('id', id).select(RULE_COLUMNS).single();

  const existing = await findMine();
  let { data: saved, error: saveErr } = existing
    ? await update(existing)
    : await deps.admin.from('hr_intake_match_rules').insert(fields).select(RULE_COLUMNS).single();
  if (saveErr && (saveErr as { code?: string }).code === '23505') {
    // Someone else in the same college taught the same title a moment ago: take it over.
    const raced = await findMine();
    if (raced) ({ data: saved, error: saveErr } = await update(raced));
  }
  if (saveErr || !saved) throw dbFail('save the match rule', saveErr);
  return ruleToContract(saved as RuleRecord, job.title);
}

/** True while another request holds the row's filing claim. */
function claimIsFresh(claimedAt: string | null, now: Date): boolean {
  if (!claimedAt) return false;
  const t = Date.parse(claimedAt);
  return Number.isFinite(t) && t > now.getTime() - APPLY_CLAIM_TTL_MS;
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

  // The session reads are the access check: this person can see the row and its batch.
  const row = await loadRow(deps, rowId);
  const batch = await loadBatchRecord(deps, row.batch_id);
  if (batch.status !== 'ready') throw new IntakeError(batch.status === 'closed' ? 'This batch is closed.' : 'This batch is still being prepared.', 409);
  if (row.application_id) throw new IntakeError('Already filed in MyJKKN; it cannot be changed here.', 409);
  if (row.applied_at && !row.apply_error) {
    throw new IntakeError('Filed once already; that application was later removed, so this card cannot be changed.', 409);
  }
  const now = nowOf(deps);
  if (claimIsFresh(row.apply_claimed_at, now)) {
    throw new IntakeError('This candidate is being filed right now. Wait a minute, then refresh.', 409);
  }

  let job: LoadedJob | undefined;
  if (action === 'file_under_job') {
    job = (await loadOpenJobs(deps)).find((j) => j.id === jobId);
    if (!job) throw new IntakeError('That job is not open, or you do not have access to it.', 400);
  }

  const corrected = action !== row.proposal_action || (action === 'file_under_job' && jobId !== row.proposal_job_id);
  const stale = new Date(now.getTime() - APPLY_CLAIM_TTL_MS).toISOString();
  const { data, error } = await deps.admin
    .from('hr_intake_rows')
    .update({
      decision_action: action,
      decision_job_id: jobId,
      decided_by: actor.id,
      decided_by_name: actor.name,
      decided_at: now.toISOString(),
      decision_corrected: corrected,
      applied_at: null,
      apply_error: null,
    })
    .eq('id', row.id)
    .is('application_id', null)
    .or(`apply_claimed_at.is.null,apply_claimed_at.lt.${stale}`)
    .select('*')
    .maybeSingle();
  if (error) throw dbFail('save the decision', error);
  if (!data) throw new IntakeError('This candidate was filed, or is being filed, a moment ago; refresh to see it.', 409);

  // The batch may have closed between the check above and this write. A closed
  // batch has (or is about to have) no resumes, so the decision cannot stand:
  // put the row back as it was and say so.
  const { data: after, error: afterErr } = await deps.admin
    .from('hr_intake_batches').select('status').eq('id', row.batch_id).maybeSingle();
  if (afterErr || (after as { status?: string } | null)?.status === 'closed') {
    await deps.admin
      .from('hr_intake_rows')
      .update({
        decision_action: row.decision_action,
        decision_job_id: row.decision_job_id,
        decided_by: row.decided_by,
        decided_by_name: row.decided_by_name,
        decided_at: row.decided_at,
        decision_corrected: row.decision_corrected,
        applied_at: row.applied_at,
        apply_error: row.apply_error,
      })
      .eq('id', row.id)
      .eq('decided_at', now.toISOString());
    throw new IntakeError('This batch was closed a moment ago; refresh to see it.', 409);
  }

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
  if (batch.status !== 'ready') throw new IntakeError(batch.status === 'closed' ? 'This batch is closed.' : 'This batch is still being prepared.', 409);
  const rows = (await loadRows(deps, batchId)).filter(
    (r) =>
      !r.decision_action &&
      !r.application_id &&
      r.proposal_confidence === 'high' &&
      // Never accept a filing that filing itself would refuse (rows from before
      // the cap, or a resume copy that has since gone).
      (r.proposal_action !== 'file_under_job' || filingBlockers(r.candidate, !!r.resume_storage_path).length === 0),
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
      const { data, error } = await deps.admin
        .from('hr_intake_rows')
        .update({
          decision_action: g.action,
          decision_job_id: g.action === 'file_under_job' ? g.jobId : null,
          decided_by: actor.id,
          decided_by_name: actor.name,
          decided_at: at,
          decision_corrected: false,
        })
        .eq('batch_id', batchId)
        .in('id', chunk)
        .is('decision_action', null)
        .is('application_id', null)
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

/** A resume path the server itself wrote for this row's batch: "<batch id>/<one safe name>". */
export function isOwnResumePath(batchId: string, path: string | null): path is string {
  if (!path || !path.startsWith(`${batchId}/`) || path.includes('..')) return false;
  const rest = path.slice(batchId.length + 1);
  return rest.length > 0 && !rest.includes('/');
}

async function fileOne(deps: IntakeDeps, row: RowRecord, job: LoadedJob | undefined): Promise<ApplyResult> {
  /** Set when THIS request holds the row's filing claim; only then may it release it. */
  let claimedAt: string | null = null;
  const fail = async (message: string): Promise<ApplyResult> => {
    const patch: Record<string, unknown> = { apply_error: message, applied_at: nowOf(deps).toISOString() };
    let q = deps.admin.from('hr_intake_rows').update(claimedAt ? { ...patch, apply_claimed_at: null } : patch)
      .eq('id', row.id)
      .is('application_id', null);
    if (claimedAt) {
      q = q.eq('apply_claimed_at', claimedAt);
    } else {
      // Never touch a row another request is filing right now.
      const stale = new Date(nowOf(deps).getTime() - APPLY_CLAIM_TTL_MS).toISOString();
      q = q.or(`apply_claimed_at.is.null,apply_claimed_at.lt.${stale}`);
    }
    await q;
    return { row_id: row.id, ok: false, application_id: null, error: message };
  };
  const done = async (applicationId: string): Promise<ApplyResult> => {
    const { error } = await deps.admin
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
  if (!row.decided_by || !row.decided_at) return fail('No one has recorded a decision for this row; decide it again');
  if (!job) return fail('The job is no longer open, or you do not have access to it');
  if (!job.institution_id) return fail('This job has no college, so an application under it would be visible at every college');
  if (!c.email) return fail('No email address in the export, so it cannot be filed');
  if (!c.phone) return fail(`No usable phone number (${c.phone_issue ?? 'missing'})`);
  if (!row.resume_storage_path) return fail('No resume file was uploaded for this row');
  if (!isOwnResumePath(row.batch_id, row.resume_storage_path)) return fail('The stored resume is not part of this upload');
  const resumePath = row.resume_storage_path;

  try {
    // Claim the row so a second, concurrent apply cannot file it again. The
    // claim is pinned to the decision this request loaded: if HR changed the
    // card since (to skip, or another job), nothing is filed.
    const now = nowOf(deps);
    const stale = new Date(now.getTime() - APPLY_CLAIM_TTL_MS).toISOString();
    const { data: claimed, error: claimErr } = await deps.admin
      .from('hr_intake_rows')
      .update({ apply_claimed_at: now.toISOString() })
      .eq('id', row.id)
      .is('application_id', null)
      .eq('decision_action', 'file_under_job')
      .eq('decision_job_id', job.id)
      .eq('decided_at', row.decided_at)
      .or(`apply_claimed_at.is.null,apply_claimed_at.lt.${stale}`)
      .select('id');
    if (claimErr) return fail(`Could not start filing: ${claimErr.message}`);
    if (!claimed || claimed.length === 0) {
      return {
        row_id: row.id, ok: false, application_id: null,
        error: 'Not filed: the decision on this card changed, or another request is filing it. Refresh to see it.',
      };
    }
    claimedAt = now.toISOString();

    const already = await existingApplicationId(deps.admin, job.id, c.email);
    if (already) return done(already);

    const { data: blob, error: dlErr } = await deps.admin.storage.from(INTAKE_BUCKET).download(resumePath);
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
    if (insErr && (insErr as { code?: string }).code === '23505') {
      // Lost a race: the same person was filed under this job a moment ago
      // (uq_hr_job_applications_cvviz_job_email). Ours never committed, so its
      // Drive copy is an orphan; the row is linked to the winner instead.
      if (deps.deleteFile) await deps.deleteFile(uploaded.driveFileId).catch(() => false);
      const winner = await existingApplicationId(deps.admin, job.id, c.email).catch(() => null);
      if (winner) return done(winner);
      return fail('This person was filed under this job by another request, but that application could not be found');
    }
    if (insErr || !inserted) {
      // Same choice as the careers path: any other insert error may still have
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

/**
 * Close the batch once every row is settled, and drop the resume copies. A row
 * decided "needs a new job" is NOT settled: HR may open that job and change the
 * row to "file under job", which needs its resume, so the batch stays open
 * (an idle batch is closed after IDLE_BATCH_DAYS by cleanupIdleBatches).
 */
async function closeIfFinished(deps: IntakeDeps, batchId: string): Promise<void> {
  const settled = (rows: RowRecord[]) =>
    rows.every(
      (r) =>
        r.decision_action &&
        r.decision_action !== 'needs_new_job' &&
        (r.decision_action !== 'file_under_job' || r.application_id || (r.applied_at && !r.apply_error)),
    );
  if (!settled(await loadRows(deps, batchId))) return;

  // Close FIRST, then look again: a decision saved between the first look and
  // the close (a skip changed to "file under job") reopens the batch, and
  // decide() undoes any decision that lands after the close. Only then are the
  // resumes removed, so no unsettled row ever loses its resume.
  const { data: closed, error: closeErr } = await deps.admin
    .from('hr_intake_batches')
    .update({ status: 'closed' })
    .eq('id', batchId)
    .eq('status', 'ready')
    .select('id');
  if (closeErr || !closed || closed.length === 0) return;
  const reopen = async (why: string) => {
    await deps.admin.from('hr_intake_batches').update({ status: 'ready' }).eq('id', batchId);
    console.warn('[hr/intake] batch reopened', { batchId, why });
  };
  let after: RowRecord[];
  try {
    after = await loadRows(deps, batchId);
  } catch (e) {
    return reopen((e as Error)?.message ?? 'rows not re-read');
  }
  if (!settled(after)) return reopen('a row changed while closing');

  // Everything under the batch folder, not only the paths on rows: an upload
  // never sent to prepare would otherwise stay in storage for ever.
  try {
    await removeBatchFiles(deps.admin, batchId);
  } catch (e) {
    return reopen(`resume copies not removed: ${(e as Error)?.message}`);
  }
  await deps.admin.from('hr_intake_rows').update({ resume_storage_path: null }).eq('batch_id', batchId);
}

export async function apply(
  deps: IntakeDeps,
  _actor: IntakeActor,
  batchId: string,
  rowIds?: string[] | null,
): Promise<{ results: ApplyResult[] }> {
  const batch = await loadBatchRecord(deps, batchId);
  if (batch.status !== 'ready') throw new IntakeError(batch.status === 'closed' ? 'This batch is closed.' : 'This batch is still being prepared.', 409);
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
    } else if (r.applied_at && !r.apply_error) {
      // Filed once; the application has since been removed (e.g. purged). Never
      // file the person again from an old batch.
      results.push({ row_id: r.id, ok: false, application_id: null, error: 'Filed once already; that application was removed, so it is not filed again' });
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
// Discard and idle clean-up
// ---------------------------------------------------------------------------

/** Every object stored under the batch's folder, removed. Returns how many. */
async function removeBatchFiles(admin: SupabaseClient, batchId: string): Promise<number> {
  const { data, error } = await admin.storage.from(INTAKE_BUCKET).list(batchId, { limit: 1000 });
  if (error) throw new IntakeError(`Could not list the stored resumes: ${error.message}`, 500);
  const paths = (data ?? []).map((o) => `${batchId}/${o.name}`);
  if (paths.length === 0) return 0;
  const { error: rmErr } = await admin.storage.from(INTAKE_BUCKET).remove(paths);
  if (rmErr) throw new IntakeError(`Could not remove the stored resumes: ${rmErr.message}`, 500);
  return paths.length;
}

/**
 * Throw a batch away: its rows and its resume copies. Applications already filed
 * from it stay in MyJKKN. Only the person who uploaded it, or a super admin.
 */
export async function discardBatch(
  deps: IntakeDeps,
  actor: IntakeActor,
  batchId: string,
): Promise<{ ok: true; removed_files: number }> {
  const batch = await loadBatchRecord(deps, batchId);
  if (batch.created_by !== actor.id && !actor.is_super_admin) {
    throw new IntakeError('Only the person who uploaded this batch, or a super admin, can discard it.', 403);
  }
  const rows = await loadRows(deps, batchId);
  const now = nowOf(deps);
  if (rows.some((r) => claimIsFresh(r.apply_claimed_at, now))) {
    throw new IntakeError('A candidate in this batch is being filed right now. Try again in a minute.', 409);
  }
  // Take the prepare claim: a prepare running now could otherwise store zip
  // contents after the files are removed. Holding it also stops a new prepare.
  const stale = new Date(now.getTime() - APPLY_CLAIM_TTL_MS).toISOString();
  const { data: held, error: holdErr } = await deps.admin
    .from('hr_intake_batches')
    .update({ prepare_claimed_at: now.toISOString() })
    .eq('id', batchId)
    .or(`prepare_claimed_at.is.null,prepare_claimed_at.lt.${stale}`)
    .select('id');
  if (holdErr) throw dbFail('discard the batch', holdErr);
  if (!held || held.length === 0) {
    throw new IntakeError('This batch is being prepared right now. Try again in a minute.', 409);
  }
  // Files first: if they cannot be removed, the batch stays so nothing is orphaned.
  let removed: number;
  try {
    removed = await removeBatchFiles(deps.admin, batchId);
  } catch (e) {
    await deps.admin.from('hr_intake_batches').update({ prepare_claimed_at: null }).eq('id', batchId);
    throw e;
  }
  const { data, error } = await deps.admin.from('hr_intake_batches').delete().eq('id', batchId).select('id');
  if (error) throw dbFail('discard the batch', error);
  if (!data || data.length === 0) throw new IntakeError('Batch not found, or you do not have access to it.', 404);
  return { ok: true, removed_files: removed };
}

export interface IdleCleanupSummary {
  ok: true;
  checked: number;
  closed: number;
  files_removed: number;
  failed: number;
  count: number;
}

/**
 * Close every batch nobody has touched for IDLE_BATCH_DAYS (batch AND rows), and
 * remove its resume copies. Run daily by the AI-routine dispatcher
 * ('hr-intake-cleanup'). Service role only; no person is involved.
 */
export async function cleanupIdleBatches(admin: SupabaseClient, now: Date = new Date()): Promise<IdleCleanupSummary> {
  const cutoff = new Date(now.getTime() - IDLE_BATCH_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('hr_intake_batches')
    .select('id, updated_at')
    .neq('status', 'closed')
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(200);
  if (error) throw dbFail('read the idle batches', error);
  const batches = (data ?? []) as { id: string; updated_at: string }[];
  const summary: IdleCleanupSummary = { ok: true, checked: batches.length, closed: 0, files_removed: 0, failed: 0, count: 0 };
  for (const b of batches) {
    try {
      const { data: rows, error: rowsErr } = await admin.from('hr_intake_rows').select('updated_at').eq('batch_id', b.id);
      if (rowsErr) throw rowsErr;
      // A decision or filing in the window means the batch is still in use.
      if (((rows ?? []) as { updated_at: string }[]).some((r) => r.updated_at >= cutoff)) continue;
      summary.files_removed += await removeBatchFiles(admin, b.id);
      const { error: rErr } = await admin.from('hr_intake_rows').update({ resume_storage_path: null }).eq('batch_id', b.id);
      if (rErr) throw rErr;
      const { error: bErr } = await admin
        .from('hr_intake_batches')
        .update({ status: 'closed', parsed_rows: null, prepare_claimed_at: null })
        .eq('id', b.id);
      if (bErr) throw bErr;
      summary.closed += 1;
    } catch (e) {
      summary.failed += 1;
      console.warn('[hr/intake] idle batch not closed', { batchId: b.id, message: (e as Error)?.message });
    }
  }
  summary.count = summary.closed;
  return summary;
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
  const notFound = new IntakeError('Rule not found, or you do not have access to it.', 404);
  if (!isUuid(ruleId)) throw notFound;
  // The session read is the access check (a rule of a college this person reaches).
  const { data: seen, error: readErr } = await deps.db.from('hr_intake_match_rules').select('id').eq('id', ruleId).maybeSingle();
  if (readErr) throw dbFail('read the rule', readErr);
  if (!seen) throw notFound;
  const { data, error } = await deps.admin.from('hr_intake_match_rules').delete().eq('id', ruleId).select('id');
  if (error) throw dbFail('delete the rule', error);
  if (!data || data.length === 0) throw notFound;
}
