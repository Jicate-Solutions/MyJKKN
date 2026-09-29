export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/payroll/salary-suggestions?staffId=<uuid>
 *
 * A suggested revised salary for ONE person, for the "Suggest" action on
 * Employee Salaries. A suggestion only: nothing is written here or anywhere
 * this route reaches. Under the Director's ruling of 18 September 2026 the band
 * is reference material and a raise is his separate decision.
 *
 * TWO LOCKS, as on GET /api/hr/payroll/pay-bands. The route checks
 * `hr.payroll.salary.view` — the same key as Employee Salaries, so exactly the
 * people who already see this person's pay — and the read then goes through
 * hr_salary_suggestion_inputs(), which checks the key again in Postgres and
 * returns the person only when their college passes role_has_institution_access()
 * for the caller. The staff id is the only thing taken from the request; which
 * colleges count is the database's decision.
 *
 * allowApiKey: false — an API key skips withAuth's permission check, and this is
 * a browser screen's data, not an integration endpoint.
 *
 * READ ONLY. There is no POST, PUT, PATCH or DELETE here.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  SalarySuggestionAccessError,
  SalarySuggestionNotFoundError,
  SalarySuggestionService,
} from '@/lib/services/hr/pay-bands/salary-suggestion-service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withAuth(
  async (request, auth) => {
    await connection();
    const staffId = request.nextUrl.searchParams.get('staffId') ?? '';
    if (!UUID.test(staffId)) {
      return NextResponse.json({ error: 'Choose a person first (staffId is missing or not an id).' }, { status: 400 });
    }
    try {
      const body = await SalarySuggestionService.forPerson(auth.supabase, staffId);
      return NextResponse.json(body);
    } catch (err: unknown) {
      if (err instanceof SalarySuggestionAccessError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      if (err instanceof SalarySuggestionNotFoundError) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      console.error('[HR Salary Suggestion] read error:', err);
      const message = err instanceof Error ? err.message : 'Failed to work out a suggestion';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  },
  {
    requirePermission: 'hr.payroll.salary.view',
    requiredPermission: 'read',
    allowApiKey: false,
  },
);
