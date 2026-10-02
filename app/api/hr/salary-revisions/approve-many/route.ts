export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/salary-revisions/approve-many   { ids: string[] }
 *
 * RULING 15: the Director ticks several requests and approves them together,
 * each at the amount asked. All or nothing — if any ticked request is no longer
 * waiting for him, none is approved (409) and the list must be reloaded.
 * Only the Director: fn_hr_salary_revision_director_approve_many() refuses
 * everyone else in Postgres.
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { SalaryRevisionService } from '@/lib/services/hr/salary-revision/salary-revision-service';
import { UUID, errorResponse } from '@/lib/services/hr/salary-revision/route-helpers';

export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json().catch(() => null);
    const ids: unknown[] = Array.isArray(body?.ids) ? body.ids : [];
    const clean = ids.filter((x): x is string => typeof x === 'string' && UUID.test(x));
    if (clean.length === 0 || clean.length !== ids.length) {
      return NextResponse.json({ error: 'Tick at least one request.' }, { status: 400 });
    }
    try {
      const approved = await SalaryRevisionService.approveMany(auth.supabase, clean);
      return NextResponse.json({ approved });
    } catch (err) {
      return errorResponse(err, 'approve many');
    }
  },
  { requirePermission: 'hr.payroll.salary_revision.approve', requiredPermission: 'write', allowApiKey: false },
);
