/**
 * GET /api/hr/recruitment/candidates/<id>/salary-suggestion
 *
 * The suggested starting salary for one candidate, for the "Suggested salary"
 * box in the Propose Package dialog. A suggestion only: nothing is written
 * here or anywhere this route reaches.
 *
 * TWO LOCKS, as on GET /api/hr/payroll/salary-suggestions. The route checks
 * `hr.payroll.salary.view` (the key that already shows pay on Employee
 * Salaries), and the read then goes through
 * hr_candidate_salary_suggestion_inputs(), which checks the key again in
 * Postgres and returns the candidate only when the caller may already see them.
 * The candidate id is the only thing taken from the request.
 *
 * allowApiKey: false — an API key skips withAuth's permission check, and this
 * is a browser screen's data, not an integration endpoint.
 *
 * What is returned: the worked-out lines, the figure, "above band by" and the
 * reasons. Never the band or the rule. Pinned by
 * __tests__/hr/candidate-salary-suggestion-route.test.ts.
 *
 * READ ONLY. GET is the only verb.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  CandidateSalarySuggestionAccessError,
  CandidateSalarySuggestionNotFoundError,
  CandidateSalarySuggestionService,
} from '@/lib/services/hr/pay-bands/candidate-salary-suggestion-service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withAuth(
  async (_request, auth, context) => {
    await connection();
    const id = (await context?.params)?.id ?? '';
    if (!UUID.test(id)) {
      return NextResponse.json({ error: 'This is not a candidate id.' }, { status: 400 });
    }
    try {
      const body = await CandidateSalarySuggestionService.forCandidate(auth.supabase, id);
      return NextResponse.json(body);
    } catch (err: unknown) {
      if (err instanceof CandidateSalarySuggestionAccessError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      if (err instanceof CandidateSalarySuggestionNotFoundError) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      console.error('[HR Candidate Salary Suggestion] read error:', err);
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
