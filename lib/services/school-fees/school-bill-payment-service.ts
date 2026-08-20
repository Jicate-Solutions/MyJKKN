// lib/services/school-fees/school-bill-payment-service.ts
//
// Read side of the School Bill Payment counter (/billing/school-fees/collect).
//
// This service does NOT write payments. Recording a payment goes through the
// existing BillingReceiptService.createBillingReceipt — the same path the
// college counter and the online gateway callback already use, so receipt
// numbering, receipt_items allocation and the bill status/balance transition
// have exactly one implementation.
//
// What makes a bill a SCHOOL bill: billing_student_bills.school_fee_plan_id IS
// NOT NULL. Those rows are written only by the school_fee_generate RPC. Nothing
// else in the app reads that column, so filtering on it cannot pick up a
// college, hostel or campus-living bill.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { BillingReceiptService } from '@/lib/services/billing/receipts/billing-receipt-service';
import type { BillingReceipt } from '@/types/billing-schedule';
import type {
  SchoolLearnerForPayment,
  SchoolOutstandingBill,
  SchoolPaymentHistoryRow,
  SchoolSettledBill,
  SchoolBillReceiptLink,
} from '@/types/school-fees';
import type { SchoolReceiptLine } from '@/lib/utils/billing/school-receipt-pdf';

/** Statuses that can still be receipted against. Mirrors BillingReceiptService. */
const RECEIPTABLE_STATUSES = ['unpaid', 'partially_paid', 'overdue'] as const;

/**
 * The other side of RECEIPTABLE_STATUSES: nothing is left to collect.
 *
 * A partially_paid bill is NOT here — it still owes money, so it belongs on
 * the Outstanding tab where it can be paid. Splitting it across both tabs
 * would double-count it in the header counts.
 */
const SETTLED_STATUSES = ['paid'] as const;

/** Search needs enough characters to be selective; below this we return []. */
export const SCHOOL_SEARCH_MIN_CHARS = 2;

/** Hard cap on search rows. The counter picks one learner; it never browses. */
const SEARCH_LIMIT = 25;

const num = (v: unknown) => Number(v ?? 0);

/**
 * A bill's true outstanding amount.
 *
 * balance_amount is NULL on legacy rows, where final_amount is still fully
 * owed. Every college surface applies this same fallback (see
 * billing-receipt-service getOutstandingBillsForBulk and the receipts/new
 * page), so the school counter must not diverge or the two screens would
 * disagree about what a learner owes.
 */
export function billBalance(bill: { balance_amount?: number | null; final_amount?: number | null }): number {
  const balance = num(bill.balance_amount);
  return balance > 0 ? balance : num(bill.final_amount);
}

export class SchoolBillPaymentService {
  /**
   * Find school learners by roll number, register number or name.
   *
   * Scoped to ONE school + academic year, so the counter can never pull up a
   * learner from another institution or a stale year. Server-side search with
   * a hard limit — schools run to thousands of learners and the old habit of
   * loading them all into the browser does not survive that.
   */
  static async searchLearners(
    institutionId: string,
    academicYearId: string,
    query: string,
  ): Promise<SchoolLearnerForPayment[]> {
    const term = query.trim();
    if (term.length < SCHOOL_SEARCH_MIN_CHARS) return [];

    const supabase = createClientSupabaseClient();

    // Escape PostgREST's or() delimiters. A raw comma would split the filter
    // list and a paren would unbalance it, turning a search for "Kumar, A"
    // into a malformed query rather than a no-match.
    const safe = term.replace(/[,()]/g, ' ').trim();
    if (!safe) return [];

    const { data, error } = await supabase
      .from('learners_profiles')
      .select(
        `
        id,
        first_name,
        last_name,
        roll_number,
        register_number,
        student_mobile,
        father_name,
        student_photo_url,
        lifecycle_status,
        institution_id,
        academic_year_id,
        program:programs!program_id(id, program_name),
        section:sections!section_id(id, section_name)
        `,
      )
      .eq('institution_id', institutionId)
      .eq('academic_year_id', academicYearId)
      .eq('lifecycle_status', 'active')
      .or(
        [
          `roll_number.ilike.%${safe}%`,
          `register_number.ilike.%${safe}%`,
          `first_name.ilike.%${safe}%`,
          `last_name.ilike.%${safe}%`,
        ].join(','),
      )
      .order('roll_number', { ascending: true })
      .limit(SEARCH_LIMIT);

    if (error) throw new Error(error.message || 'Learner search failed');
    return (data ?? []).map(normaliseLearner);
  }

