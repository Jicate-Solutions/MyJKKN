/**
 * POST /api/internal-marks/attendance-insight/thresholds
 *
 * Save a college's insight thresholds (the "line" for struggling / anomaly).
 * Write access is enforced by the internal_marks_insight_config RLS policy
 * (super-admin / admin / internal-marks editor scoped to the institution) — this
 * route does not re-implement that check, it relies on the row-level policy, so
 * a caller without permission gets a policy error and a 403.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function clampPct(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < 0 || i > 100) return null;
  return i;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const institutionId: string | undefined = body?.institutionId;
    if (!institutionId) {
      return NextResponse.json({ error: 'institutionId is required.' }, { status: 400 });
    }

    const attendance = clampPct(body?.attendance);
    const anomaly = clampPct(body?.anomaly_cia);
    const struggling = clampPct(body?.struggling_cia);
    if (attendance === null || anomaly === null || struggling === null) {
      return NextResponse.json(
        { error: 'All three lines must be whole numbers between 0 and 100.' },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('internal_marks_insight_config')
      .upsert(
        {
          institution_id: institutionId,
          attendance_threshold: attendance,
          anomaly_cia_threshold: anomaly,
          struggling_cia_threshold: struggling,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'institution_id' },
      )
      .select('attendance_threshold, anomaly_cia_threshold, struggling_cia_threshold')
      .maybeSingle();

    if (error) {
      // RLS denial or constraint error.
      const status = /row-level security|permission|policy/i.test(error.message) ? 403 : 500;
      console.error('[attendance-insight/thresholds] save error:', error);
      return NextResponse.json(
        {
          error:
            status === 403
              ? 'You do not have permission to change this college’s line.'
              : 'Failed to save the line.',
        },
        { status },
      );
    }

    return NextResponse.json({
      saved: true,
      thresholds: {
        attendance: data?.attendance_threshold ?? attendance,
        anomaly_cia: data?.anomaly_cia_threshold ?? anomaly,
        struggling_cia: data?.struggling_cia_threshold ?? struggling,
      },
    });
  } catch (error) {
    console.error('[attendance-insight/thresholds] error:', error);
    return NextResponse.json({ error: 'Failed to save the line.' }, { status: 500 });
  }
}
