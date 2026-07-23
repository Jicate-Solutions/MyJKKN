export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/faculty-activity — Faculty Active-Use Ratio KPI.
 *
 * Returns the percentage of active staff with at least one HR action
 * (leave application, attendance regularization, document upload) in
 * the last 30 days. Target: 60% by 90 days (strategic lock T7.1).
 *
 * Query params:
 *   institution_id=<uuid>  (optional; scopes to a single institution)
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { FacultyActivityService } from '@/lib/services/hr/faculty-activity-service';

export const GET = withAuth(async (request, auth) => {
  await connection();
  try {
    const supabase = auth.supabase;
    const url = new URL(request.url);
    const institution_id = url.searchParams.get('institution_id') ?? undefined;

    const result = await FacultyActivityService.getActiveUseRatio(supabase, {
      institution_id,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('[hr/faculty-activity] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
});