  /**
   * Resolve a learner scanned from a QR code.
   *
   * The QR payload may carry the learner UUID, the roll number or the register
   * number depending on which card generation produced it, so all three are
   * tried. Still scoped to the chosen school + year: a card from another
   * campus must not open a payment session here.
   */
  static async findByScannedCode(
    institutionId: string,
    academicYearId: string,
    code: string,
  ): Promise<SchoolLearnerForPayment | null> {
    const raw = code.trim();
    if (!raw) return null;

    const supabase = createClientSupabaseClient();
    const select = `
      id,
      first_name,
      last_name,
      roll_number,
      register_number,
      student_mobile,
      father_name,
      student_photo_url,
      lifecycle_status,
      institution_id,
      academic_year_id,
      program:programs!program_id(id, program_name),
      section:sections!section_id(id, section_name)
    `;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);

    let queryBuilder = supabase
      .from('learners_profiles')
      .select(select)
      .eq('institution_id', institutionId)
      .eq('academic_year_id', academicYearId);

    queryBuilder = isUuid
      ? queryBuilder.eq('id', raw)
      : queryBuilder.or(`roll_number.eq.${raw},register_number.eq.${raw}`);

    const { data, error } = await queryBuilder.limit(1);
    if (error) throw new Error(error.message || 'Could not resolve the scanned code');
    if (!data || data.length === 0) return null;
    return normaliseLearner(data[0]);
  }

  /**
   * Outstanding SCHOOL bills for one learner, oldest term first.
   *
   * Ordered by due_date so the counter settles the oldest demand first, which
   * is what the fine/late-charge logic assumes.
   */
  static async getOutstandingBills(
    learnerId: string,
    academicYearId: string,
  ): Promise<SchoolOutstandingBill[]> {
    const supabase = createClientSupabaseClient();

    // 'as any': types/supabase.ts predates migration 20260813100005, so the
    // generated row type still lacks school_fee_plan_id / term_number /
    // fine_effective_date and rejects both the select and the .not() filter.
    // Same cast the college billing services already use for this reason.
    const { data, error } = await (supabase as any)
      .from('billing_student_bills')
      .select(
        `
        id,
        student_id,
        institution_id,
        academic_year_id,
        item_category_id,
        bill_description,
        due_date,
        final_amount,
        balance_amount,
        status,
        term_number,
        fine_effective_date,
        school_fee_plan_id,
        item_category:billing_categories(id, category_name)
        `,
      )
      .eq('student_id', learnerId)
      .eq('academic_year_id', academicYearId)
      // The school discriminator. Set only by school_fee_generate.
      .not('school_fee_plan_id', 'is', null)
      .in('status', [...RECEIPTABLE_STATUSES])
      .order('due_date', { ascending: true })
      .order('term_number', { ascending: true });

    if (error) throw new Error(error.message || 'Could not load outstanding bills');

    return (data ?? []).map((b: Record<string, unknown>) => {
      const category = Array.isArray(b.item_category) ? b.item_category[0] : b.item_category;
      const finalAmount = num(b.final_amount);
      const balance = billBalance(b as { balance_amount?: number | null; final_amount?: number | null });
      return {
        id: String(b.id),
        student_id: String(b.student_id),
        institution_id: String(b.institution_id),
        item_category_id: (b.item_category_id as string) ?? null,
        category_name: (category as { category_name?: string } | null)?.category_name ?? null,
        bill_description: (b.bill_description as string) ?? null,
        due_date: (b.due_date as string) ?? null,
        term_number: b.term_number == null ? null : Number(b.term_number),
        fine_effective_date: (b.fine_effective_date as string) ?? null,
        final_amount: finalAmount,
        // Derived, not stored: what has already been settled on this row.
        paid_amount: Math.max(finalAmount - balance, 0),
        balance_amount: balance,
        status: String(b.status),
      };
    });
  }

  /**
   * Fully-settled SCHOOL bills for one learner — the counter's "Paid" tab.
   *
   * Two reads rather than a join: PostgREST cannot embed billing_receipt_items
   * from billing_student_bills (there is no FK exposed in that direction), and
   * the receipt link is what turns "paid" into "paid on this date, against this
   * receipt number" — which is the only reason a clerk opens this tab.
   *
   * paid_amount is final_amount - balance_amount read LITERALLY. billBalance()
   * is deliberately not used: its legacy fallback treats a zero balance as
   * "nothing paid yet" and would report every settled bill as fully owed.
   */
  static async getSettledBills(
    learnerId: string,
    academicYearId: string,
  ): Promise<SchoolSettledBill[]> {
    const supabase = createClientSupabaseClient();

    // 'as any': same generated-types gap as getOutstandingBills.
    const { data, error } = await (supabase as any)
      .from('billing_student_bills')
      .select(
        `
        id,
        item_category_id,
        bill_description,
        due_date,
        final_amount,
        balance_amount,
        status,
        term_number,
        school_fee_plan_id,
        item_category:billing_categories(id, category_name)
        `,
      )
      .eq('student_id', learnerId)
      .eq('academic_year_id', academicYearId)
      .not('school_fee_plan_id', 'is', null)
      .in('status', [...SETTLED_STATUSES])
      .order('due_date', { ascending: true })
      .order('term_number', { ascending: true });

    if (error) throw new Error(error.message || 'Could not load paid bills');

    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) return [];

    const receiptsByBill = await SchoolBillPaymentService.receiptLinksFor(
      rows.map((b) => String(b.id)),
    );

    return rows.map((b) => {
      const category = Array.isArray(b.item_category) ? b.item_category[0] : b.item_category;
      const finalAmount = num(b.final_amount);
      const receipts = receiptsByBill.get(String(b.id)) ?? [];
      return {
        id: String(b.id),
        item_category_id: (b.item_category_id as string) ?? null,
        category_name: (category as { category_name?: string } | null)?.category_name ?? null,
        bill_description: (b.bill_description as string) ?? null,
        due_date: (b.due_date as string) ?? null,
        term_number: b.term_number == null ? null : Number(b.term_number),
        final_amount: finalAmount,
        paid_amount: Math.max(finalAmount - num(b.balance_amount), 0),
        status: String(b.status),
        receipts,
        last_paid_date: receipts[0]?.receipt_date ?? null,
      };
    });
  }

  /** bill_id -> the receipts that settled it, newest first. */
  private static async receiptLinksFor(
    billIds: string[],
  ): Promise<Map<string, SchoolBillReceiptLink[]>> {
    const byBill = new Map<string, SchoolBillReceiptLink[]>();
    if (billIds.length === 0) return byBill;

    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('billing_receipt_items')
      .select(
        `
        bill_id,
        amount_paid,
        receipt:billing_receipts!inner(id, receipt_number, receipt_date)
        `,
      )
      .in('bill_id', billIds);

    // A missing receipt link is not worth failing the tab over — the bill is
    // still settled, it just cannot show which receipt did it.
    if (error) return byBill;

    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const receipt = (Array.isArray(row.receipt) ? row.receipt[0] : row.receipt) as
        | Record<string, unknown>
        | undefined;
      if (!receipt) continue;
      const billId = String(row.bill_id);
      const list = byBill.get(billId) ?? [];
      list.push({
        receipt_id: String(receipt.id),
        receipt_number: String(receipt.receipt_number ?? ''),
        receipt_date: (receipt.receipt_date as string) ?? null,
        amount_paid: num(row.amount_paid),
      });
      byBill.set(billId, list);
    }

    for (const list of byBill.values()) {
      list.sort((a, b) => (b.receipt_date ?? '').localeCompare(a.receipt_date ?? ''));
    }
    return byBill;
  }

  /** Receipts already raised for this learner in this year, newest first. */
  static async getPaymentHistory(
    learnerId: string,
    academicYearId: string,
  ): Promise<SchoolPaymentHistoryRow[]> {
    const supabase = createClientSupabaseClient();

    // billing_receipts has no academic_year_id of its own — a receipt is tied
    // to a year only through the bills it settled. Resolve that set first,
    // then read the receipts that reference them.
    const { data: bills, error: billErr } = await (supabase as any)
      .from('billing_student_bills')
      .select('id')
      .eq('student_id', learnerId)
      .eq('academic_year_id', academicYearId)
      .not('school_fee_plan_id', 'is', null);

    if (billErr) throw new Error(billErr.message || 'Could not load payment history');
    const billIds = (bills ?? []).map((b: { id: string }) => b.id);
    if (billIds.length === 0) return [];

    // 'as any': date_of_credit was added by 20260909000000 and is not yet in
    // the generated types.
    const { data, error } = await (supabase as any)
      .from('billing_receipt_items')
      .select(
        `
        amount_paid,
        receipt:billing_receipts!inner(
          id,
          receipt_number,
          receipt_date,
          payment_mode,
          payment_reference_number,
          payment_amount,
          date_of_credit
        )
        `,
      )
      .in('bill_id', billIds);

    if (error) throw new Error(error.message || 'Could not load payment history');

    // One receipt can settle several of this learner's bills, so the join
    // returns it once per line. Collapse to one row per receipt and sum only
    // the lines that belong to THIS year's school bills — a receipt that also
    // settled a prior-year bill must not report its full header amount here.
    const byReceipt = new Map<string, SchoolPaymentHistoryRow>();
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const receipt = (Array.isArray(row.receipt) ? row.receipt[0] : row.receipt) as
        | Record<string, unknown>
        | undefined;
      if (!receipt) continue;
      const id = String(receipt.id);
      const existing = byReceipt.get(id);
      if (existing) {
        existing.amount_allocated += num(row.amount_paid);
        continue;
      }
      byReceipt.set(id, {
        receipt_id: id,
        receipt_number: String(receipt.receipt_number ?? ''),
        receipt_date: (receipt.receipt_date as string) ?? null,
        payment_mode: String(receipt.payment_mode ?? ''),
        payment_reference_number: (receipt.payment_reference_number as string) ?? null,
        date_of_credit: (receipt.date_of_credit as string) ?? null,
        receipt_total: num(receipt.payment_amount),
        amount_allocated: num(row.amount_paid),
      });
    }

    return [...byReceipt.values()].sort((a, b) =>
      String(b.receipt_date ?? '').localeCompare(String(a.receipt_date ?? '')),
    );
  }

  /**
   * Rehydrate an already-issued receipt so it can be re-printed.
   *
   * Reads the receipt lines back out of billing_receipt_items rather than
   * reconstructing them from the learner's CURRENT bills — by reprint time
   * those balances have moved on, and a receipt must always show what was
   * actually collected on the day.
   *
   * Creates nothing: reprinting must never produce a second payment.
   */
  static async getReceiptForReprint(
    receiptId: string,
  ): Promise<{ receipt: BillingReceipt; lines: SchoolReceiptLine[] }> {
    const receipt = await BillingReceiptService.getBillingReceipt(receiptId);

    const lines: SchoolReceiptLine[] = (receipt.receipt_items ?? []).map((item) => {
      // Via `unknown`: the embed is typed StudentBill, which does not declare
      // term_number (missing from the generated types, see getOutstandingBills)
      // nor the `category` alias this particular select uses.
      const bill = item.bill as unknown as
        | {
            bill_description?: string | null;
            due_date?: string | null;
            category?: { category_name?: string | null } | null;
            term_number?: number | null;
          }
        | undefined;
      const category =
        bill?.category?.category_name || bill?.bill_description || 'Fee';
      return {
        category,
        termLabel: bill?.term_number ? `Term ${bill.term_number}` : null,
        billReference: item.bill_id ? item.bill_id.slice(0, 8).toUpperCase() : null,
        dueDate: bill?.due_date ?? null,
        amount: num(item.amount_paid),
      };
    });

    return { receipt, lines };
  }
}

function normaliseLearner(row: Record<string, unknown>): SchoolLearnerForPayment {
  const program = Array.isArray(row.program) ? row.program[0] : row.program;
  const section = Array.isArray(row.section) ? row.section[0] : row.section;
  return {
    id: String(row.id),
    first_name: (row.first_name as string) ?? '',
    last_name: (row.last_name as string) ?? '',
    roll_number: (row.roll_number as string) ?? null,
    register_number: (row.register_number as string) ?? null,
    student_mobile: (row.student_mobile as string) ?? null,
    father_name: (row.father_name as string) ?? null,
    student_photo_url: (row.student_photo_url as string) ?? null,
    institution_id: String(row.institution_id),
    academic_year_id: String(row.academic_year_id ?? ''),
    // `programs` renders as "Class" for schools — see the school-label adapter.
    class_name: (program as { program_name?: string } | null)?.program_name ?? null,
    section_name: (section as { section_name?: string } | null)?.section_name ?? null,
  };
}
