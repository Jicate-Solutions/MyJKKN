/**
 * /learners/my-bills
 *
 * Student self-service fee view (read-only). Server-rendered shell — mirrors the
 * my-profile / my-marks gating:
 *   1. auth                       — must be signed in
 *   2. role gate                  — `student` role + a linked learner_id, else → '/'
 *   3. lifecycle gate             — StudentValidationService (active / graduated)
 * Bills + receipts are fetched here with the USER SESSION client; the
 * "Students can view their own bills/receipts" RLS policies scope every row to
 * the signed-in learner, so no service-role access is involved.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import type { MyBill, MyBillsData, MyReceipt, BillingCategoryKind } from '@/types/billing';
import { MyBillsClient } from './_components/my-bills-client';

export const metadata = {
  title: 'My Bills',
  description: 'View your fee bills, balances, and payment history',
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

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
    .select('first_name, last_name, roll_number, institution:institution_id ( name )')
    .eq('id', learnerId)
    .maybeSingle();

  // Bills + receipts (RLS scopes to this learner).
  const [{ data: billRows }, { data: receiptRows }] = await Promise.all([
    supabase
      .from('billing_student_bills')
      .select(
        'id, bill_description, total_amount, final_amount, balance_amount, due_date, status, item_category_id'
      )
      .eq('student_id', learnerId)
      .order('due_date', { ascending: true }),
    supabase
      .from('billing_receipts')
      .select(
        'id, receipt_number, payment_amount, payment_paid_date, payment_mode, payment_reference_number'
      )
      .eq('student_id', learnerId)
      .order('payment_paid_date', { ascending: false }),
  ]);

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

  // Outstanding only — positive remaining balance.
  const bills: MyBill[] = (billRows ?? [])
    .map((b) => {
      const balance = b.balance_amount ?? b.final_amount ?? b.total_amount;
      return {
        id: b.id,
        description: b.bill_description ?? 'Fee',
        categoryName: b.item_category_id ? categoryName.get(b.item_category_id) ?? null : null,
        kind: b.item_category_id ? categoryKind.get(b.item_category_id) ?? null : null,
        totalAmount: num(b.final_amount ?? b.total_amount),
        balanceAmount: num(balance),
        dueDate: b.due_date ?? null,
        status: b.status ?? null,
      };
    })
    .filter((b) => b.balanceAmount > 0);

  const receipts: MyReceipt[] = (receiptRows ?? []).map((r) => ({
    id: r.id,
    receiptNumber: r.receipt_number ?? '',
    amount: num(r.payment_amount),
    paidDate: r.payment_paid_date ?? null,
    mode: r.payment_mode ?? null,
    reference: r.payment_reference_number ?? null,
  }));

  const data: MyBillsData = {
    totalDue: bills.reduce((sum, b) => sum + b.balanceAmount, 0),
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
        <MyBillsClient
          data={data}
          learnerName={learnerName}
          rollNumber={learnerRow?.roll_number ?? ''}
          institutionName={institutionName}
        />
      </div>
    </ContentLayout>
  );
}
