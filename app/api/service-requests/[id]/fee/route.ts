// app/api/service-requests/[id]/fee/route.ts
//
// The fee attached to a service request's fee step (e.g. the Rs. 200 ID Card
// Fee before a duplicate card is printed).
//
// Reading it also RECONCILES it: a request parked on its fee step with no bill
// gets one raised, and a request whose bill has been paid is moved to the next
// step. That is what makes the flow advance after an online payment or a cash
// receipt — whoever opens the request next (the requester, accounts, the ID
// card desk) triggers it. The reconciliation is idempotent.
//
// Who may call: anyone who can already see the request. That is proven by
// reading the request through the caller's own session (RLS) first; only then
// is the service-role reconciliation run.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthSession, createServerSupabaseClient } from '@/lib/supabase/server';
import { ServiceRequestFeeService } from '@/lib/services/service-requests/service-request-fee-service';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = (await createServerSupabaseClient()) as any;
    const { data: visible } = await supabase
      .from('service_requests')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!visible) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    const fee = await ServiceRequestFeeService.sync(id, session.user.id);
    return NextResponse.json(fee);
  } catch (error) {
    console.error('[service-requests/fee] GET error:', error);
    return NextResponse.json({ error: 'Could not load the fee for this request' }, { status: 500 });
  }
}
