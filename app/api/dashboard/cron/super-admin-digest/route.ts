import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Vercel Cron: daily at 03:03 UTC (08:33 IST) — rolls up per-item dashboard
// notifications into one digest per category per super_admin. Replaces the
// per-item fanout that was flooding Director/CAIO inboxes (252+191+25/day).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JOB_NAME = 'super-admin-digest';

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
    const { data, error } = await supabase.rpc('fn_generate_super_admin_daily_digest');

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
      digests_created: data,
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
