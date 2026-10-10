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
 * Session only (the caller's own cookies), like every handler beside it: this
 * is a browser screen's data, not an integration endpoint.
 *
 * What is returned: the worked-out lines, the figure, "above band by" and the
 * reasons. Never the band or the rule. Pinned by
 * __tests__/hr/candidate-salary-suggestion-route.test.ts.
 *
 * READ ONLY. GET is the only verb.
 */

import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  CandidateSalarySuggestionAccessError,
  CandidateSalarySuggestionNotFoundError,
  CandidateSalarySuggestionService,
} from '@/lib/services/hr/pay-bands/candidate-salary-suggestion-service';
import { getErrorMessage } from '@/lib/utils';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUIRED_KEY = 'hr.payroll.salary.view';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {}
        },
      },
    },
  );
}

/**
 * The SAME rule as the database function and the page's box: a super admin, or
 * a holder of the key (user_has_permission already lets a super admin through).
 * NOT is_admin(): the function does not admit a plain admin without the key,
 * so the route must not either, or the box would show and then fail to load.
 */
async function holds(supabase: Awaited<ReturnType<typeof getClient>>, key: string): Promise<boolean> {
  const [{ data: isSuperAdmin }, { data: canDo }] = await Promise.all([
    supabase.rpc('is_super_admin'),
    supabase.rpc('user_has_permission', { permission_name: key }),
  ]);
  return isSuperAdmin === true || canDo === true;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id ?? '')) {
    return NextResponse.json({ error: 'This is not a candidate id.' }, { status: 400 });
  }
  try {
    const supabase = await getClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await holds(supabase, REQUIRED_KEY))) {
      return NextResponse.json(
        {
          error: `A suggested salary is shown only to people who can see salaries (${REQUIRED_KEY}).`,
        },
        { status: 403 },
      );
    }
    const body = await CandidateSalarySuggestionService.forCandidate(supabase, id);
    return NextResponse.json(body);
  } catch (err: unknown) {
    if (err instanceof CandidateSalarySuggestionAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof CandidateSalarySuggestionNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error('[HR Candidate Salary Suggestion] read error:', err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
