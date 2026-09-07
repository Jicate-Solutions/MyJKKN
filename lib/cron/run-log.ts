// =====================================================================
// Cron run log — the one helper every scheduled route can call
// =====================================================================
// WHY THIS EXISTS
// vercel.json carries 57 cron entries. Until now not one of them could report
// its own failure. /api/cron/aipulse-domain-starter-notify returned HTTP 500
// nine times in one window on 2026-08-20 ("canceling statement due to
// statement timeout"), had failed the same way the Thursday before, and two
// cohorts of learners — 588 and 635 attendees — got nothing. It was found
// because a human went looking.
//
// The dispatcher lane is already logged (ai_routine_run_log) and already
// watched (loop-watchdog). The static vercel.json lane is neither. This is the
// writer for that lane; the DDL is
// supabase/migrations/20260910030000_cron_run_log.sql and the detector that
// turns repeated failures into a bell notification is
// app/api/cron/cron-failure-alerts/route.ts.
//
// DESIGN: ONE WRAPPER, NOT 57 EDITS
// A route opts in with a single line —
//     export const GET = withCronRun('my-job', handler);
// — and gets an open row before the work and a closed row after it, with no
// other change to its body. Wrapping rather than editing is deliberate: the
// alternative was 57 near-identical diffs, each a chance to get the failure
// path subtly wrong in a route nobody will read again.
//
// TWO RULES THIS FILE WILL NOT BEND
//   1. Logging never fails the tick. Every DB call here is swallowed. A run log
//      that can 500 a working cron is worse than no run log.
//   2. An UNAUTHORIZED request is not a run. The wrapper checks CRON_SECRET
//      itself and logs nothing when it fails, because /api/cron/* is publicly
//      routable: without this gate anyone could curl a cron endpoint, collect
//      401s, and manufacture a failure streak that pages the super admins.
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/** Handle for an open run. `runId` is null when logging was unavailable. */
export interface CronRunHandle {
  runId: string | null;
  jobKey: string;
}

export interface CloseCronRunOptions {
  ok: boolean;
  statusCode?: number;
  /** Trimmed to 500 chars by the DB writer. */
  error?: string | null;
  meta?: Record<string, unknown>;
}

/** Minimal shape of the service-role client this module needs. */
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<unknown> };

/**
 * Does this request carry the cron secret?
 *
 * Accepts both forms in use across the estate: `Authorization: Bearer <secret>`
 * (what the dispatcher and Vercel send) and `?secret=` (manual runs, and the
 * form most vercel.json entries use). Returns false when CRON_SECRET is unset,
 * so a misconfigured environment logs nothing rather than logging everything.
 */
export function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization');
  if (header === `Bearer ${secret}`) return true;
  return request.nextUrl.searchParams.get('secret') === secret;
}

/**
 * Open a run row BEFORE the work starts.
 *
 * Opening first is the whole point: a row that is never closed (ok IS NULL) is
 * how a lambda timeout, an OOM or a hard 502 becomes visible. A log written only
 * on the way out cannot record a run that never came back — which is precisely
 * the shape of the statement-timeout failure that hid for two weeks.
 */
export async function openCronRun(
  admin: RpcClient,
  jobKey: string,
  path?: string,
  meta?: Record<string, unknown>,
): Promise<CronRunHandle> {
  try {
    const res = (await admin.rpc('fn_cron_record_run', {
      p_job_key: jobKey,
      p_path: path ?? null,
      p_meta: meta ?? null,
    })) as { data?: unknown } | null;
    const id = res?.data;
    return { runId: typeof id === 'string' ? id : null, jobKey };
  } catch {
    return { runId: null, jobKey }; // best-effort only
  }
}

/** Close a run row with its outcome. Silently does nothing if it never opened. */
export async function closeCronRun(
  admin: RpcClient,
  handle: CronRunHandle,
  outcome: CloseCronRunOptions,
): Promise<void> {
  if (!handle.runId) return;
  try {
    await admin.rpc('fn_cron_record_run', {
      p_job_key: handle.jobKey,
      p_run_id: handle.runId,
      p_ok: outcome.ok,
      p_status_code: outcome.statusCode ?? null,
      p_error: outcome.error ?? null,
      p_meta: outcome.meta ?? null,
    });
  } catch {
    /* best-effort only */
  }
}

/**
 * Decide the outcome of a finished handler from its HTTP status.
 *
 * A cron is successful when it answers < 400. 2xx-with-a-broken-pipe is a known
 * blind spot of this signal (a route that returns 200 and no-ops looks healthy);
 * that class is not what this file claims to catch, and pretending otherwise
 * would be the more dangerous error.
 */
export function statusIsOk(status: number): boolean {
  return status < 400;
}

/**
 * Wrap a cron route handler so every authorized invocation is logged.
 *
 * Usage:
 *   async function handler(request: NextRequest) { ... }
 *   export const GET = withCronRun('my-job', handler);
 *
 * The wrapper is transparent: the handler's own response is returned untouched,
 * and a handler that throws still throws (after the failure is recorded), so
 * Next.js keeps producing its normal 500.
 */
export function withCronRun(
  jobKey: string,
  handler: (request: NextRequest) => Promise<NextResponse> | NextResponse,
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Rule 2: an unauthorized probe is not a run. Do not log it, and do not let
    // it manufacture a failure streak.
    if (!isCronAuthorized(request)) {
      return handler(request);
    }

    let admin: RpcClient | null = null;
    try {
      admin = createServiceRoleClient() as unknown as RpcClient;
    } catch {
      admin = null; // no service-role client (env not configured) → run unlogged
    }
    if (!admin) return handler(request);

    const handle = await openCronRun(admin, jobKey, request.nextUrl.pathname);

    try {
      const response = await handler(request);
      await closeCronRun(admin, handle, {
        ok: statusIsOk(response.status),
        statusCode: response.status,
        error: statusIsOk(response.status) ? null : await peekError(response),
      });
      return response;
    } catch (err) {
      await closeCronRun(admin, handle, {
        ok: false,
        statusCode: 500,
        error: err instanceof Error ? err.message : 'handler threw',
      });
      throw err;
    }
  };
}

/**
 * Best-effort read of an error message out of a failed JSON response.
 *
 * Clones first — reading the original body would consume the stream the client
 * is about to receive. Returns null for any non-JSON or unreadable body rather
 * than guessing; the status code is already recorded either way.
 */
async function peekError(response: NextResponse): Promise<string | null> {
  try {
    const body = (await response.clone().json()) as Record<string, unknown> | null;
    if (body && typeof body.error === 'string') return body.error;
    return null;
  } catch {
    return null;
  }
}
