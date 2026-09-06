'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { useStudentBillingSummary } from '@/hooks/billing/use-student-search';
import type { StudentForBilling } from '@/types/billing-schedule';
import { StudentBillForm } from '../../_components/student-bill-form';
import { StudentBillsTable } from '../[id]/_components/student-bills-table';
import { QuickReceiptDialog } from '../../../receipts/_components/quick-receipt-dialog';

interface QuickBillDialogProps {
  /**
   * The row object straight out of the search results.
   *
   * Deliberately NOT a studentId + fetch: `searchStudentsForBilling` already
   * returns the three fields the bill form needs from a pre-selected student
   * (id, institution_id, academic_year_id) plus everything the header shows.
   * Re-fetching would add a Supabase round trip AND a
   * calculate_student_outstanding RPC per bill — the exact cost this dialog
   * exists to remove.
   */
  student: StudentForBilling | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which face opens: raise a bill, or read the existing ones. */
  initialTab?: 'new' | 'bills';
  /** Called after a bill is created, so the results list can refresh. */
  onCreated: () => void;
}

export function QuickBillDialog({
  student,
  open,
  onOpenChange,
  initialTab = 'bills',
  onCreated
}: QuickBillDialogProps) {
  // Both states initialize from props and are never synced back by an effect.
  // The host remounts this component (via a key on student id + tab) when it
  // opens a different student or a different tab, so mount-time initialization
  // is the whole reset story — no setState-in-effect, no stale-tab flash.
  const [tab, setTab] = useState<'new' | 'bills'>(initialTab);

  // Existing bills are fetched ONLY once the Bills tab is actually shown. The
  // fast path (scan → New Bill → save) never touches the network beyond the
  // create mutation itself, which is what makes back-to-back billing quick.
  const [billsRequested, setBillsRequested] = useState(initialTab === 'bills');

  // Non-null = the receipt step is showing, for these bills. Two paths set it:
  // selecting existing bills and pressing Generate Receipt, and finishing the
  // New Bill form (which hands back the ids it just inserted). Either way the
  // clerk stays inside this popup instead of being navigated to
  // /billing/receipts/new, which used to reload the whole page and throw away
  // the search results behind it.
  const [receiptBillIds, setReceiptBillIds] = useState<string[] | null>(null);

  const {
    data: summary,
    isLoading: isLoadingBills,
    refetch: refetchBills
  } = useStudentBillingSummary(
    billsRequested && student ? student.id : null
  );

  if (!student) return null;

  const fullName =
    [student.first_name, student.last_name].filter(Boolean).join(' ') || 'N/A';

  const identifiers = [
    student.roll_number && `Roll ${student.roll_number}`,
    student.register_number && `Reg ${student.register_number}`,
    student.mobile_number
  ].filter(Boolean) as string[];

  const academicPath = [
    student.institution?.name,
    student.program?.program_name,
    student.semester?.semester_name,
    student.section?.section_name && `Sec ${student.section.section_name}`
  ].filter(Boolean) as string[];

  // Collecting payment REPLACES this dialog rather than stacking on top of it:
  // one modal at a time keeps the focus trap unambiguous, and closing the
  // receipt step without generating drops the clerk straight back here.
  const showBillDialog = open && receiptBillIds === null;

  return (
    <>
    <Dialog open={showBillDialog} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[95vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0'>
        {/* Header stays put while the form scrolls, so the clerk always sees
            WHO they are billing. */}
        {/* pr-12 clears the DialogContent's built-in close button, which is
            absolutely positioned at right-4 top-4. */}
        <DialogHeader className='space-y-2 border-b px-6 py-4 pr-12 text-left'>
          <DialogTitle className='flex flex-wrap items-center gap-2 text-lg'>
            <User className='h-5 w-5 shrink-0 text-muted-foreground' />
            <span>{fullName}</span>
            {/* formatCurrency already emits the ₹ symbol (Intl currency
                style) — no icon, or the badge reads "₹₹1,200". */}
            <Badge
              variant='outline'
              className='border-orange-300 text-orange-600'
            >
              Outstanding{' '}
              {formatCurrency(student.outstanding_amount ?? 0, {
                showDecimals: false
              })}
            </Badge>
          </DialogTitle>
          <DialogDescription className='space-y-0.5 text-xs'>
            <span className='block'>{identifiers.join(' • ') || '—'}</span>
            {academicPath.length > 0 && (
              <span className='block'>{academicPath.join(' › ')}</span>
            )}
          </DialogDescription>
          <Button asChild variant='link' size='sm' className='h-auto justify-start p-0 text-xs'>
            <Link
              href={`/billing/schedule/students/${student.id}`}
              target='_blank'
              rel='noopener noreferrer'
            >
              Full profile, receipts &amp; refunds
              <ExternalLink className='ml-1 h-3 w-3' />
            </Link>
          </Button>
        </DialogHeader>

        {/* A plain segmented control, NOT Radix Tabs. Radix unmounts the
            inactive panel, so a clerk who half-filled the bill form, glanced
            at Existing Bills to check what was already raised, and switched
            back would find the form wiped. Both panels stay mounted here and
            only visibility changes. */}
        <div
          role='tablist'
          className='mx-6 mt-3 inline-flex w-fit items-center rounded-md bg-muted p-1'
        >
          {/* Existing Bills leads: read what the learner already owes BEFORE
              raising another one. Billing blind is how duplicate bills for the
              same fee get created. */}
          {(
            [
              [
                'bills',
                `Existing Bills${summary?.bills?.length ? ` (${summary.bills.length})` : ''}`
              ],
              ['new', 'New Bill']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type='button'
              role='tab'
              aria-selected={tab === value}
              onClick={() => {
                setTab(value);
                if (value === 'bills') setBillsRequested(true);
              }}
              className={`rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4'>
          {/* Panel order mirrors the tab order above, so DOM/reading order and
              visual order agree for keyboard and screen-reader users. */}
          <div className={tab === 'bills' ? '' : 'hidden'}>
            {/* Same dense definition grid as the detail page, so the popup is
                a real substitute for that redirect rather than a shortcut that
                hides the context accounts needs (quota/community drive which
                fee structure applies). */}
            <dl className='mb-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border bg-muted/40 p-3 sm:grid-cols-3 lg:grid-cols-4'>
              {(
                [
                  ['Institution', student.institution?.name],
                  ['Academic Year', student.academic_year?.academic_year_name],
                  ['Degree', student.degree?.degree_name],
                  ['Department', student.department?.department_name],
                  ['Program', student.program?.program_name],
                  ['Semester', student.semester?.semester_name],
                  ['Section', student.section?.section_name],
                  ['Accommodation', student.accommodation_type?.name]
                ] as [string, string | undefined][]
              ).map(([label, value]) => (
                <div key={label} className='min-w-0'>
                  <dt className='text-[11px] uppercase tracking-wide text-muted-foreground'>
                    {label}
                  </dt>
                  <dd className='truncate text-sm font-medium' title={value || 'N/A'}>
                    {value || 'N/A'}
                  </dd>
                </div>
              ))}
            </dl>

            {isLoadingBills ? (
              <div className='flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground'>
                <Loader2 className='h-4 w-4 animate-spin' />
                Loading bills…
              </div>
            ) : summary?.bills?.length ? (
              <StudentBillsTable
                bills={summary.bills}
                statusFilter='all'
                onRefresh={() => {
                  refetchBills();
                  // A payment or cancellation here changes the outstanding
                  // amount shown in the results row behind the dialog.
                  onCreated();
                }}
                onGenerateReceipt={(billIds) => setReceiptBillIds(billIds)}
              />
            ) : (
              <p className='py-12 text-center text-sm text-muted-foreground'>
                No bills raised for this student yet.
              </p>
            )}
          </div>

          <div className={tab === 'new' ? '' : 'hidden'}>
            <StudentBillForm
              preSelectedStudent={student}
              compact
              onCancel={() => onOpenChange(false)}
              onSuccess={(createdBillIds) => {
                // The results row behind the popup shows an outstanding
                // amount that this bill just changed — refresh it either way.
                onCreated();
                refetchBills();

                if (createdBillIds && createdBillIds.length > 0) {
                  // Raising a bill at the counter is nearly always followed by
                  // taking the money for it, so go straight to the receipt
                  // step instead of making the clerk re-find the bill they
                  // just created. Cancelling there returns here.
                  setBillsRequested(true);
                  setTab('bills');
                  setReceiptBillIds(createdBillIds);
                  return;
                }

                onOpenChange(false);
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <QuickReceiptDialog
      open={receiptBillIds !== null}
      onOpenChange={(receiptOpen) => {
        // Closing without generating returns to the bill dialog, because
        // `showBillDialog` keys off this being null.
        if (!receiptOpen) setReceiptBillIds(null);
      }}
      billIds={receiptBillIds ?? []}
      studentId={student.id}
      studentName={fullName}
      subtitle={identifiers.join(' • ') || undefined}
      onGenerated={() => {
        setReceiptBillIds(null);
        // Land back on Existing Bills with fresh data, so the clerk can see
        // the bill they just settled flip to PAID before moving on.
        setBillsRequested(true);
        setTab('bills');
        refetchBills();
        onCreated();
      }}
    />
    </>
  );
}
