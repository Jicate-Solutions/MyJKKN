export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/compensation — compensation analytics.
 *
 * Query params:
 *   institution_id=<uuid>   (optional)
 *   period_year=<number>    (optional; defaults to latest distributed period)
 *   period_month=<number>   (optional)
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { CompensationService } from '@/lib/services/hr/compensation-service';
import type { CompensationFilters } from '@/types/hr-compensation';

export const GET = withAuth(async (request, auth) => {
  await connection();
  try {
    const supabase = auth.supabase;
    const url = new URL(request.url);

    const filters: CompensationFilters = {};
    const institutionId = url.searchParams.get('institution_id');
    const periodYear = url.searchParams.get('period_year');
    const periodMonth = url.searchParams.get('period_month');

    if (institutionId) filters.institution_id = institutionId;
    if (periodYear) filters.period_year = parseInt(periodYear, 10);
    if (periodMonth) filters.period_month = parseInt(periodMonth, 10);

    const payload = await CompensationService.getCompensationAnalytics(
      supabase,
      filters
    );

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error('[HR Compensation] Error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Failed to load compensation analytics' },
      { status: 500 }
    );
  }
}, { requiredPermission: 'read' });
