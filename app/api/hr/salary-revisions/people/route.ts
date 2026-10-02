export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/salary-revisions/people            the people the caller may ask for,
 *                                                with their pay now (ruling 8)
 * GET /api/hr/salary-revisions/people?staffId=   one of them, with #4119's
 *                                                suggested figure (or "rule not set")
 *
 * THIS IS WHERE A PRINCIPAL OR AN HOD SEES PAY. fn_hr_salary_revision_people()
 * returns only their own college (principal) or department (HOD); Employee
 * Salaries stays on hr.payroll.salary.view. The suggested figure is worked out
 * here on the server; the band and the rule never leave it.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { SalaryRevisionService } from '@/lib/services/hr/salary-revision/salary-revision-service';
import { UUID, errorResponse } from '@/lib/services/hr/salary-revision/route-helpers';

export const GET = withAuth(
  async (request, auth) => {
    await connection();
    const staffId = request.nextUrl.searchParams.get('staffId');
    try {
      if (staffId !== null) {
        if (!UUID.test(staffId)) {
          return NextResponse.json({ error: 'Choose a person first.' }, { status: 400 });
        }
        return NextResponse.json(await SalaryRevisionService.person(auth.supabase, staffId));
      }
      return NextResponse.json({ people: await SalaryRevisionService.people(auth.supabase) });
    } catch (err) {
      return errorResponse(err, 'people');
    }
  },
  { requirePermission: 'hr.payroll.salary_revision.ask', requiredPermission: 'read', allowApiKey: false },
);
