export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/salary-revisions/my-outcomes — "my pay is changing".
 *
 * RULING 5: a team member is told about a salary revision ONLY after the
 * Director's yes, and never about a no. hr_salary_revision_outcomes holds one
 * row per yes; its RLS returns only the caller's own. There is nothing about
 * who asked, why, or any refusal in it. Any signed-in person may ask: RLS is
 * what limits the answer to their own.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { SalaryRevisionService } from '@/lib/services/hr/salary-revision/salary-revision-service';
import { errorResponse } from '@/lib/services/hr/salary-revision/route-helpers';

export const GET = withAuth(
  async (_request, auth) => {
    await connection();
    try {
      return NextResponse.json({ outcomes: await SalaryRevisionService.myOutcomes(auth.supabase) });
    } catch (err) {
      return errorResponse(err, 'my outcomes');
    }
  },
  { requiredPermission: 'read', allowApiKey: false },
);
