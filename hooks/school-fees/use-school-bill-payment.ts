// hooks/school-fees/use-school-bill-payment.ts
//
// State + money maths for the School Bill Payment counter.
//
// The allocation rule is the whole point of this hook: the operator selects
// bills and may pay a PART of any of them, so "what is being paid" is a map of
// bill_id -> amount, not a single total. Every guard below exists to stop that
// map from producing a receipt that over-collects.

'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

import { QUERY_CONFIG } from '@/lib/config/query-config';
import { SchoolBillPaymentService } from '@/lib/services/school-fees/school-bill-payment-service';
import type { PaymentMode } from '@/types/billing-schedule';
import type {
  CreateSchoolReceiptDto,
  SchoolLearnerForPayment,
  SchoolOutstandingBill,
} from '@/types/school-fees';

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
   * The selection as it applies to the CURRENT balances.
   *
   * `selected` / `amounts` hold what the operator asked for; this clamps that
   * intent against the bills as they stand right now. Derived, never stored —
   * the same reasoning as use-school-year-selection: doing it by writing state
   * back inside an effect is what react-hooks/set-state-in-effect rejects, and
   * it also leaves one render where the stale number is live.
   *
   * Why it is needed at all: the map is keyed by bill id and outlives a
   * refetch, but the balances under it do not. Pay 7,000 of a 7,200 bill and
   * the list comes back with a 200 balance while Pay Now still holds the 7,000
   * just collected — the summary then reports a negative "balance after
   * payment" and the operator is one click from re-collecting money the
   * learner already paid.
   *
   * A bill that is now settled drops out of the selection entirely. Deliberate
   * part-payments below the balance are left alone: clamping is downward only.
   */
  const { selected: effectiveSelected, amounts: effectiveAmounts } = useMemo(() => {
    const balanceOf = new Map(bills.map((b) => [b.id, money(b.balance_amount)]));
    const sel: Record<string, boolean> = {};
    const amt: Record<string, number> = {};

    for (const [id, on] of Object.entries(selected)) {
      if (!on) continue;
      const balance = balanceOf.get(id);
      // Settled, or gone from the list — either way there is nothing to pay.
      if (balance === undefined || balance <= 0) continue;
      sel[id] = true;
      amt[id] = Math.min(amounts[id] ?? 0, balance);
    }

    return { selected: sel, amounts: amt };
  }, [bills, selected, amounts]);

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
    () => bills.filter((b) => effectiveSelected[b.id] && b.balance_amount > 0),
    [bills, effectiveSelected],
  );

  const summary = useMemo(() => {
    const totalBilled = selectedBills.reduce((s, b) => s + b.final_amount, 0);
    const previouslyPaid = selectedBills.reduce((s, b) => s + b.paid_amount, 0);
    const outstanding = selectedBills.reduce((s, b) => s + b.balance_amount, 0);
    const payingNow = selectedBills.reduce((s, b) => s + (effectiveAmounts[b.id] ?? 0), 0);
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
  }, [selectedBills, effectiveAmounts, bills]);

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
      const amount = effectiveAmounts[bill.id] ?? 0;
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
  }, [learner, selectedBills, effectiveAmounts, summary.payingNow, form]);

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!learner) throw new Error('No learner selected');

      const receiptItems = selectedBills
        .map((bill) => ({ bill_id: bill.id, amount_paid: money(effectiveAmounts[bill.id] ?? 0) }))
        .filter((item) => item.amount_paid > 0);

      if (receiptItems.length === 0) throw new Error('Nothing to pay');

      const dto: CreateSchoolReceiptDto = {
        student_id: learner.id,
        institution_id: learner.institution_id,
        payment_mode: form.mode,
        payment_reference_number: form.referenceNumber.trim() || null,
        payment_amount: money(receiptItems.reduce((s, i) => s + i.amount_paid, 0)),
        payment_paid_date: form.transactionDate || today(),
        // Cash credits the moment it is handed over, so the counter does not
        // ask for a credit date and none is stored.
        date_of_credit: form.mode === 'cash' ? null : form.dateOfCredit || null,
        dd_bank_name: form.mode === 'dd' ? form.bankName.trim() || null : null,
        dd_branch: form.mode === 'dd' ? form.branch.trim() || null : null,
        remitter_name: form.mode === 'bank_transfer' ? form.remitterName.trim() || null : null,
        payer_name: form.payerName.trim(),
        payer_contact: form.payerContact.trim() || null,
        payment_remarks: form.remarks.trim() || null,
        receipt_items: receiptItems,
      };

      // The SCHOOL writer, not the college one. fn_create_school_fee_receipt
      // is the only path that carries date_of_credit / dd_* / remitter_name,
      // and keeping it separate means no school change can reach live college
      // receipting. Same tables, same atomicity.
      return SchoolBillPaymentService.createReceipt(dto);
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
    // Surfaced, not swallowed. A failed history query used to fall through to
    // `?? []`, which the UI rendered as "No payments yet" — indistinguishable
    // from a learner who genuinely has not paid. That hid a real outage: the
    // query referenced a column whose migration was not yet applied, so every
    // learner looked like a first-time payer.
    historyError: historyQuery.error ? (historyQuery.error as Error).message : null,

    selected: effectiveSelected,
    amounts: effectiveAmounts,
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
