// =====================================================================
// OneMark — close abandoned LIVE sittings (cron)
// =====================================================================
// A live paper is sat inside a window. A learner who walks away, loses the
// device, or closes the tab leaves an fp_attempts row `mode='live'`,
// `status='in_progress'` behind. Nothing on the learner's side can close it
// once they are gone — and while it is open the paper has no result for that
// person, so the cohort sheet is wrong and the vault never learns anything
// from what they did answer.
//
// This route is the sweeper. It calls Lane S3's
// `fn_onemark_close_abandoned_live()` with the SERVICE-ROLE client (the
// function is service-role-only by grant): every in-progress live sitting
// whose paper closed more than `onemark.live.auto_close_after_minutes` ago
// gets its unanswered paper questions backfilled as SKIPS (decision 18 — a
// blank is not a wrong answer) and is then finalised. It returns how many it
// closed.
//
// IDEMPOTENT BY CONSTRUCTION. The RPC only ever looks at rows that are still
// `in_progress`, so a second run in the same minute closes nothing and
// answers 0. Running it every ten minutes is therefore safe; missing a run
// only delays a close, it never loses one.
//
// RULING 13 — an auto-closed sitting is NEVER reopened. The learner is not
// given a second go at the paper; once the paper's own window has closed, the
// same questions are offered as a fresh PRACTICE sitting instead
// (POST /api/foundation/onemark/attempts { mode: 'practice', fromAssessmentId }).
//
// CONTRACT DEPENDENCY: `fn_onemark_close_abandoned_live()` is created by Lane
// S3's migration. Until that is applied the RPC does not exist, and this route
// answers 200 with `pending_migration: true` and closed: 0 rather than an
// error — a cron that alarms every ten minutes for a fortnight teaches people
// to ignore it.
//
// THAT QUIET BRANCH IS NARROW ON PURPOSE. It is taken only when PostgREST or
// Postgres says the FUNCTION is absent — code PGRST202 / SQLSTATE 42883, or a
// message in one of their own phrasings that names this function. It is NOT
// taken for any error merely containing "does not exist": a deployed sweeper
// whose body trips over a missing relation, column or policy target would
// otherwise answer 200 with pending_migration: true for ever, abandoned live
// sittings would never close, cohort sheets would stay wrong, and the only
// signal would be a green 200. Every other error is a 500 (CLAUDE.md #27 —
// a failure state is explicit, never silent).
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Created: 2026-09-07 (OneMark Wave 3, Lane L).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { rpcMissing } from '@/lib/services/onemark/attempt-server';

const CLOSE_RPC = 'fn_onemark_close_abandoned_live';

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

  const { data, error } = await admin.rpc(CLOSE_RPC);

  if (error) {
    const message = error.message ?? '';
    if (rpcMissing(error, CLOSE_RPC)) {
      return NextResponse.json({
        ok: true,
        closed: 0,
        pending_migration: true,
        detail: `${CLOSE_RPC} is not deployed yet — nothing was swept.`,
        elapsed_ms: Date.now() - started,
      });
    }
    console.error('[onemark-live-autoclose] sweep failed:', message);
    return NextResponse.json(
      { ok: false, error: message || 'The sweep failed.', elapsed_ms: Date.now() - started },
      { status: 500 },
    );
  }

  // The RPC returns an int. PostgREST hands a scalar back bare; be tolerant of
  // the row-shaped form too rather than reporting 0 for a sweep that worked.
  const closed =
    typeof data === 'number'
      ? data
      : Array.isArray(data) && data.length
        ? Number((data[0] as any)?.[CLOSE_RPC] ?? (data[0] as any)?.count ?? 0)
        : Number(data ?? 0);

  return NextResponse.json({
    ok: true,
    closed: Number.isFinite(closed) ? closed : 0,
    elapsed_ms: Date.now() - started,
  });
}
