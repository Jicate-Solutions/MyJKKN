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

/**
 * Upload a CVViZ export plus resumes. `resumes` is 0..n PDF/DOC/DOCX files, or
 * exactly one .zip.
 */
export async function createIntakeBatch(input: {
  exportFile: File;
  resumes: File[];
}): Promise<IntakeBatch> {
  const form = new FormData();
  form.append('export', input.exportFile);
  for (const f of input.resumes) form.append('resumes', f);
  const body = await call(
    '/batches',
    { method: 'POST', body: form },
    (b): b is { batch: IntakeBatch } => isObj(b) && isObj(b.batch) && typeof b.batch.id === 'string',
  );
  return body.batch;
}

export async function decideIntakeRow(rowId: string, req: DecideRequest): Promise<IntakeRow> {
  const body = await call(
    `/rows/${encodeURIComponent(rowId)}/decide`,
    jsonInit('POST', { action: req.action, job_id: req.job_id ?? null }),
    (b): b is { row: IntakeRow } => isObj(b) && isObj(b.row),
  );
  return body.row;
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
