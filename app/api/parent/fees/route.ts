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
  getLearnerHiddenYearIds,
  isBillLearnerVisible,
  isBillYearLearnerVisible,
} from '@/lib/utils/billing/learner-visibility';
import {
  academicYearKey,
  earlierDuesFor,
  earlierDuesShortReason,
} from '@/lib/utils/billing/academic-year-payment-order';
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
          'id, bill_description, total_amount, final_amount, balance_amount, due_date, status, item_category_id, payment_date, academic_year_id'
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
    // Same reason: the advance-year window (past + current + ONE next year) is
    // enforced by RLS for students, so it has to be re-applied here.
    const hiddenYearIds = await getLearnerHiddenYearIds(
      db,
      (billRows ?? []).map((b) => b.academic_year_id)
    );

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

    // Academic-year names + start dates — for the year-order lock below.
    const yearIds = [
      ...new Set((billRows ?? []).map((b) => b.academic_year_id).filter(Boolean)),
    ] as string[];
    const yearNames = new Map<string, string>();
    const yearStarts = new Map<string, string>();
    if (yearIds.length) {
      const { data: years } = await db
        .from('academic_years')
        .select('id, academic_year_name, start_date')
        .in('id', yearIds);
      for (const y of years ?? []) {
        if (y.academic_year_name) yearNames.set(y.id, String(y.academic_year_name).trim());
        if (y.start_date) yearStarts.set(y.id, y.start_date);
      }
    }

    // Outstanding only: positive remaining balance, learner-visible categories only.
    const outstanding = (billRows ?? [])
      .filter((b) => isBillLearnerVisible(b.item_category_id, hiddenCategoryIds))
      .filter((b) => isBillYearLearnerVisible(b.academic_year_id, hiddenYearIds))
      .map((b) => ({
        row: b,
        balance: num(b.balance_amount ?? b.final_amount ?? b.total_amount),
        yearKey: academicYearKey(
          b.academic_year_id ? yearStarts.get(b.academic_year_id) : null,
          b.due_date
        ),
      }))
      .filter((b) => b.balance > 0);

    // Year order (oldest first): a bill cannot be paid while a bill of an older
    // academic year has a balance (the /pay route refuses it; this explains it).
    const yearOrderRows = outstanding.map((b) => ({
      year: (b.row.academic_year_id && yearNames.get(b.row.academic_year_id)) || 'Other',
      yearKey: b.yearKey,
      balance: b.balance,
      status: b.row.status,
    }));

    const bills: FeeBill[] = outstanding.map(({ row: b, balance, yearKey }) => {
      const olderDues = earlierDuesFor(yearOrderRows, yearKey);
      return {
        id: b.id,
        description: b.bill_description ?? 'Fee',
        categoryName: b.item_category_id ? categoryNames.get(b.item_category_id) : undefined,
        totalAmount: num(b.final_amount ?? b.total_amount),
        balanceAmount: balance,
        dueDate: b.due_date ?? undefined,
        status: b.status ?? undefined,
        academicYear: b.academic_year_id ? yearNames.get(b.academic_year_id) : undefined,
        payLockedReason:
          olderDues.years.length > 0 ? earlierDuesShortReason(olderDues) : undefined,
      };
    });

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
