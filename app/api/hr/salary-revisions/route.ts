export const dynamic = 'force-dynamic';

/**
 * /api/hr/salary-revisions — the Director's 16 rulings of 29 Sep 2026.
 *
 * GET ?view=mine|college|director|all  requests the caller may see, each with
 *     #4119's suggested figure beside it and — on the Director's list only —
 *     #4103's "above the band by ₹X" warning.
 * POST { staffId, monthlyGross, reason }  ask for a revision.
 *
 * The page key (hr.payroll.salary_revision.ask) only opens the door. WHO may ask for
 * WHOM, and what each person may see, is decided in Postgres by
 * fn_hr_salary_revision_propose / fn_hr_salary_revision_list from the caller's
 * own keys and college/department (20270519090000). The Director's list
 * additionally needs the Director (the database says so, not this file).
 *
 * allowApiKey: false — a browser screen's data, not an integration endpoint.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { SalaryRevisionService, type ListView } from '@/lib/services/hr/salary-revision/salary-revision-service';
import { UUID, errorResponse } from '@/lib/services/hr/salary-revision/route-helpers';

const VIEWS: ListView[] = ['mine', 'college', 'director', 'all'];

export const GET = withAuth(
  async (request, auth) => {
    await connection();
    const view = (request.nextUrl.searchParams.get('view') ?? 'all') as ListView;
    if (!VIEWS.includes(view)) {
      return NextResponse.json({ error: 'Unknown list.' }, { status: 400 });
    }
    try {
      // The Director's list first writes any approved raise whose start date
      // has come (the daily schedule does the same; this is the backstop).
      if (view === 'director') {
        await SalaryRevisionService.applyDue(auth.supabase).catch((e: unknown) =>
          console.warn('[HR Salary Revisions] apply step on page load failed:', e),
        );
      }
      const requests = await SalaryRevisionService.list(auth.supabase, view);
      return NextResponse.json({ requests });
    } catch (err) {
      return errorResponse(err, 'list');
    }
  },
  { requirePermission: 'hr.payroll.salary_revision.ask', requiredPermission: 'read', allowApiKey: false },
);

export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json().catch(() => null);
    const staffId = typeof body?.staffId === 'string' ? body.staffId : '';
    const monthlyGross = typeof body?.monthlyGross === 'number' ? body.monthlyGross : NaN;
    const reason = typeof body?.reason === 'string' ? body.reason : '';
    if (!UUID.test(staffId)) {
      return NextResponse.json({ error: 'Choose a person first.' }, { status: 400 });
    }
    if (!Number.isFinite(monthlyGross) || monthlyGross <= 0) {
      return NextResponse.json({ error: 'Write the new monthly pay, in rupees.' }, { status: 400 });
    }
    if (!reason.trim()) {
      return NextResponse.json({ error: 'Write a reason. The Director reads it before he decides.' }, { status: 400 });
    }
    try {
      const id = await SalaryRevisionService.propose(auth.supabase, { staffId, monthlyGross, reason });
      return NextResponse.json({ id }, { status: 201 });
    } catch (err) {
      return errorResponse(err, 'ask');
    }
  },
  { requirePermission: 'hr.payroll.salary_revision.ask', requiredPermission: 'write', allowApiKey: false },
);
