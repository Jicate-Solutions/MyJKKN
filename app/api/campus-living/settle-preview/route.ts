export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { buildSettlePracticeRun } from '@/lib/services/campus-living/settle-preview-service';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * GET /api/campus-living/settle-preview
 *
 * The settle-then-bill PRACTICE RUN — every bill the process would send, and
 * not one row written. There is deliberately no POST/PUT/DELETE on this route:
 * running the real thing is a Director decision taken elsewhere, never a
 * request to this endpoint.
 *
 * Runs on the caller's own session (RLS applies) and is gated on
 * campus_living.fees.config — the same permission fn_settle_bill_close itself
 * demands, so nobody can read the practice run who could not authorize the run.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: canConfigureFees } = await supabase.rpc('user_has_permission', {
      permission_name: 'campus_living.fees.config',
    });
    if (canConfigureFees !== true) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const report = await buildSettlePracticeRun(supabase as never);
    return NextResponse.json(report);
  } catch (error) {
    logger.error('campus-living/settle-preview', 'Practice-run report failed', error);
    return NextResponse.json(
      { error: 'The practice run could not be worked out. Nothing was billed or changed.' },
      { status: 500 }
    );
  }
}
