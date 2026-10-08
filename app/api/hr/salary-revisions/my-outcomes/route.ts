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

// 7 Oct 2026: `targets` carries, per request, the held part of the raise and
// its monthly numbers (read-only; never the principal's flag notes).

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { SalaryRevisionService } from '@/lib/services/hr/salary-revision/salary-revision-service';
import { errorResponse } from '@/lib/services/hr/salary-revision/route-helpers';

export const GET = withAuth(
  async (_request, auth) => {
    await connection();
    try {
      const outcomes = await SalaryRevisionService.myOutcomes(auth.supabase);
      const targets = await SalaryRevisionService.myTargets(
        auth.supabase,
        outcomes.map((o) => o.request_id ?? ''),
      );
      return NextResponse.json({ outcomes, targets });
    } catch (err) {
      return errorResponse(err, 'my outcomes');
    }
  },
  { requiredPermission: 'read', allowApiKey: false },
);
