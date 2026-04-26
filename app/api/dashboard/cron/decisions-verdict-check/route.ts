import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Vercel Cron: daily at 04:00 UTC (09:30 IST), runs after super-admin-digest
// (03:03 UTC). Grades any director_decisions whose outcome_due_at has elapsed
// and status='pending_outcome'.
//
// SECURITY: Bearer auth via CRON_SECRET. Calls fn_decision_outcome_check()
// (SECURITY DEFINER, search_path=public) which runs the whitelisted metric
// resolver. Verdict notifications are emitted via fn_create_dashboard_work_item
// with idempotency key 'decision_verdict:<id>:<YYYY-MM-DD>' so re-running the
// cron the same day is safe.
//
// References: specs/decisions-spec.md §5 + §9 Sprint 1.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JOB_NAME = 'decisions-verdict-check';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: 'Missing Supabase env vars' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ranAt = new Date().toISOString();

  try {
    const { data, error } = await supabase.rpc('fn_decision_outcome_check');

    if (error) {
      console.error(`[cron:${JOB_NAME}] RPC error:`, error);
      return NextResponse.json(
        { ok: false, job: JOB_NAME, ran_at: ranAt, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      job: JOB_NAME,
      ran_at: ranAt,
      graded: data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron:${JOB_NAME}] Exception:`, err);
    return NextResponse.json(
      { ok: false, job: JOB_NAME, ran_at: ranAt, error: message },
      { status: 500 }
    );
  }
}
