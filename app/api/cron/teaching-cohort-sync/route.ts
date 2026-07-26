// =====================================================================
// Teaching-enterprise cohort sync (daily) — Phase 1a of the spine
// generalization (spec specs/teaching-enterprise-spine-generalization-2026-07-26.md).
// =====================================================================
// Re-derives the participant set of EVERY active teaching-enterprise cohort from
// its config row in `teaching_enterprise_cohorts` and reconciles the roles:
//   • ADDs the cohort's learner role to newly-matching learners;
//   • REMOVEs it from anyone who no longer matches (a leaver loses access; their
//     filed ideas/summaries STAY — those key on author_id and RLS checks the
//     VIEWER's perms, not the author's current role);
//   • does the same for the cohort's department-side role (its Senior Learners);
//   • keeps the analytics-only cohort decoration aligned to the same set.
//
// This replaces the two hardcoded MBA sweeps with one config-driven sweep. The
// MBA-specific crons (mba-associate-sync, mba-faculty-sync) still work — their
// SQL functions are now thin wrappers over the same generic one — and are
// retired in a later PR once this route has run green.
//
// All mutation happens inside the service-role SECDEF fn_teaching_cohort_sync()
// (REVOKE anon/PUBLIC/authenticated; GRANT service_role) — the route only
// authenticates the cron and invokes it. Fully idempotent: a second run the same
// day is a no-op (ON CONFLICT DO NOTHING on adds, array membership on removes).
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron)
// OR `?secret=` query param (manual runs). Mirrors mba-associate-sync.
//
// Schedule in vercel.json: daily 04:11 (11 4 * * *) — off-peak, off the :00/:30
// marks to avoid the platform-wide cron pile-up, and off the existing
// improvement-rank-ideas (04:43) / mba-associate-sync (04:53) slots.
// Created: 2026-07-26.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

type CohortSyncRow = {
  cohort_key: string;
  role_added: number;
  role_removed: number;
  role_total: number;
  cohort_added: number;
  cohort_removed: number;
  faculty_added: number;
  faculty_removed: number;
  faculty_total: number;
};

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/teaching-cohort-sync] CRON_SECRET not configured');
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn('[cron/teaching-cohort-sync] Unauthorized attempt');
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const admin = createServiceRoleClient();
    // No argument → sweep every ACTIVE cohort config row.
    const { data, error } = await admin.rpc('fn_teaching_cohort_sync');
    if (error) {
      console.error('[cron/teaching-cohort-sync] RPC error', error.message);
      return NextResponse.json(
        { ok: false, error: error.message, duration_ms: Date.now() - startTime },
        { status: 500 },
      );
    }

    // The RPC returns ONE ROW PER COHORT (set-returning fn → array).
    const rows: CohortSyncRow[] = Array.isArray(data) ? data : data ? [data] : [];
    const duration_ms = Date.now() - startTime;

    const totals = rows.reduce(
      (acc, r) => ({
        role_added: acc.role_added + (r.role_added ?? 0),
        role_removed: acc.role_removed + (r.role_removed ?? 0),
        faculty_added: acc.faculty_added + (r.faculty_added ?? 0),
        faculty_removed: acc.faculty_removed + (r.faculty_removed ?? 0),
      }),
      { role_added: 0, role_removed: 0, faculty_added: 0, faculty_removed: 0 },
    );

    for (const r of rows) {
      console.log(
        `[cron/teaching-cohort-sync] ${r.cohort_key}: learners +${r.role_added ?? 0} / -${r.role_removed ?? 0} ` +
          `(total ${r.role_total ?? 0}), senior-learners +${r.faculty_added ?? 0} / -${r.faculty_removed ?? 0} ` +
          `(total ${r.faculty_total ?? 0}), cohort +${r.cohort_added ?? 0} / -${r.cohort_removed ?? 0}`,
      );
    }
    console.log(
      `[cron/teaching-cohort-sync] ${rows.length} cohort(s) swept, ` +
        `learners +${totals.role_added} / -${totals.role_removed}, ` +
        `senior-learners +${totals.faculty_added} / -${totals.faculty_removed}, ${duration_ms}ms`,
    );

    return NextResponse.json({
      ok: true,
      cohorts_swept: rows.length,
      totals,
      results: rows,
      duration_ms,
    });
  } catch (e) {
    const duration_ms = Date.now() - startTime;
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/teaching-cohort-sync] Fatal', message);
    return NextResponse.json({ ok: false, error: message, duration_ms }, { status: 500 });
  }
}
