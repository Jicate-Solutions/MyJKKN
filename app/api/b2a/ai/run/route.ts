/**
 * B2A — External AI door (₹0 Max lane).
 *
 * POST /api/b2a/ai/run                     Enqueue an external AI job (returns 202 + job_id)
 * GET  /api/b2a/ai/run?job_id=…&app_id=…   Read status/result, scoped to the owning app
 *
 * Trusted first-party callers only (the centralized bug reporter holds the single
 * 'ai'-module key). Individual external apps NEVER hold a MyJKKN key — the reporter
 * gates per-app AI enablement + task allow-lists, then forwards here with app_id.
 *
 * Design constraints (Director, 2026-07-16):
 *  - ₹0 Max lane only — no paid fallback anywhere.
 *  - External jobs ride priority 500 (MyJKKN's own jobs at 100 always claim first).
 *  - No long-polling: this route always answers instantly; callers poll GET.
 *  - Only ai_job_types rows with external_allowed=true are reachable
 *    (enforced in fn_ai_enqueue_external, not just here).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { corsHeaders } from '@/lib/api-keys/cors';

const MODULE_KEY = 'ai' as const;
const ENDPOINT = '/api/b2a/ai/run';

// Payload ceiling: keeps ai_jobs rows small (resource guard — Director concern
// 2026-07-16: external door must not bloat MyJKKN's database).
const MAX_PAYLOAD_BYTES = 32_768;

const APP_ID_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/i;
const TASK_RE = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Collapse queue-internal statuses to the 5 states external apps see. */
function externalStatus(raw: string | null | undefined): string {
  switch (raw) {
    case 'pending':
    case 'claimed':
      return 'queued';
    case 'running':
      return 'running';
    case 'done':
      return 'done';
    case 'error':
    case 'canceled':
      return 'error';
    default:
      return 'unknown';
  }
}

function bad(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: corsHeaders });
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ─── POST — enqueue an external AI job ──────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const authResult = await authenticateApiKey(request, {
    requiredModule: MODULE_KEY,
    requireRead: true,
    requireWrite: true,
  });
  if ('error' in authResult) return authResult.error;
  const { context } = authResult;

  const rate = checkRateLimit(context.keyId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Retry-After': String(Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  const { ipAddress, userAgent } = extractRequestMeta(request);
  const log = (statusCode: number) =>
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: ENDPOINT,
      module: MODULE_KEY,
      institutionId: null,
      statusCode,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    log(400);
    return bad(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  const { app_id, task, payload, dedupe_key } = (body ?? {}) as {
    app_id?: unknown;
    task?: unknown;
    payload?: unknown;
    dedupe_key?: unknown;
  };

  if (typeof app_id !== 'string' || !APP_ID_RE.test(app_id)) {
    log(400);
    return bad(400, 'BAD_REQUEST', 'app_id required (slug, max 100 chars)');
  }
  if (typeof task !== 'string' || !TASK_RE.test(task)) {
    log(400);
    return bad(400, 'BAD_REQUEST', 'task required (e.g. "bug.summarize")');
  }
  const jobPayload =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  if (JSON.stringify(jobPayload).length > MAX_PAYLOAD_BYTES) {
    log(413);
    return bad(413, 'PAYLOAD_TOO_LARGE', `payload must be under ${MAX_PAYLOAD_BYTES} bytes`);
  }
  const dedupeKey =
    typeof dedupe_key === 'string' && dedupe_key.length > 0 && dedupe_key.length <= 200
      ? dedupe_key
      : null;

  try {
    const { data, error } = await context.supabase.rpc('fn_ai_enqueue_external', {
      p_job_type: task,
      p_payload: jobPayload,
      p_app_id: app_id,
      p_dedupe_key: dedupeKey,
    });
    if (error) throw error;

    const res = (data ?? {}) as { ok?: boolean; job_id?: string; error?: string };
    if (!res.ok) {
      const reason = res.error ?? 'enqueue refused';
      if (reason === 'task not available to external apps' || reason === 'unknown or disabled job_type') {
        log(403);
        return bad(403, 'TASK_NOT_PERMITTED', reason);
      }
      if (reason === 'in_flight') {
        log(409);
        return bad(409, 'IN_FLIGHT', 'An identical job is already queued or running (same dedupe_key)');
      }
      if (reason === 'app_id required') {
        log(400);
        return bad(400, 'BAD_REQUEST', reason);
      }
      // e.g. 'no seat owner configured' — engine-side misconfiguration
      log(503);
      return bad(503, 'AI_UNAVAILABLE', 'AI lane is not available right now; retry later');
    }

    log(202);
    return NextResponse.json(
      {
        job_id: res.job_id,
        status: 'queued',
        poll: { method: 'GET', url: `${ENDPOINT}?job_id=${res.job_id}&app_id=${app_id}`, retry_after: 30 },
      },
      { status: 202, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log(500);
    return bad(500, 'INTERNAL_ERROR', `Failed to enqueue AI job: ${message}`);
  }
}

// ─── GET — read status/result (scoped to the owning app) ───────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const authResult = await authenticateApiKey(request, {
    requiredModule: MODULE_KEY,
    requireRead: true,
  });
  if ('error' in authResult) return authResult.error;
  const { context } = authResult;

  const rate = checkRateLimit(context.keyId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Retry-After': String(Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  const { ipAddress, userAgent } = extractRequestMeta(request);
  const url = new URL(request.url);
  const jobId = url.searchParams.get('job_id') ?? '';
  const appId = url.searchParams.get('app_id') ?? '';

  const log = (statusCode: number) =>
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: ENDPOINT,
      module: MODULE_KEY,
      institutionId: null,
      statusCode,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });

  if (!UUID_RE.test(jobId) || !APP_ID_RE.test(appId)) {
    log(400);
    return bad(400, 'BAD_REQUEST', 'job_id (uuid) and app_id are required');
  }

  try {
    // fn_ai_external_result returns NULL unless (job_id, app_id) match — a job
    // belonging to another app is indistinguishable from a nonexistent one.
    const { data, error } = await context.supabase.rpc('fn_ai_external_result', {
      p_job_id: jobId,
      p_app_id: appId,
    });
    if (error) throw error;

    if (!data) {
      log(404);
      return bad(404, 'NOT_FOUND', 'No such job for this app');
    }

    const row = data as {
      status?: string;
      result?: unknown;
      error?: string | null;
      requested_at?: string;
      completed_at?: string | null;
    };
    const status = externalStatus(row.status);
    const done = status === 'done' || status === 'error';

    log(200);
    return NextResponse.json(
      {
        job_id: jobId,
        status,
        ...(status === 'done' ? { result: row.result ?? null } : {}),
        ...(status === 'error' ? { error: row.error ?? 'job failed' } : {}),
        ...(done ? {} : { retry_after: 30 }),
        requested_at: row.requested_at,
        completed_at: row.completed_at ?? null,
      },
      { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log(500);
    return bad(500, 'INTERNAL_ERROR', `Failed to read AI job: ${message}`);
  }
}
