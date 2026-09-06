import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveParentScope,
  assertLearnerAccess,
  parentErrorResponse,
} from '@/lib/utils/parent-access';
import { PaymentGatewayService } from '@/lib/services/billing/payment-gateway-service';
import {
  getLearnerHiddenCategoryIds,
  isBillLearnerVisible,
} from '@/lib/utils/billing/learner-visibility';
import { parentPortalBaseUrl } from '@/lib/utils/parent-url';
import type { PayPayload } from '@/types/parent-portal';

export const runtime = 'nodejs';

/**
 * POST /api/parent/fees/pay — initiate an HDFC/Razorpay session for a learner's
 * bills. Reuses PaymentGatewayService with a service-role client (parents have
 * no Supabase session). The shared /api/billing/payment/callback verifies the
 * payment server-side and writes the receipt — unchanged.
 */
export async function POST(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: PayPayload;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { learnerId, billIds, billAmounts } = body;
    assertLearnerAccess(scope, learnerId);
    if (!Array.isArray(billIds) || billIds.length === 0) {
      return NextResponse.json({ error: 'No bills selected' }, { status: 400 });
    }

    const db = createServiceRoleClient();

    // Defense: every bill must belong to THIS learner before we initiate.
    const { data: owned } = await db
      .from('billing_student_bills')
      .select('id, item_category_id')
      .eq('student_id', learnerId)
      .in('id', billIds);
    const ownedIds = new Set((owned ?? []).map((b) => b.id));
    if (billIds.some((id) => !ownedIds.has(id))) {
      return NextResponse.json({ error: 'One or more bills are not for this learner.' }, { status: 403 });
    }

    // Defense: a bill in a learner-hidden category is never offered on the
    // parent portal, so a request for one can only be a hand-crafted id. This
    // route is service-role, so nothing else would stop it.
    const hiddenCategoryIds = await getLearnerHiddenCategoryIds(db);
    if (
      (owned ?? []).some(
        (b) => !isBillLearnerVisible(b.item_category_id, hiddenCategoryIds)
      )
    ) {
      return NextResponse.json(
        { error: 'One or more bills cannot be paid online. Please contact the accounts office.' },
        { status: 403 }
      );
    }

    const base = parentPortalBaseUrl(); // e.g. http://localhost:3000/parent
    const result = await PaymentGatewayService.createPaymentSession(
      {
        student_id: learnerId,
        bill_ids: billIds,
        bill_amounts: billAmounts,
        return_url: `${base}/fees?payment=success`,
        cancel_url: `${base}/fees?payment=cancelled`,
      },
      db // service-role client — bypasses RLS for the parent context
    );

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error?.message || 'Could not start payment' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      paymentUrl: result.data.payment_url,
      transactionId: result.data.transaction_id,
      provider: result.data.provider,
    });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
