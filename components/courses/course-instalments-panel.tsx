'use client';

// Client island for the "Instalments" section of one enrolment card on
// /my-courses. Lifted out of the server page so the per-bill "Pay" trigger
// and the enrolment-level "Pay instalments" trigger can share one
// CoursePaymentSelectionModal instance and its selection state.

import { useMemo, useState } from 'react';
import { CreditCard, ReceiptText, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DownloadReceiptButton } from '@/app/my-courses/_components/download-receipt-button';
import { CoursePaymentSelectionModal } from './course-payment-selection-modal';
import type { PayableCourseBill } from './course-online-payment-amount-selector';
import type { CourseReceiptData } from '@/lib/utils/courses/course-receipt-pdf';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const formatDate = (value: string | null) => {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const BILL_STATUS_LABEL: Record<string, string> = {
  pending: 'Due',
  partially_paid: 'Part paid',
  paid: 'Paid',
  overdue: 'Overdue',
  voided: 'Cancelled',
};

const BILL_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  partially_paid: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  voided: 'bg-muted text-muted-foreground line-through',
};

export interface CourseInstalmentsPanelProps {
  bills: any[]; // course_bills rows with nested `payments`, as read on /my-courses
  institutionName: string | null;
  enrollmentNumber: string;
  enrollmentStatus: string;
  participantName: string;
  jkknId: string | null;
  courseTitle: string;
  totalPayable: number;
  totalPaid: number;
  balance: number;
}

export function CourseInstalmentsPanel({
  bills,
  institutionName,
  enrollmentNumber,
  enrollmentStatus,
  participantName,
  jkknId,
  courseTitle,
  totalPayable,
  totalPaid,
  balance,
}: CourseInstalmentsPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [preselected, setPreselected] = useState<string[]>([]);

  const payableBills: PayableCourseBill[] = useMemo(
    () =>
      bills
        .filter((b) => b.status !== 'paid' && b.status !== 'voided' && Number(b.balance_amount ?? 0) > 0)
        .map((b) => ({
          id: b.id,
          bill_number: b.bill_number,
          installment_no: b.installment_no,
          label: b.label,
          total_amount: Number(b.total_amount ?? 0),
          balance_amount: Number(b.balance_amount ?? 0),
        })),
    [bills],
  );

  const openModal = (billId?: string) => {
    setPreselected(billId ? [billId] : []);
    setModalOpen(true);
  };

  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <ReceiptText className="h-4 w-4 text-muted-foreground" />
          Instalments
        </h3>
        {payableBills.length > 1 && (
          <Button size="sm" variant="outline" onClick={() => openModal()}>
            <CreditCard className="mr-1.5 h-3.5 w-3.5" />
            Pay instalments
          </Button>
        )}
      </div>

      {bills.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No bills have been raised yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {bills.map((b) => {
            const due = Number(b.balance_amount ?? 0);
            const payable = due > 0 && b.status !== 'voided';
            const receipts = ((b.payments ?? []) as any[])
              .filter((p) => p.status === 'success' && p.receipt_number)
              .sort((x, y) => String(y.captured_at ?? '').localeCompare(String(x.captured_at ?? '')));

            return (
              <li key={b.id} className="rounded-lg border p-3 sm:p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium leading-tight">
                      {b.label || `Instalment ${b.installment_no}`}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {b.bill_number} · due {formatDate(b.due_date)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      BILL_STATUS_CLASS[b.status] ?? 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {BILL_STATUS_LABEL[b.status] ?? b.status}
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-lg font-semibold">{inr.format(Number(b.total_amount ?? 0))}</span>
                  {Number(b.paid_amount ?? 0) > 0 && due > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {inr.format(Number(b.paid_amount))} paid · {inr.format(due)} left
                    </span>
                  )}
                </div>

                {(payable || receipts.length > 0) && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    {receipts.map((p) => (
                      <DownloadReceiptButton
                        key={p.id}
                        receipt={
                          {
                            receiptNumber: p.receipt_number,
                            paidOn: p.captured_at ?? p.payment_date ?? null,
                            amountPaid: Number(p.amount_paid ?? 0),
                            paymentMode: p.payment_mode,
                            razorpayPaymentId: p.razorpay_payment_id ?? null,
                            participantName,
                            jkknId,
                            courseTitle,
                            institutionName,
                            enrollmentNumber,
                            billNumber: b.bill_number,
                            instalmentLabel: b.label || `Instalment ${b.installment_no}`,
                            instalmentDueDate: b.due_date ?? null,
                            billTotal: Number(b.total_amount ?? 0),
                            totalPayable,
                            totalPaid,
                            balance,
                          } satisfies CourseReceiptData
                        }
                      />
                    ))}

                    {payable && (
                      <Button size="sm" onClick={() => openModal(b.id)}>
                        <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                        Pay {inr.format(due)}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Payments go to {institutionName ?? 'the institution running this course'}. If online
        payment is unavailable, contact them directly.
      </p>

      <p className="mt-2 text-xs text-muted-foreground">
        Enrolment {enrollmentNumber} · {enrollmentStatus}
      </p>

      <CoursePaymentSelectionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        bills={payableBills}
        initialSelectedBillIds={preselected}
      />
    </div>
  );
}
