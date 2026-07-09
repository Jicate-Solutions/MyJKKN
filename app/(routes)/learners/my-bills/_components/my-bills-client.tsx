'use client';

import { useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  BarChart3,
  Bus,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Download,
  Eye,
  GraduationCap,
  Receipt,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { MyBill, MyBillsData, MyReceipt } from '@/types/billing';
import type { StudentBill } from '@/types/billing-schedule';
import { PaymentSelectionModal } from '@/components/billing/payment-selection-modal';
import { useConnectedFeeHeads } from '@/hooks/billing/use-connected-fee-heads';
import { FEE_HEAD_LABELS, fmtDate, groupByYear, inr, isOverdue } from './shared';
import { ReceiptDialog, downloadMyReceiptPdf, type ReceiptPdfContext } from './receipt-dialog';

// Recharts only loads when the Analytics tab is opened.
const MyBillsAnalytics = dynamic(
  () => import('./analytics-tab').then((m) => m.MyBillsAnalytics),
  { loading: () => <Skeleton className='h-[420px] w-full' /> }
);

interface MyBillsClientProps {
  data: MyBillsData;
  learnerId: string;
  learnerName: string;
  rollNumber: string;
  collegeEmail: string;
  institutionId: string | null;
  institutionName: string;
}

export function MyBillsClient({
  data,
  learnerId,
  learnerName,
  rollNumber,
  collegeEmail,
  institutionId,
  institutionName,
}: MyBillsClientProps) {
  const { totalDue, totalBilled, totalPaid, bills, receipts } = data;
  const [viewReceipt, setViewReceipt] = useState<MyReceipt | null>(null);
  // Bill the student clicked "Pay" on — the modal opens scoped to its category.
  const [payBill, setPayBill] = useState<MyBill | null>(null);

  const pdfCtx: ReceiptPdfContext = { learnerName, rollNumber, collegeEmail, institutionName };

  const outstanding = bills.filter((b) => b.balanceAmount > 0);

  // Pay Online is offered per bill, only when that bill's fee head has a
  // connected Razorpay account (same source of truth as the admin flow);
  // everything else is settled at the accounts office — no button on those rows.
  const { data: connectivity } = useConnectedFeeHeads(institutionId);
  const canPayBill = (b: MyBill) => {
    if (!connectivity) return false;
    if (connectivity.allConnected) return true;
    return !!b.kind && connectivity.feeHeads.includes(b.kind);
  };

  // The shared PaymentSelectionModal speaks the admin StudentBill shape — adapt
  // the lean MyBill row to the fields it (and the amount selector) reads.
  // Each Pay button pays exactly ITS bill: the modal receives only the clicked
  // bill (pre-ticked), so the order routes to that bill's category account.
  const modalBills = useMemo(() => {
    if (!payBill) return [];
    const b = payBill;
    return [
      {
        id: b.id,
        student_id: learnerId,
        institution_id: institutionId ?? '',
        bill_description: b.description,
        due_date: b.dueDate,
        total_amount: b.totalAmount,
        final_amount: b.totalAmount,
        balance_amount: b.balanceAmount,
        bill_balance: b.balanceAmount,
        status: b.status ?? 'pending',
        item_category: {
          id: '',
          category_name: b.categoryName ?? b.description,
          kind: b.kind,
        },
        academic_year:
          b.academicYear && b.academicYear !== 'Other'
            ? { id: '', academic_year_name: b.academicYear }
            : undefined,
      } as unknown as StudentBill,
    ];
  }, [payBill, learnerId, institutionId]);
  // Transport bills (TMS-generated, category kind='transport') render in their
  // own section, so they're excluded from the academic-year groups below.
  const transportOutstanding = outstanding.filter((b) => b.kind === 'transport');
  const outstandingGroups = groupByYear(outstanding.filter((b) => b.kind !== 'transport'));
  const receiptGroups = groupByYear(receipts);
  const transportDue = transportOutstanding.reduce((sum, b) => sum + b.balanceAmount, 0);

  const clearedPct =
    totalBilled > 0 ? Math.min(100, Math.round(((totalBilled - totalDue) / totalBilled) * 100)) : 0;

  return (
    <div className='space-y-6'>
      {/* ── Summary hero ───────────────────────────────────────────────── */}
      <Card className='overflow-hidden'>
        <CardContent className='flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex min-w-0 items-center gap-3'>
            <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary'>
              <GraduationCap className='h-5 w-5' />
            </div>
            <div className='min-w-0 space-y-0.5'>
              {learnerName && <div className='truncate text-lg font-semibold'>{learnerName}</div>}
              <div className='truncate text-sm text-muted-foreground'>
                {[rollNumber, institutionName].filter(Boolean).join(' · ') || 'Fee summary'}
              </div>
            </div>
          </div>

          <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:gap-8'>
            <div>
              <div className='text-xs uppercase tracking-wide text-muted-foreground'>Total due</div>
              <div
                className={`text-2xl font-bold tabular-nums ${
                  totalDue > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {inr(totalDue)}
              </div>
              <div className='text-xs text-muted-foreground'>
                {outstanding.length} outstanding {outstanding.length === 1 ? 'bill' : 'bills'}
              </div>
            </div>
            <div>
              <div className='text-xs uppercase tracking-wide text-muted-foreground'>Total paid</div>
              <div className='text-2xl font-bold tabular-nums'>{inr(totalPaid)}</div>
              <div className='text-xs text-muted-foreground'>
                {receipts.length} {receipts.length === 1 ? 'receipt' : 'receipts'}
              </div>
            </div>
            <div className='col-span-2 sm:col-span-1'>
              <div className='text-xs uppercase tracking-wide text-muted-foreground'>
                Fees cleared
              </div>
              <div className='text-2xl font-bold tabular-nums'>{clearedPct}%</div>
              <Progress value={clearedPct} aria-label={`${clearedPct}% of billed fees cleared`} className='mt-1.5 h-1.5' />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <Tabs defaultValue='outstanding' className='w-full'>
        <TabsList className='w-full justify-start overflow-x-auto sm:w-auto'>
          <TabsTrigger value='outstanding' className='gap-1.5'>
            <Wallet className='h-4 w-4' /> Outstanding
            {outstanding.length > 0 && (
              <Badge variant='secondary' className='ml-1'>{outstanding.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value='paid' className='gap-1.5'>
            <Receipt className='h-4 w-4' /> Paid
            {receipts.length > 0 && (
              <Badge variant='secondary' className='ml-1'>{receipts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value='analytics' className='gap-1.5'>
            <BarChart3 className='h-4 w-4' /> Analytics
          </TabsTrigger>
        </TabsList>

        {/* ── Outstanding: transport section first, then academic years ── */}
        <TabsContent value='outstanding' className='mt-4 space-y-4'>
          {outstanding.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className='h-8 w-8 text-emerald-600 dark:text-emerald-400' />}
              title='No outstanding bills'
              subtitle="You're all caught up — nothing due right now."
            />
          ) : (
            <>
              {transportOutstanding.length > 0 && (
                <YearSection
                  year='Transport'
                  label='Transport Fees'
                  icon={<Bus className='h-4 w-4 shrink-0 text-muted-foreground' />}
                  defaultOpen
                  meta={`${transportOutstanding.length} ${
                    transportOutstanding.length === 1 ? 'bill' : 'bills'
                  }`}
                  amount={inr(transportDue)}
                  amountClassName='text-destructive'
                  amountLabel='due'
                >
                  {transportOutstanding.map((bill) => (
                    <BillRow
                      key={bill.id}
                      bill={bill}
                      onPayOnline={canPayBill(bill) ? () => setPayBill(bill) : undefined}
                    />
                  ))}
                </YearSection>
              )}
              {outstandingGroups.map((group, index) => {
                const groupDue = group.items.reduce((sum, b) => sum + b.balanceAmount, 0);
                const hasOverdue = group.items.some((b) => isOverdue(b.dueDate));
                return (
                  <YearSection
                    key={group.year}
                    year={group.year}
                    defaultOpen={index === 0 || hasOverdue}
                    meta={`${group.items.length} ${group.items.length === 1 ? 'bill' : 'bills'}`}
                    amount={inr(groupDue)}
                    amountClassName='text-destructive'
                    amountLabel='due'
                  >
                    {group.items.map((bill) => (
                      <BillRow
                        key={bill.id}
                        bill={bill}
                        onPayOnline={canPayBill(bill) ? () => setPayBill(bill) : undefined}
                      />
                    ))}
                  </YearSection>
                );
              })}
            </>
          )}
        </TabsContent>

        {/* ── Paid receipts, grouped by academic year ─────────────────── */}
        <TabsContent value='paid' className='mt-4 space-y-4'>
          {receiptGroups.length === 0 ? (
            <EmptyState
              icon={<Receipt className='h-8 w-8 text-muted-foreground' />}
              title='No payments yet'
              subtitle='Your receipts will appear here once a payment is recorded.'
            />
          ) : (
            receiptGroups.map((group, index) => {
              const groupPaid = group.items.reduce(
                (sum, r) => sum + r.amount - r.refundedAmount,
                0
              );
              return (
                <YearSection
                  key={group.year}
                  year={group.year}
                  defaultOpen={index === 0}
                  meta={`${group.items.length} ${group.items.length === 1 ? 'receipt' : 'receipts'}`}
                  amount={inr(groupPaid)}
                  amountClassName='text-emerald-600 dark:text-emerald-400'
                  amountLabel='paid'
                >
                  {group.items.map((receipt) => (
                    <ReceiptRow
                      key={receipt.id}
                      receipt={receipt}
                      onView={() => setViewReceipt(receipt)}
                      onDownload={() => downloadMyReceiptPdf(receipt, pdfCtx)}
                    />
                  ))}
                </YearSection>
              );
            })
          )}
        </TabsContent>

        {/* ── Analytics ───────────────────────────────────────────────── */}
        <TabsContent value='analytics' className='mt-4'>
          <MyBillsAnalytics
            bills={bills}
            receipts={receipts}
            totalDue={totalDue}
            totalBilled={totalBilled}
            totalPaid={totalPaid}
          />
        </TabsContent>
      </Tabs>

      <ReceiptDialog receipt={viewReceipt} ctx={pdfCtx} onClose={() => setViewReceipt(null)} />

      <PaymentSelectionModal
        open={!!payBill}
        onOpenChange={(next) => {
          if (!next) setPayBill(null);
        }}
        bills={modalBills}
        studentId={learnerId}
        initialSelectedBillIds={payBill ? [payBill.id] : undefined}
      />
    </div>
  );
}

/* ── Academic-year group shell (shared by Outstanding + Paid) ─────────── */

interface YearSectionProps {
  year: string;
  /** Overrides the derived "Academic Year {year}" heading (e.g. "Transport Fees"). */
  label?: string;
  icon?: ReactNode;
  meta: string;
  amount: string;
  amountLabel: string;
  amountClassName?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function YearSection({
  year,
  label,
  icon,
  meta,
  amount,
  amountLabel,
  amountClassName = '',
  defaultOpen = false,
  children,
}: YearSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <Card className='overflow-hidden'>
        <CollapsibleTrigger className='group flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 sm:px-5'>
          <div className='flex min-w-0 items-center gap-2.5'>
            <ChevronDown className='h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90' />
            {icon}
            <div className='min-w-0'>
              <div className='font-semibold'>
                {label ?? (year === 'Other' ? 'Other fees' : `Academic Year ${year}`)}
              </div>
              <div className='text-xs text-muted-foreground'>{meta}</div>
            </div>
          </div>
          <div className='shrink-0 text-right'>
            <div className={`font-semibold tabular-nums ${amountClassName}`}>{amount}</div>
            <div className='text-xs text-muted-foreground'>{amountLabel}</div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className='divide-y border-t'>{children}</div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/* ── One outstanding bill ─────────────────────────────────────────────── */

function BillRow({
  bill,
  onPayOnline,
}: {
  bill: MyBill;
  /** Present only when this bill's fee head has a connected payment account. */
  onPayOnline?: () => void;
}) {
  const overdue = isOverdue(bill.dueDate);
  const partiallyPaid = bill.paidAmount > 0;
  const paidPct =
    bill.totalAmount > 0 ? Math.min(100, Math.round((bill.paidAmount / bill.totalAmount) * 100)) : 0;

  return (
    <div className='flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5'>
      <div className='min-w-0 flex-1 space-y-1.5'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='font-medium'>{bill.categoryName || bill.description}</span>
          {bill.kind && (
            <Badge variant='secondary'>{FEE_HEAD_LABELS[bill.kind] ?? bill.kind}</Badge>
          )}
          {overdue ? (
            <Badge variant='destructive'>Overdue</Badge>
          ) : (
            partiallyPaid && <Badge variant='outline'>Partially paid</Badge>
          )}
        </div>
        {bill.categoryName && bill.description && bill.description !== bill.categoryName && (
          <div className='line-clamp-1 text-xs text-muted-foreground'>{bill.description}</div>
        )}
        <div
          className={`flex items-center gap-1.5 text-xs ${
            overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
          }`}
        >
          <CalendarClock className='h-3.5 w-3.5' /> Due {fmtDate(bill.dueDate)}
        </div>
        {partiallyPaid && (
          <div className='flex max-w-xs items-center gap-2'>
            <Progress
              value={paidPct}
              aria-label={`${paidPct}% of this bill paid`}
              className='h-1.5 flex-1'
            />
            <span className='shrink-0 text-xs tabular-nums text-muted-foreground'>
              {paidPct}% paid
            </span>
          </div>
        )}
      </div>
      <div className='flex shrink-0 items-center justify-between gap-3 sm:justify-end'>
        <div className='sm:text-right'>
          <div className='text-lg font-semibold tabular-nums text-destructive'>
            {inr(bill.balanceAmount)}
          </div>
          {bill.totalAmount !== bill.balanceAmount && (
            <div className='text-xs tabular-nums text-muted-foreground'>
              of {inr(bill.totalAmount)}
            </div>
          )}
        </div>
        {onPayOnline && (
          <Button size='sm' onClick={onPayOnline} className='gap-1.5' aria-label='Pay this bill online'>
            <CreditCard className='h-3.5 w-3.5' />
            <span>Pay</span>
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── One paid receipt ─────────────────────────────────────────────────── */

function ReceiptRow({
  receipt,
  onView,
  onDownload,
}: {
  receipt: MyReceipt;
  onView: () => void;
  onDownload: () => void;
}) {
  const coveredLabel =
    receipt.items.length > 0
      ? receipt.items.length === 1
        ? receipt.items[0].billDescription
        : `${receipt.items[0].billDescription} +${receipt.items.length - 1} more`
      : null;

  return (
    <div className='flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5'>
      <div className='min-w-0 flex-1 space-y-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='font-medium'>Receipt #{receipt.receiptNumber || '—'}</span>
          {receipt.mode && (
            <Badge variant='outline' className='capitalize'>
              {receipt.mode.replace(/_/g, ' ')}
            </Badge>
          )}
          {receipt.refundedAmount > 0 && <Badge variant='destructive'>Refunded</Badge>}
        </div>
        <div className='text-xs text-muted-foreground'>
          Paid {fmtDate(receipt.paidDate)}
          {coveredLabel ? ` · ${coveredLabel}` : ''}
          {receipt.reference ? ` · Ref ${receipt.reference}` : ''}
        </div>
      </div>
      <div className='flex shrink-0 items-center justify-between gap-3 sm:justify-end'>
        <div className='text-right'>
          <div className='text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400'>
            {inr(receipt.amount - receipt.refundedAmount)}
          </div>
          {receipt.refundedAmount > 0 && (
            <div className='text-xs tabular-nums text-muted-foreground'>
              of {inr(receipt.amount)}
            </div>
          )}
        </div>
        <div className='flex items-center gap-1.5'>
          <Button variant='outline' size='sm' onClick={onView} aria-label='View receipt details'>
            <Eye className='h-4 w-4 sm:mr-1.5' />
            <span className='hidden sm:inline'>View</span>
          </Button>
          <Button variant='outline' size='sm' onClick={onDownload} aria-label='Download receipt PDF'>
            <Download className='h-4 w-4 sm:mr-1.5' />
            <span className='hidden sm:inline'>PDF</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────── */

function EmptyState({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <Card>
      <CardContent className='flex flex-col items-center justify-center gap-2 py-12 text-center'>
        {icon}
        <div className='font-medium'>{title}</div>
        <div className='max-w-sm text-sm text-muted-foreground'>{subtitle}</div>
      </CardContent>
    </Card>
  );
}
