export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { requireBugAdmin } from '../../clusters/_auth';

/**
 * GET /api/bug-reports/auto-resolve/status
 *
 * Gate state for the Groups-tab strip: is auto-resolve enabled, how many
 * CLEAN human-approved resolutions have been earned toward the required
 * track record, and whether the circuit breaker has suspended it.
 * Read-only; the policy itself flips only by human decision.
 */
export async function GET() {
  await connection();
  try {
    const { response } = await requireBugAdmin();
    if (response) return response;

    const adminSupabase = createAdminClient();
    const { data, error } = await (adminSupabase as any).rpc('fn_bug_auto_resolve_status');
    if (error) throw error;
    return NextResponse.json({ status: data ?? null });
  } catch (error) {
    logger.error('bug-reports/auto-resolve', 'Status read failed', error);
    return NextResponse.json({ error: 'Failed to read auto-resolve status' }, { status: 500 });
  }
}
