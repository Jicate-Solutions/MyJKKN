// hooks/school-fees/use-school-bill-payment.ts
//
// State + money maths for the School Bill Payment counter.
//
// The allocation rule is the whole point of this hook: the operator selects
// bills and may pay a PART of any of them, so "what is being paid" is a map of
// bill_id -> amount, not a single total. Every guard below exists to stop that
// map from producing a receipt that over-collects.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

import { QUERY_CONFIG } from '@/lib/config/query-config';
import { BillingReceiptService } from '@/lib/services/billing/receipts/billing-receipt-service';
import { SchoolBillPaymentService } from '@/lib/services/school-fees/school-bill-payment-service';
import type { CreateReceiptDto, PaymentMode } from '@/types/billing-schedule';
import type { SchoolLearnerForPayment, SchoolOutstandingBill } from '@/types/school-fees';

export const SCHOOL_PAYMENT_KEYS = {
  bills: (learnerId?: string, yearId?: string) =>
    ['school-bill-payment', 'bills', learnerId, yearId] as const,
  history: (learnerId?: string, yearId?: string) =>
    ['school-bill-payment', 'history', learnerId, yearId] as const,
};

/** Rounded to paise. Float drift across many rows must never reach the DB. */
const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface PaymentFormState {
  mode: PaymentMode;
  referenceNumber: string;
  transactionDate: string;
  dateOfCredit: string;
  bankName: string;
  branch: string;
  remitterName: string;
  payerName: string;
  payerContact: string;
  remarks: string;
}

const today = () => new Date().toISOString().split('T')[0];

export function emptyPaymentForm(): PaymentFormState {
  return {
    mode: 'cash',
    referenceNumber: '',
    transactionDate: today(),
    dateOfCredit: '',
    bankName: '',
    branch: '',
    remitterName: '',
    payerName: '',
    payerContact: '',
    remarks: '',
  };
}

