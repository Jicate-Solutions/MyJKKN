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
  getLearnerHiddenYearIds,
  isBillLearnerVisible,
  isBillYearLearnerVisible,
} from '@/lib/utils/billing/learner-visibility';
import { findEarlierYearDuesBlock } from '@/lib/utils/billing/academic-year-payment-order';
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
      .select('id, item_category_id, academic_year_id')
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

    // Defense: advance-year window. A bill more than one academic year ahead is
    // never listed on the parent portal, so a request for one is a hand-crafted
    // id (or a stale page) — refuse it before a gateway session is created.
    const hiddenYearIds = await getLearnerHiddenYearIds(
      db,
      (owned ?? []).map((b) => b.academic_year_id)
    );
    if (
      (owned ?? []).some(
        (b) => !isBillYearLearnerVisible(b.academic_year_id, hiddenYearIds)
      )
    ) {
      return NextResponse.json(
        { error: 'One or more bills cannot be paid online. Please contact the accounts office.' },
        { status: 403 }
      );
    }

    // Year order (oldest first): a bill cannot be paid while a bill of an older
    // academic year still has a balance — clear those first (separate checkout).
    const yearOrder = await findEarlierYearDuesBlock(db, {
      studentId: learnerId,
      billIds,
      hiddenCategoryIds,
    });
    if (yearOrder.blocked) {
      return NextResponse.json({ error: yearOrder.message }, { status: 409 });
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
