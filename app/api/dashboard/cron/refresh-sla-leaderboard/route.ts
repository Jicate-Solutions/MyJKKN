import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Vercel Cron: every 5 minutes — refreshes v_dashboard_sla_daily materialized view.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JOB_NAME = 'sla-leaderboard-refresh';

export async function GET(request: NextRequest) {
  // 1) Auth check — Vercel Cron auto-injects Bearer ${CRON_SECRET}
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // 2) Service-role client — bypasses RLS, no cookies
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
    const { data, error } = await supabase.rpc('fn_refresh_dashboard_views', {
      p_which: 'sla',
    });

    if (error) {
      console.error(`[cron:${JOB_NAME}] RPC error:`, error);
      return NextResponse.json(
        { ok: false, job: JOB_NAME, ran_at: ranAt, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, job: JOB_NAME, ran_at: ranAt, result: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron:${JOB_NAME}] Exception:`, err);
    return NextResponse.json(
      { ok: false, job: JOB_NAME, ran_at: ranAt, error: message },
      { status: 500 }
    );
  }
}
