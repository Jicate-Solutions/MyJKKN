// =====================================================================
// External auditor access — delete what has expired (cron)
// =====================================================================
// An external peer-team auditor is granted read-only cross-institution access
// for a window. Until migration 20261201130000 that window was fiction:
// `user_institution_access` had no `expires_at` column at all, so no grant
// ever lapsed and no auditor could ever read 'expired' on the admin screen.
//
// This route is the sweeper that makes the window real. It calls
// `fn_expire_institution_access()` with the SERVICE-ROLE client (the function
// is service-role-only by grant, because it is a mass-delete across people and
// `authenticated` must never hold one). Every grant whose `expires_at` has
// passed is DELETED and the count is returned.
//
// WHY DELETE AND NOT A FLAG — the whole design rests on this. 38 RLS policies
// across 31 tables read user_institution_access WITHOUT consulting is_active;
// they would equally not consult expires_at. Treating expiry as "a timestamp
// has passed" would have been a second flag nobody reads — the identical bug
// with a new column name. Deleting the row leaves nothing for a policy to
// miss, and no policy had to change. Same conclusion as 20261201120000, which
// made *revoke* a delete for exactly this reason.
//
// NOTHING IS LOST. trg_log_institution_access_change fires AFTER DELETE and
// log_institution_access_change() writes 'institution_access_revoked' to
// role_audit_log with the old access_type and institution name. Every expiry
// is therefore auditable without a line of code here.
//
// A NULL expires_at NEVER EXPIRES. That is the column's documented meaning,
// and it is why this sweep is safe to run the minute the migration lands:
// every pre-existing row holds NULL, so the first run deletes exactly 0.
//
// IDEMPOTENT BY CONSTRUCTION. The RPC only looks at rows already past their
// schedule, so a second run in the same hour deletes nothing and answers 0.
// Missing a run delays an expiry; it never loses one.
//
// CONTRACT DEPENDENCY: `fn_expire_institution_access()` is created by
// 20261201130000, which is FILE ONLY at time of writing — the operator applies
// it at merge. Until it is applied this route answers 200 with
// `pending_migration: true` and expired: 0 rather than erroring: a cron that
// alarms hourly for a fortnight teaches people to ignore it.
//
// THAT QUIET BRANCH IS NARROW ON PURPOSE. It is taken only when PostgREST or
// Postgres says the FUNCTION is absent — PGRST202 / SQLSTATE 42883, or a
// message in one of their own phrasings naming this function. It is NOT taken
// for any error merely containing "does not exist": a deployed sweeper whose
// body tripped over a missing relation or column would otherwise answer 200
// with pending_migration: true forever, expired grants would stand
// indefinitely, and the only signal would be a green 200. Every other error is
// a 500 (CLAUDE.md #27 — a failure state is explicit, never silent).
//
// A pg_cron schedule may be preferable to a Vercel cron for a pure database
// sweep with no HTTP surface. That was not decided here: the Supabase MCP was
// disconnected, so whether pg_cron is installed on this project could not be
// checked, and guessing would have produced a schedule that silently never
// fires. This route works either way and can be retired if pg_cron is adopted.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Created: 2026-09-12.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const EXPIRE_RPC = 'fn_expire_institution_access';

/** True only when the error says THIS function is not deployed. Kept local
 *  rather than imported from another module's server helpers so an audit cron
 *  does not depend on an unrelated domain's internals. */
function rpcMissing(error: { code?: unknown; message?: unknown } | null): boolean {
  if (!error) return false;
  const code = typeof error.code === 'string' ? error.code : '';
  if (code === 'PGRST202' || code === '42883') return true;
  const message = typeof error.message === 'string' ? error.message : '';
  if (!message) return false;
  // PostgREST: "Could not find the function public.fn_x(...) in the schema cache"
  // Postgres 42883: "function public.fn_x() does not exist"
  return (
    new RegExp(`could not find the function\\s+(public\\.)?${EXPIRE_RPC}\\b`, 'i').test(message) ||
    new RegExp(`function\\s+(public\\.)?${EXPIRE_RPC}\\b[^\\n]{0,80}?does not exist`, 'i').test(
      message
    )
  );
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const admin = createServiceRoleClient() as any;

  const { data, error } = await admin.rpc(EXPIRE_RPC);

  if (error) {
    if (rpcMissing(error)) {
      return NextResponse.json({
        ok: true,
        expired: 0,
        pending_migration: true,
        detail: `${EXPIRE_RPC} is not deployed yet — nothing was swept.`,
        elapsed_ms: Date.now() - started,
      });
    }
    const message = error.message ?? '';
    console.error('[external-auditor-access-expiry] sweep failed:', message);
    return NextResponse.json(
      { ok: false, error: message || 'The sweep failed.', elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }

  // The RPC returns an int. PostgREST hands a scalar back bare; tolerate the
  // row-shaped form too rather than reporting 0 for a sweep that worked.
  const expired =
    typeof data === 'number'
      ? data
      : Array.isArray(data) && data.length
        ? Number((data[0] as any)?.[EXPIRE_RPC] ?? (data[0] as any)?.count ?? 0)
        : Number(data ?? 0);

  return NextResponse.json({
    ok: true,
    expired: Number.isFinite(expired) ? expired : 0,
    elapsed_ms: Date.now() - started,
  });
}
