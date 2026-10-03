/**
 * POST /api/hr/attendance/regularizations/[id]/notify
 *
 * HR staff harness (2026-10-01), duty A3. Regularisation requests are written
 * from the browser (RLS-gated), so the browser calls this right after a
 * submit, approve or reject. The request's CURRENT state decides what goes
 * out — never the caller:
 *   pending            → "awaiting approval" to the approvers
 *   approved/rejected  → the decision (with the reject reason) to the requester
 *
 * Every notice is claimed once in hr_duty_notices, so a double click, a retry
 * or the daily /api/cron/hr/duty-notices backstop can never send it twice.
 * If this call never happens (tab closed), the daily run sends it instead.
 *
 * Gate: signed in, AND able to see the request under your own session (the
 * hr_attendance_regs_select policy) — the requester and the approvers can,
 * nobody else can prod notices about someone else's request.
 */

export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { notifyRegularizationEvent } from '@/lib/services/hr/duty-notices/dispatch';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid request id' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: visible, error: readErr } = await supabase
      .from('hr_attendance_regularizations')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!visible) {
      return NextResponse.json(
        { success: false, error: 'You do not have access to this request.' },
        { status: 404 },
      );
    }

    const result = await notifyRegularizationEvent(createServiceRoleClient(), id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[hr/attendance/regularizations/:id/notify] error', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
