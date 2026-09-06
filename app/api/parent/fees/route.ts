import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveParentScope,
  assertLearnerAccess,
  parentErrorResponse,
} from '@/lib/utils/parent-access';
import { admissionNumber, fullName, type MatchedLearner } from '@/lib/utils/parent-identifier';
import {
  getLearnerHiddenCategoryIds,
  isBillLearnerVisible,
} from '@/lib/utils/billing/learner-visibility';
import type { FeeBill, FeeReceipt, FeesResponse } from '@/types/parent-portal';

export const runtime = 'nodejs';

const num = (v: unknown) => (v == null ? 0 : Number(v));

/** GET /api/parent/fees?learnerId=… — outstanding bills + receipts for a learner. */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const learnerId = new URL(req.url).searchParams.get('learnerId') ?? '';
    assertLearnerAccess(scope, learnerId);

    const db = createServiceRoleClient();

    const { data: learnerRow } = await db
      .from('learners_profiles')
      .select(
        'id, first_name, last_name, application_id, roll_number, register_number, ' +
          'father_mobile, mother_mobile, student_email, college_email, institution_id'
      )
      .eq('id', learnerId)
      .maybeSingle();

    const learner = learnerRow as unknown as MatchedLearner | null;
    if (!learner) return NextResponse.json({ error: 'Learner not found' }, { status: 404 });

    const [{ data: billRows }, { data: receiptRows }] = await Promise.all([
      db
        .from('billing_student_bills')
        .select(
          'id, bill_description, total_amount, final_amount, balance_amount, due_date, status, item_category_id, payment_date'
        )
        .eq('student_id', learnerId)
        .order('due_date', { ascending: true }),
      db
        .from('billing_receipts')
        .select('id, receipt_number, payment_amount, payment_paid_date, payment_mode, payment_reference_number')
        .eq('student_id', learnerId)
        .order('payment_paid_date', { ascending: false }),
    ]);

    // Categories flagged hidden from learners. This route runs on the SERVICE
    // ROLE client, so the student RLS policies do not apply here — this filter
    // is the only thing keeping a hidden fee off the parent portal.
    const hiddenCategoryIds = await getLearnerHiddenCategoryIds(db);

    // Resolve category names.
    const categoryIds = [
      ...new Set((billRows ?? []).map((b) => b.item_category_id).filter(Boolean)),
    ] as string[];
    const categoryNames = new Map<string, string>();
    if (categoryIds.length) {
      const { data: cats } = await db
        .from('billing_categories')
        .select('id, category_name')
        .in('id', categoryIds);
      for (const c of cats ?? []) categoryNames.set(c.id, c.category_name);
    }

    // Outstanding only: positive remaining balance, learner-visible categories only.
    const bills: FeeBill[] = (billRows ?? [])
      .filter((b) => isBillLearnerVisible(b.item_category_id, hiddenCategoryIds))
      .map((b) => {
        const balance = b.balance_amount ?? b.final_amount ?? b.total_amount;
        return {
          id: b.id,
          description: b.bill_description ?? 'Fee',
          categoryName: b.item_category_id ? categoryNames.get(b.item_category_id) : undefined,
          totalAmount: num(b.final_amount ?? b.total_amount),
          balanceAmount: num(balance),
          dueDate: b.due_date ?? undefined,
          status: b.status ?? undefined,
        };
      })
      .filter((b) => b.balanceAmount > 0);

    const receipts: FeeReceipt[] = (receiptRows ?? []).map((r) => ({
      id: r.id,
      receiptNumber: r.receipt_number ?? '',
      amount: num(r.payment_amount),
      paidDate: r.payment_paid_date ?? undefined,
      mode: r.payment_mode ?? undefined,
      reference: r.payment_reference_number ?? undefined,
    }));

    const body: FeesResponse = {
      learnerName: fullName(learner),
      admissionNumber: admissionNumber(learner),
      primaryMobile: learner.father_mobile ?? learner.mother_mobile ?? undefined,
      email: learner.student_email ?? learner.college_email ?? undefined,
      totalDue: bills.reduce((sum, b) => sum + b.balanceAmount, 0),
      currency: 'INR',
      bills,
      receipts,
    };

    return NextResponse.json(body);
  } catch (err) {
    return parentErrorResponse(err);
  }
}