export function useSchoolBillPayment(
  learner: SchoolLearnerForPayment | null,
  academicYearId: string,
) {
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [form, setForm] = useState<PaymentFormState>(emptyPaymentForm);

  const billsQuery = useQuery({
    queryKey: SCHOOL_PAYMENT_KEYS.bills(learner?.id, academicYearId),
    queryFn: () => SchoolBillPaymentService.getOutstandingBills(learner!.id, academicYearId),
    enabled: Boolean(learner?.id && academicYearId),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  const historyQuery = useQuery({
    queryKey: SCHOOL_PAYMENT_KEYS.history(learner?.id, academicYearId),
    queryFn: () => SchoolBillPaymentService.getPaymentHistory(learner!.id, academicYearId),
    enabled: Boolean(learner?.id && academicYearId),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  const bills = useMemo(() => billsQuery.data ?? [], [billsQuery.data]);

  /** Reset selection and form — used on learner change and after a payment. */
  const reset = useCallback(() => {
    setSelected({});
    setAmounts({});
    setForm(emptyPaymentForm());
  }, []);

  /**
   * Toggling a bill ON defaults its amount to the FULL balance. That is what a
   * counter clerk means 95% of the time; typing a smaller number is the
   * deliberate exception, not the default.
   */
  const toggleBill = useCallback(
    (bill: SchoolOutstandingBill, on: boolean) => {
      setSelected((prev) => ({ ...prev, [bill.id]: on }));
      setAmounts((prev) => {
        const next = { ...prev };
        if (on) next[bill.id] = money(bill.balance_amount);
        else delete next[bill.id];
        return next;
      });
    },
    [],
  );

  const selectAll = useCallback(
    (on: boolean) => {
      if (!on) {
        setSelected({});
        setAmounts({});
        return;
      }
      const nextSelected: Record<string, boolean> = {};
      const nextAmounts: Record<string, number> = {};
      for (const bill of bills) {
        if (bill.balance_amount <= 0) continue;
        nextSelected[bill.id] = true;
        nextAmounts[bill.id] = money(bill.balance_amount);
      }
      setSelected(nextSelected);
      setAmounts(nextAmounts);
    },
    [bills],
  );

  /**
   * Re-anchor the amount map to the balances every time the bills change.
   *
   * The map is keyed by bill id and outlives a refetch, but the balances under
   * it do not: pay 7,000 of a 7,200 bill and the list comes back with a 200
   * balance while Pay Now still holds the 7,000 that was just collected. The
   * summary then reports a negative "balance after payment" and the operator
   * is one click from re-collecting money the learner already paid.
   *
   * So: no amount may exceed its bill's current balance, and a bill that is
   * now settled leaves the selection entirely. Deliberate part-payments below
   * the balance are left alone — clamping is downward only.
   */
  useEffect(() => {
    if (bills.length === 0) return;
    const balanceOf = new Map(bills.map((b) => [b.id, money(b.balance_amount)]));

    setSelected((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [id, on] of Object.entries(prev)) {
        const balance = balanceOf.get(id);
        // Settled, or gone from the list — either way there is nothing to pay.
        if (on && (balance === undefined || balance <= 0)) {
          changed = true;
          continue;
        }
        next[id] = on;
      }
      return changed ? next : prev;
    });

    setAmounts((prev) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [id, amount] of Object.entries(prev)) {
        const balance = balanceOf.get(id);
        if (balance === undefined || balance <= 0) {
          changed = true;
          continue;
        }
        const clamped = Math.min(amount, balance);
        if (clamped !== amount) changed = true;
        next[id] = clamped;
      }
      // Returning `prev` unchanged is what stops this from looping: a new
      // object identity every run would re-trigger nothing here, but it would
      // churn every consumer of `amounts` on each refetch.
      return changed ? next : prev;
    });
  }, [bills]);

  /**
   * Clamp on the way IN, not at submit time. If the field could hold an
   * over-payment even briefly, the summary would show a total the server will
   * later refuse — the operator should never see a number that cannot happen.
   */
  const setBillAmount = useCallback(
    (bill: SchoolOutstandingBill, raw: number) => {
      const clamped = Math.min(Math.max(money(raw), 0), money(bill.balance_amount));
      setAmounts((prev) => ({ ...prev, [bill.id]: clamped }));
    },
    [],
  );

  const selectedBills = useMemo(
    () => bills.filter((b) => selected[b.id] && b.balance_amount > 0),
    [bills, selected],
  );

  const summary = useMemo(() => {
    const totalBilled = selectedBills.reduce((s, b) => s + b.final_amount, 0);
    const previouslyPaid = selectedBills.reduce((s, b) => s + b.paid_amount, 0);
    const outstanding = selectedBills.reduce((s, b) => s + b.balance_amount, 0);
    const payingNow = selectedBills.reduce((s, b) => s + (amounts[b.id] ?? 0), 0);
    return {
      count: selectedBills.length,
      totalBilled: money(totalBilled),
      previouslyPaid: money(previouslyPaid),
      outstanding: money(outstanding),
      payingNow: money(payingNow),
      balanceAfter: money(outstanding - payingNow),
      // Whole-year context, so the clerk can see what is left beyond this payment.
      yearOutstanding: money(bills.reduce((s, b) => s + b.balance_amount, 0)),
    };
  }, [selectedBills, amounts, bills]);

  /**
   * Every reason the Confirm button must stay disabled, as user-facing text.
   * Returning the reasons (not just a boolean) lets the UI say WHY.
   */
  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!learner) errors.push('Select a learner.');
    if (selectedBills.length === 0) errors.push('Select at least one bill.');
    if (summary.payingNow <= 0) errors.push('Enter an amount greater than zero.');

    for (const bill of selectedBills) {
      const amount = amounts[bill.id] ?? 0;
      if (amount <= 0) {
        errors.push(`Enter an amount for ${bill.category_name || 'the selected bill'}.`);
      } else if (amount > bill.balance_amount + 0.001) {
        errors.push(`${bill.category_name || 'A bill'} exceeds its outstanding balance.`);
      }
    }

    if (!form.payerName.trim()) errors.push('Payer name is required.');

    // Per-mode rules. 'online' is validated by the gateway, not here.
    if (form.mode === 'dd') {
      if (!form.referenceNumber.trim()) errors.push('DD number is required.');
      if (!form.bankName.trim()) errors.push('Bank name is required for a DD.');
      if (!form.dateOfCredit) errors.push('Date of credit is required for a DD.');
    }
    if (form.mode === 'bank_transfer') {
      if (!form.referenceNumber.trim()) errors.push('UTR / transaction reference is required.');
      if (!form.dateOfCredit) errors.push('Date of credit is required for NEFT.');
    }
    if (form.dateOfCredit && form.transactionDate && form.dateOfCredit < form.transactionDate) {
      // Mirrors the CHECK added in 20260909000000 so the DB never has to refuse.
      errors.push('Date of credit cannot be before the transaction date.');
    }

    return { errors, ok: errors.length === 0 };
  }, [learner, selectedBills, amounts, summary.payingNow, form]);

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!learner) throw new Error('No learner selected');

      const receiptItems = selectedBills
        .map((bill) => ({ bill_id: bill.id, amount_paid: money(amounts[bill.id] ?? 0) }))
        .filter((item) => item.amount_paid > 0);

      if (receiptItems.length === 0) throw new Error('Nothing to pay');

      const dto: CreateReceiptDto = {
        student_id: learner.id,
        institution_id: learner.institution_id,
        payment_mode: form.mode,
        payment_reference_number: form.referenceNumber.trim() || undefined,
        payment_amount: money(receiptItems.reduce((s, i) => s + i.amount_paid, 0)),
        payment_paid_date: form.transactionDate || today(),
        // Cash credits the moment it is handed over, so the counter does not
        // ask for a credit date and none is stored.
        date_of_credit: form.mode === 'cash' ? null : form.dateOfCredit || null,
        dd_bank_name: form.mode === 'dd' ? form.bankName.trim() || null : null,
        dd_branch: form.mode === 'dd' ? form.branch.trim() || null : null,
        remitter_name: form.mode === 'bank_transfer' ? form.remitterName.trim() || null : null,
        payer_name: form.payerName.trim(),
        payer_contact: form.payerContact.trim() || undefined,
        payment_remarks: form.remarks.trim() || undefined,
        receipt_items: receiptItems,
      };

      // The shared writer: generates the receipt number, inserts
      // billing_receipt_items and transitions each bill's status/balance.
      return BillingReceiptService.createBillingReceipt(dto);
    },
    onSuccess: (receipt) => {
      queryClient.invalidateQueries({ queryKey: SCHOOL_PAYMENT_KEYS.bills(learner?.id, academicYearId) });
      queryClient.invalidateQueries({ queryKey: SCHOOL_PAYMENT_KEYS.history(learner?.id, academicYearId) });
      toast.success(`Receipt ${receipt.receipt_number} created`);
    },
    onError: (error: Error) => toast.error(error.message || 'Payment could not be recorded'),
  });

  return {
    bills,
    loadingBills: billsQuery.isLoading,
    billsError: billsQuery.error ? (billsQuery.error as Error).message : null,
    history: historyQuery.data ?? [],
    loadingHistory: historyQuery.isLoading,

    selected,
    amounts,
    toggleBill,
    selectAll,
    setBillAmount,
    selectedBills,
    summary,

    form,
    setForm,
    validation,

    submitting: payMutation.isPending,
    pay: payMutation.mutateAsync,
    reset,
  };
}
