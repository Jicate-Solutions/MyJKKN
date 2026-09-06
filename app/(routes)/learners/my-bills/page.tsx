/**
 * /learners/my-bills
 *
 * Student self-service fee view (read-only). Server-rendered shell — mirrors the
 * my-profile / my-marks gating:
 *   1. auth                       — must be signed in
 *   2. role gate                  — `student` role + a linked learner_id, else → '/'
 *   3. lifecycle gate             — StudentValidationService (active / graduated)
 * Bills + receipts are fetched here with the USER SESSION client; the
 * "Students can view their own bills/receipts" RLS policies (plus the
 * receipt-items / refunds / bill-academic-years student policies added
 * 2026-07-03) scope every row to the signed-in learner — no service-role access.
 *
 * Grouping: bills carry no semester column, so the page groups by the academic
 * year the bill was raised for (billing here is annual/term-based). Bills with
 * no academic_year_id fall back to the Indian June–May year inferred from
 * due_date; receipts inherit the year of the bills they settled.
 *
 * Learner visibility: categories flagged `visible_to_learners = false` are
 * dropped here — bill rows, the Total Due / Total Billed tiles and the Pay
 * Online path all lose them in one step. Receipts still show (the learner did
 * pay), with their hidden lines collapsed into one unnamed "Other fees" row so
 * the receipt total still ties. RLS enforces the same rule on the bill rows;
 * this filter is what keeps the derived totals honest.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import type {
  MyBill,
  MyBillLateCharge,
  MyBillLateChargeMonth,
  MyBillsData,
  MyReceipt,
  MyReceiptItem,
  BillingCategoryKind,
} from '@/types/billing';
import {
  collapseHiddenReceiptItems,
  getLearnerHiddenCategoryIds,
  isBillLearnerVisible,
  LEARNER_HIDDEN_LINE_LABEL,
} from '@/lib/utils/billing/learner-visibility';
import { isOverdue } from './_components/shared';
import { MyBillsClient } from './_components/my-bills-client';

export const metadata = {
  title: 'My Bills',
  description: 'View your fee bills, balances, and payment history',
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

/** Indian academic year (June–May) inferred from a date string. */
function inferAcademicYear(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  return d.getMonth() + 1 >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// Bills in these states are dead paper — never owed, never "outstanding".
const INACTIVE_BILL_STATUSES = new Set(['cancelled', 'superseded']);

export default async function MyBillsPage() {
  const supabase = await createClient();

  // 1) Authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // 2) Role gate — students only (never super admin / staff).
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, learner_id')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'student' || !profile.learner_id) {
    redirect('/');
  }
  const learnerId = profile.learner_id as string;

  // 3) Lifecycle gate (active / graduated).
  const validation = await StudentValidationService.validateStudentAccess(user.id);
  if (!validation.allowed) {
    redirect(`/auth/login?reason=${validation.reason}`);
  }

  // Header context (own row — RLS-scoped).
  const { data: learnerRow } = await supabase
    .from('learners_profiles')
    .select('first_name, last_name, roll_number, college_email, institution_id, institution:institution_id ( name )')
    .eq('id', learnerId)
    .maybeSingle();

  // Bills + receipts (RLS scopes to this learner) + the learner-hidden category
  // ids. The bill RLS policies already exclude hidden categories; re-applying
  // the rule here keeps the derived totals correct and covers the receipt lines,
  // which are deliberately NOT restricted at the DB level (see the helper).
  const [{ data: billRows }, { data: receiptRows }, hiddenCategoryIds] =
    await Promise.all([
    supabase
      .from('billing_student_bills')
      .select(
        'id, bill_description, total_amount, final_amount, balance_amount, due_date, status, item_category_id, academic_year_id'
      )
      .eq('student_id', learnerId)
      .order('due_date', { ascending: true }),
    supabase
      .from('billing_receipts')
      .select(
        'id, receipt_number, receipt_date, payment_amount, payment_paid_date, payment_mode, payment_reference_number, payer_name, payment_remarks'
      )
      .eq('student_id', learnerId)
      .order('payment_paid_date', { ascending: false }),
    getLearnerHiddenCategoryIds(supabase),
  ]);

  // Bills fetched here whose category is flagged hidden. Once the student RLS
  // policies are applied these normally never arrive (the DB filters them out
  // first) — the check stays so the page is correct on its own and the derived
  // totals below stay honest either way.
  const hiddenByCategory = new Set(
    (billRows ?? [])
      .filter((b) => !isBillLearnerVisible(b.item_category_id, hiddenCategoryIds))
      .map((b) => b.id)
  );

  const receiptIds = (receiptRows ?? []).map((r) => r.id);

  // Receipt line items (bill links) + processed refunds — one query each.
  const [{ data: itemRows }, { data: refundRows }] = await Promise.all([
    receiptIds.length
      ? supabase
          .from('billing_receipt_items')
          .select('receipt_id, bill_id, amount_paid')
          .in('receipt_id', receiptIds)
      : Promise.resolve({ data: [] as never[] }),
    receiptIds.length
      ? supabase
          .from('billing_refunds')
          .select('receipt_id, refund_amount, refund_date, refund_category, refund_method')
          .eq('approval_status', 'processed')
          .in('receipt_id', receiptIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  // Every bill a receipt line points at that this learner may not see — either
  // RLS withheld the row (so it never reached billRows) or its category is
  // flagged hidden. Both cases collapse into the same unnamed receipt line, so
  // the receipt still totals to what was actually paid.
  const visibleBillIds = new Set((billRows ?? []).map((b) => b.id));
  const hiddenBillIds = new Set<string>(hiddenByCategory);
  for (const it of itemRows ?? []) {
    if (!visibleBillIds.has(it.bill_id)) hiddenBillIds.add(it.bill_id);
  }

  // Resolve category name + fee head for each bill.
  const categoryIds = [
    ...new Set((billRows ?? []).map((b) => b.item_category_id).filter(Boolean)),
  ] as string[];
  const categoryName = new Map<string, string>();
  const categoryKind = new Map<string, BillingCategoryKind>();
  if (categoryIds.length) {
    const { data: cats } = await supabase
      .from('billing_categories')
      .select('id, category_name, kind')
      .in('id', categoryIds);
    for (const c of cats ?? []) {
      categoryName.set(c.id, c.category_name);
      if (c.kind) categoryKind.set(c.id, c.kind as BillingCategoryKind);
    }
  }

  // Resolve academic year names for the years the bills reference.
  const yearIds = [
    ...new Set((billRows ?? []).map((b) => b.academic_year_id).filter(Boolean)),
  ] as string[];
  const yearName = new Map<string, string>();
  if (yearIds.length) {
    const { data: years } = await supabase
      .from('academic_years')
      .select('id, academic_year_name')
      .in('id', yearIds);
    for (const y of years ?? []) {
      // Names in the DB carry trailing-space duplicates ("2025-2026 ") — trim.
      if (y.academic_year_name) yearName.set(y.id, String(y.academic_year_name).trim());
    }
  }

  // Academic-year label for every fetched bill (including inactive ones, so a
  // receipt that settled a since-superseded bill still lands in the right group).
  const billYear = new Map<string, { year: string; inferred: boolean }>();
  const billMeta = new Map<
    string,
    { description: string; dueDate: string | null; finalAmount: number | null }
  >();
  for (const b of billRows ?? []) {
    const stored = b.academic_year_id ? yearName.get(b.academic_year_id) : undefined;
    const inferred = stored ? null : inferAcademicYear(b.due_date);
    billYear.set(b.id, { year: stored ?? inferred ?? 'Other', inferred: !stored });
    // Hidden bills keep an entry (receipt lines look them up) but never expose
    // their real description or amount, in case a line escapes the collapse.
    const isHidden = hiddenByCategory.has(b.id);
    billMeta.set(b.id, {
      description: isHidden
        ? LEARNER_HIDDEN_LINE_LABEL
        : b.bill_description ||
          (b.item_category_id ? categoryName.get(b.item_category_id) : null) ||
          'Fee',
      dueDate: isHidden ? null : b.due_date ?? null,
      finalAmount:
        isHidden || b.final_amount == null ? null : num(b.final_amount),
    });
  }

  // All ACTIVE, learner-visible bills — client derives outstanding (balance > 0)
  // and analytics. Dropping hidden bills here is what removes them from the
  // list, the Total Due / Total Billed tiles, the analytics tab AND the Pay
  // Online path (no row → no Pay button) in a single step.
  const bills: MyBill[] = (billRows ?? [])
    .filter((b) => !hiddenByCategory.has(b.id))
    .filter((b) => !INACTIVE_BILL_STATUSES.has((b.status ?? '').toLowerCase()))
    .map((b) => {
      const total = num(b.final_amount ?? b.total_amount);
      const balance = num(b.balance_amount ?? b.final_amount ?? b.total_amount);
      const y = billYear.get(b.id)!;
      return {
        id: b.id,
        description: b.bill_description ?? 'Fee',
        categoryName: b.item_category_id ? categoryName.get(b.item_category_id) ?? null : null,
        kind: b.item_category_id ? categoryKind.get(b.item_category_id) ?? null : null,
        totalAmount: total,
        balanceAmount: balance,
        paidAmount: Math.max(0, total - balance),
        dueDate: b.due_date ?? null,
        status: b.status ?? null,
        academicYear: y.year,
        yearInferred: y.inferred,
      };
    });

  // Late payment charge (platform-wide mechanism — OFF by default). While the
  // billing.late_charge.enabled policy is false (today's state) this whole
  // block resolves to null and the page renders NOTHING new. The RPCs may not
  // exist until the late-charge migration is applied — any error also reads as
  // "off" — so this page is deploy-safe in either order. The month-by-month
  // figures come from fn_late_charge_derivation (the canonical formula in the
  // database); nothing here re-implements the arithmetic.
  let lateCharges: Record<string, MyBillLateCharge> | null = null;
  // 'as never': fn_late_charge_derivation is not in the generated DB types
  // until the (Director-gated) migration is applied — pre-apply idiom, same as
  // yoy-trajectory-service.ts. fn_get_policy_bool gets the same cast so this
  // file typechecks identically before and after a types regeneration.
  const { data: lateChargeEnabled, error: lateChargeEnabledError } = await supabase.rpc(
    'fn_get_policy_bool' as never,
    { p_key: 'billing.late_charge.enabled', p_default: false } as never
  );
  if (!lateChargeEnabledError && (lateChargeEnabled as unknown as boolean | null) === true) {
    const overdueBills = bills.filter((b) => b.balanceAmount > 0 && isOverdue(b.dueDate));
    const derivations = await Promise.all(
      overdueBills.map((b) =>
        supabase.rpc('fn_late_charge_derivation' as never, { p_bill_id: b.id } as never)
      )
    );
    const map: Record<string, MyBillLateCharge> = {};
    overdueBills.forEach((b, i) => {
      const { data, error } = derivations[i];
      const rows = data as unknown as
        | {
            month_number: number;
            period_start: string;
            period_end: string;
            opening_base: number;
            rate_percent: number;
            month_charge: number;
            cumulative_charge: number;
          }[]
        | null;
      if (error || !rows || rows.length === 0) return; // grace window / no access
      const months: MyBillLateChargeMonth[] = rows.map((r) => ({
        monthNumber: Number(r.month_number),
        periodStart: r.period_start,
        periodEnd: r.period_end,
        openingBase: num(r.opening_base),
        ratePercent: num(r.rate_percent),
        monthCharge: num(r.month_charge),
        cumulativeCharge: num(r.cumulative_charge),
      }));
      const last = months[months.length - 1];
      map[b.id] = {
        months: months.length,
        ratePercent: last.ratePercent,
        chargeAmount: last.cumulativeCharge,
        totalWithCharge: b.balanceAmount + last.cumulativeCharge,
        derivation: months,
      };
    });
    if (Object.keys(map).length > 0) lateCharges = map;
  }

  // Receipt line items grouped by receipt.
  const itemsByReceipt = new Map<string, MyReceiptItem[]>();
  for (const it of itemRows ?? []) {
    const meta = billMeta.get(it.bill_id);
    const list = itemsByReceipt.get(it.receipt_id) ?? [];
    list.push({
      billId: it.bill_id,
      billDescription: meta?.description ?? 'Fee',
      billDueDate: meta?.dueDate ?? null,
      billAmount: meta?.finalAmount ?? null,
      amountPaid: num(it.amount_paid),
    });
    itemsByReceipt.set(it.receipt_id, list);
  }

  const refundsByReceipt = new Map<string, { date: string | null; category: string | null; method: string | null; amount: number }[]>();
  for (const r of refundRows ?? []) {
    const list = refundsByReceipt.get(r.receipt_id) ?? [];
    list.push({
      date: r.refund_date ?? null,
      category: r.refund_category ?? null,
      method: r.refund_method ?? null,
      amount: num(r.refund_amount),
    });
    refundsByReceipt.set(r.receipt_id, list);
  }

  const receipts: MyReceipt[] = (receiptRows ?? []).map((r) => {
    const allItems = itemsByReceipt.get(r.id) ?? [];
    const refunds = refundsByReceipt.get(r.id) ?? [];
    // A receipt belongs to the year of the bills it settled; a receipt with no
    // line items (legacy) falls back to the year of its payment date. Resolved
    // from the UNCOLLAPSED items so a receipt that only settled hidden bills
    // still lands in the right academic-year group.
    const linkedYear = allItems
      .map((it) => billYear.get(it.billId)?.year)
      .find((y): y is string => Boolean(y));
    // Hidden lines merge into one unnamed row — the receipt total still equals
    // what the learner actually paid.
    const items = collapseHiddenReceiptItems(allItems, hiddenBillIds);
    return {
      id: r.id,
      receiptNumber: r.receipt_number ?? '',
      receiptDate: r.receipt_date ?? null,
      amount: num(r.payment_amount),
      paidDate: r.payment_paid_date ?? null,
      mode: r.payment_mode ?? null,
      reference: r.payment_reference_number ?? null,
      payerName: r.payer_name ?? null,
      remarks: r.payment_remarks ?? null,
      academicYear: linkedYear ?? inferAcademicYear(r.payment_paid_date) ?? 'Other',
      items,
      refundedAmount: refunds.reduce((sum, f) => sum + f.amount, 0),
      refunds,
    };
  });

  const totalPaid = receipts.reduce((sum, r) => sum + r.amount - r.refundedAmount, 0);

  const data: MyBillsData = {
    totalDue: bills.reduce((sum, b) => sum + (b.balanceAmount > 0 ? b.balanceAmount : 0), 0),
    totalBilled: bills.reduce((sum, b) => sum + b.totalAmount, 0),
    totalPaid,
    currency: 'INR',
    bills,
    receipts,
  };

  const learnerName = learnerRow
    ? [learnerRow.first_name, learnerRow.last_name].filter(Boolean).join(' ')
    : '';
  const institutionName = (learnerRow?.institution as { name?: string } | null)?.name ?? '';

  return (
    <ContentLayout title='My Bills'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners Management' },
          { label: 'My Bills' },
        ]}
      />
      <div className='space-y-6 mt-6'>
        <Suspense fallback={null}>
          <MyBillsClient
            data={data}
            lateCharges={lateCharges}
            learnerId={learnerId}
            learnerName={learnerName}
            rollNumber={learnerRow?.roll_number ?? ''}
            collegeEmail={learnerRow?.college_email ?? ''}
            institutionId={learnerRow?.institution_id ?? null}
            institutionName={institutionName}
          />
        </Suspense>
      </div>
    </ContentLayout>
  );
}
