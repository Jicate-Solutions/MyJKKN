export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { ServiceRequestApprovalService } from '@/lib/services/service-requests/service-request-approval-service';

/**
 * The approver's own decisions — how many requests they approved and rejected.
 * Feeds the "N by you" captions on the hub's Approved / Rejected cards.
 *
 * What is still waiting on them is not counted here: the hub takes that from
 * the Pending Approvals tab's own total, so the two can never disagree
 * (BUG-006007).
 */
export async function GET() {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decided = await ServiceRequestApprovalService.getMyApprovalActionCounts(
      session.user.id
    );

    return NextResponse.json(decided);
  } catch (error) {
    console.error('[service-requests/approvals/my-stats] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
