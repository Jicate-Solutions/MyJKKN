// lib/hr/intake/api-client.ts
//
// Typed browser client for the HR intake helper API
// (routes under /api/hr/recruitment/intake — contract in types/hr-intake.ts).
//
// Every call either returns the shape the contract promises or THROWS an
// IntakeApiClientError carrying the server's own plain-English reason. A
// response that is missing the list it promised is treated as an error, never
// as an empty list (rule #27): an empty screen must mean "there is nothing",
// not "something went wrong and we hid it".

import type {
  ApplyResult,
  DecideRequest,
  IntakeBatch,
  IntakeMatchRule,
  IntakeOpenJob,
  IntakeRow,
  UploadUrlResponse,
} from '@/types/hr-intake';

export const INTAKE_API_BASE = '/api/hr/recruitment/intake';

export class IntakeApiClientError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'IntakeApiClientError';
    this.status = status;
  }
}

export interface IntakeBatchDetail {
  batch: IntakeBatch;
  rows: IntakeRow[];
  open_jobs: IntakeOpenJob[];
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined; // not JSON — handled by the caller
  }
}

function serverReason(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const e = (body as { error: unknown }).error;
    if (typeof e === 'string' && e.trim()) return e;
  }
  return null;
}

async function call<T>(
  path: string,
  init: RequestInit | undefined,
  check: (body: unknown) => body is T,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${INTAKE_API_BASE}${path}`, {
      credentials: 'same-origin',
      ...init,
    });
  } catch {
    throw new IntakeApiClientError(
      'Could not reach MyJKKN. Check your internet connection and try again.',
      0,
    );
  }

  const body = await readJson(res);

  if (!res.ok) {
    const reason = serverReason(body);
    if (reason) throw new IntakeApiClientError(reason, res.status);
    if (res.status === 401) {
      throw new IntakeApiClientError('Your sign-in has expired. Sign in again and retry.', 401);
    }
    if (res.status === 403) {
      throw new IntakeApiClientError(
        'You do not have permission to do this. Ask whoever manages roles to add hr.recruitment.create.',
        403,
      );
    }
    throw new IntakeApiClientError(
      `MyJKKN could not finish this request (error ${res.status}). Try again in a minute.`,
      res.status,
    );
  }

  if (!check(body)) {
    throw new IntakeApiClientError(
      'MyJKKN answered, but not in the shape this screen expects. Nothing was changed on this screen — report it with the red bug button.',
      res.status,
    );
  }
  return body;
}

const isObj = (b: unknown): b is Record<string, unknown> =>
  typeof b === 'object' && b !== null;

function jsonInit(method: string, payload: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

// ---------------------------------------------------------------------------

export async function listIntakeBatches(): Promise<IntakeBatch[]> {
  const body = await call(
    '/batches',
    undefined,
    (b): b is { batches: IntakeBatch[] } => isObj(b) && Array.isArray(b.batches),
  );
  return body.batches;
}

export async function getIntakeBatch(batchId: string): Promise<IntakeBatchDetail> {
  return call(
    `/batches/${encodeURIComponent(batchId)}`,
    undefined,
    (b): b is IntakeBatchDetail =>
      isObj(b) && isObj(b.batch) && Array.isArray(b.rows) && Array.isArray(b.open_jobs),
  );
}

/** Puts one file into the private intake bucket through a signed upload URL. */
export type IntakeFileUploader = (
  upload: UploadUrlResponse['uploads'][number],
  file: File,
) => Promise<void>;

async function defaultUploader(
  upload: UploadUrlResponse['uploads'][number],
  file: File,
): Promise<void> {
  // Imported lazily so the module stays importable in tests without a browser client.
  const { createClientSupabaseClient } = await import('@/lib/supabase/client');
  const { error } = await createClientSupabaseClient()
    .storage.from('hr-intake')
    .uploadToSignedUrl(upload.path, upload.token, file, { contentType: upload.content_type });
  if (error) throw new IntakeApiClientError(`Could not upload ${file.name}: ${error.message}`, 0);
}

export type IntakeUploadStage = 'export' | 'resumes' | 'reading';

/**
 * Upload a CVViZ export plus resumes, in three steps, because the server
 * accepts at most a few megabytes per request:
 *   1. the export alone creates the batch;
 *   2. each resume goes straight to storage through a signed upload URL,
 *      three at a time;
 *   3. prepare pairs the files with rows, reads the resumes and proposes.
 * `resumes` is 0..n PDF/DOC/DOCX/JPG/PNG files, or exactly one .zip.
 */
export async function createIntakeBatch(input: {
  exportFile: File;
  resumes: File[];
  onProgress?: (stage: IntakeUploadStage, done: number, total: number) => void;
  uploader?: IntakeFileUploader;
}): Promise<IntakeBatch> {
  const progress = input.onProgress ?? (() => undefined);
  const uploader = input.uploader ?? defaultUploader;

  progress('export', 0, 1);
  const form = new FormData();
  form.append('export', input.exportFile);
  const created = await call(
    '/batches',
    { method: 'POST', body: form },
    (b): b is { batch: IntakeBatch } => isObj(b) && isObj(b.batch) && typeof b.batch.id === 'string',
  );
  const batchId = created.batch.id;
  progress('export', 1, 1);

  const uploaded: { name: string; path: string }[] = [];
  if (input.resumes.length > 0) {
    const urls = await call(
      `/batches/${encodeURIComponent(batchId)}/upload-urls`,
      jsonInit('POST', {
        files: input.resumes.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      }),
      (b): b is UploadUrlResponse =>
        isObj(b) && Array.isArray(b.uploads) && b.uploads.length === input.resumes.length,
    );
    let done = 0;
    progress('resumes', 0, input.resumes.length);
    const queue = urls.uploads.map((u, i) => ({ u, file: input.resumes[i] }));
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        await uploader(next.u, next.file);
        uploaded.push({ name: next.u.name, path: next.u.path });
        done += 1;
        progress('resumes', done, input.resumes.length);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  progress('reading', 0, 1);
  const prepared = await call(
    `/batches/${encodeURIComponent(batchId)}/prepare`,
    jsonInit('POST', { uploaded }),
    (b): b is { batch: IntakeBatch; rows: IntakeRow[] } =>
      isObj(b) && isObj(b.batch) && Array.isArray(b.rows),
  );
  progress('reading', 1, 1);
  return prepared.batch;
}

/** A decision, plus why a correction could not be remembered, when it could not. */
export interface DecideOutcome {
  row: IntakeRow;
  ruleError: string | null;
}

export async function decideIntakeRow(rowId: string, req: DecideRequest): Promise<DecideOutcome> {
  const body = await call(
    `/rows/${encodeURIComponent(rowId)}/decide`,
    jsonInit('POST', { action: req.action, job_id: req.job_id ?? null }),
    (b): b is { row: IntakeRow; rule_error?: string | null } => isObj(b) && isObj(b.row),
  );
  return { row: body.row, ruleError: body.rule_error ?? null };
}

export async function acceptHighConfidence(batchId: string): Promise<number> {
  const body = await call(
    `/batches/${encodeURIComponent(batchId)}/accept-high`,
    jsonInit('POST', {}),
    (b): b is { decided: number } => isObj(b) && typeof b.decided === 'number',
  );
  return body.decided;
}

export async function applyIntakeBatch(
  batchId: string,
  rowIds?: string[],
): Promise<ApplyResult[]> {
  const body = await call(
    `/batches/${encodeURIComponent(batchId)}/apply`,
    jsonInit('POST', rowIds ? { row_ids: rowIds } : {}),
    (b): b is { results: ApplyResult[] } => isObj(b) && Array.isArray(b.results),
  );
  return body.results;
}

export async function listIntakeRules(): Promise<IntakeMatchRule[]> {
  const body = await call(
    '/rules',
    undefined,
    (b): b is { rules: IntakeMatchRule[] } => isObj(b) && Array.isArray(b.rules),
  );
  return body.rules;
}

export async function deleteIntakeRule(ruleId: string): Promise<void> {
  await call(
    `/rules/${encodeURIComponent(ruleId)}`,
    { method: 'DELETE' },
    (b): b is { ok: true } => isObj(b) && b.ok === true,
  );
}
