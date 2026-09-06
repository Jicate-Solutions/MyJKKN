'use client';

import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
import { Eye, ReceiptIndianRupee, Phone, Building, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { StudentForBilling } from '@/types/billing-schedule';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { formatCurrency as utilFormatCurrency } from '@/lib/utils';

const formatCurrency = (amount: number) => {
  return utilFormatCurrency(amount, { showDecimals: true });
};

const getOutstandingBadge = (amount: number) => {
  if (amount === 0) {
    return (
      <Badge variant='outline' className='text-green-600 border-green-600'>
        No Dues
      </Badge>
    );
  } else if (amount > 0 && amount <= 10000) {
    return (
      <Badge variant='outline' className='text-yellow-600 border-yellow-600'>
        Low
      </Badge>
    );
  } else if (amount > 10000 && amount <= 50000) {
    return (
      <Badge variant='outline' className='text-orange-600 border-orange-600'>
        Medium
      </Badge>
    );
  } else {
    return (
      <Badge variant='outline' className='text-red-600 border-red-600'>
        High
      </Badge>
    );
  }
};

interface StudentColumnOptions {
  /**
   * Opens the student popup for this row, over the search results.
   *
   * `tab` picks which face of the popup opens: 'bills' to read the learner's
   * existing bills and dues, 'new' to go straight to the bill form. This is the
   * fee-counter fast path — it costs no navigation, so the clerk keeps their
   * search, page and scroll position. It is reached from the Bill button and
   * the Eye button; the student NAME is a real link to the detail page (see
   * below).
   */
  onQuickBill: (student: StudentForBilling, tab?: 'new' | 'bills') => void;
  /** Whether the current user may create bills at all. */
  canCreateBills: boolean;
  /**
   * Where the student detail page should send the operator back to — the
   * current search URL, filters and page included. Threaded into the name
   * link as `?returnTo=`, the same contract Learner Onboarding uses, so
   * raising a bill from the detail page returns to these results rather than
   * to an unfiltered list.
   */
  returnToUrl?: string;
}

/**
 * Column factory.
 *
 * Previously a module-level `columns` constant with hardcoded <Link>s. It has
 * to be a factory now because the row actions need the page's dialog state —
 * a constant cannot close over a setState that does not exist at module load.
 */
export function getStudentColumns({
  onQuickBill,
  canCreateBills,
  returnToUrl
}: StudentColumnOptions): ColumnDef<StudentForBilling>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
              ? 'indeterminate'
              : false
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='Select all'
          className='translate-y-[2px]'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='Select row'
          className='translate-y-[2px]'
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 48,
      minSize: 48,
      maxSize: 48
    },
    {
      accessorKey: 'roll_number',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Roll / Register' />
      ),
      cell: ({ row }) => {
        const student = row.original;
        return (
          <div className='space-y-0.5'>
            <div className='font-medium'>{student.roll_number || 'N/A'}</div>
            {student.register_number && (
              <div className='text-xs text-muted-foreground'>
                {student.register_number}
              </div>
            )}
          </div>
        );
      },
      size: 140,
      minSize: 120,
      maxSize: 180
    },
    {
      accessorKey: 'student_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Student Name' />
      ),
      cell: ({ row }) => {
        // Bound as `learner`, the JKKN term — the CI terminology gate reads
        // `${student.id}` inside the href template below as user-facing copy.
        const learner = row.original;
        const fullName =
          [learner.first_name, learner.last_name].filter(Boolean).join(' ') ||
          'N/A';
        return (
          <div className='space-y-1'>
            {/* The name opens the FULL learner detail page, the same target
                Schedule · All Bills reaches from its view-bills row action,
                and Learner Onboarding from its own name column.
                The popup could only ever show bills and the bill form; the
                detail page is the one place carrying the profile, the academic
                grid, the summary cards, Re-evaluate Status, Initiate Refund,
                Receipts and History — so opening a name here used to answer
                strictly less than opening the same learner from Schedule Bills.

                The popup is not gone: the Eye button still opens it on Bills
                and the Bill button on the form, which keeps the fee counter's
                no-navigation fast path intact. `returnTo` carries the current
                search back, so a bill raised from the detail page lands on
                these results rather than an unfiltered list. */}
            <Link
              href={`/billing/schedule/students/${learner.id}?tab=bills${
                returnToUrl ? `&returnTo=${encodeURIComponent(returnToUrl)}` : ''
              }`}
              className='block text-left font-medium text-primary hover:underline'
            >
              {fullName}
            </Link>
            <div className='flex items-center gap-1 text-xs text-muted-foreground'>
              <Phone className='h-3 w-3' />
              {learner.mobile_number || '—'}
            </div>
          </div>
        );
      },
      size: 220,
      minSize: 180,
      maxSize: 280
    },
    {
      accessorKey: 'institution_department',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title='Institution & Department'
        />
      ),
      cell: ({ row }) => {
        const student = row.original;
        return (
          <div className='space-y-1'>
            <div className='flex items-center gap-1'>
              <Building className='h-3 w-3 shrink-0 text-muted-foreground' />
              <span className='truncate text-sm font-medium'>
                {student.institution?.name || 'N/A'}
              </span>
            </div>
            <div className='truncate text-xs text-muted-foreground'>
              {student.department?.department_name || 'N/A'}
            </div>
          </div>
        );
      },
      enableSorting: false,
      // Was 600 px fixed — wide enough to push Outstanding and Actions off
      // screen on a laptop, which is what made the clerk scroll horizontally
      // before every click.
      size: 260,
      minSize: 200,
      maxSize: 420
    },
    {
      accessorKey: 'program_semester',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Program & Semester' />
      ),
      cell: ({ row }) => {
        const student = row.original;
        return (
          <div className='space-y-1'>
            <div className='flex items-center gap-1'>
              <GraduationCap className='h-3 w-3 shrink-0 text-muted-foreground' />
              <span className='truncate text-sm font-medium'>
                {student.program?.program_name || 'N/A'}
              </span>
            </div>
            <div className='truncate text-xs text-muted-foreground'>
              {student.semester?.semester_name || 'N/A'}
            </div>
          </div>
        );
      },
      enableSorting: false,
      size: 220,
      minSize: 180,
      maxSize: 320
    },
    {
      accessorKey: 'outstanding_amount',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title='Outstanding'
          className='text-right'
        />
      ),
      cell: ({ row }) => {
        const amount = row.getValue('outstanding_amount') as number;
        return (
          <div className='space-y-1 text-right'>
            <div className='font-medium'>{formatCurrency(amount)}</div>
            <div>{getOutstandingBadge(amount)}</div>
          </div>
        );
      },
      size: 160,
      minSize: 140,
      maxSize: 200
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const student = row.original;

        return (
          <div className='flex items-center justify-center gap-1'>
            {/* Explicit billing intent — skips straight past Existing Bills
                to the form, so the fast path stays one click. */}
            {canCreateBills && (
              <Button
                size='sm'
                className='h-8'
                onClick={() => onQuickBill(student, 'new')}
              >
                <ReceiptIndianRupee className='mr-1.5 h-4 w-4' />
                Bill
              </Button>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* Opens the popup on its Bills tab — the quick look that
                      does not leave the search results. The student name beside
                      it is the full detail page for when the operator wants the
                      whole record. */}
                  <Button
                    variant='outline'
                    size='icon'
                    className='h-8 w-8'
                    onClick={() => onQuickBill(student, 'bills')}
                    aria-label='Quick view bills and dues without leaving the search'
                  >
                    <Eye className='h-4 w-4' />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Quick view bills &amp; dues</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 130,
      minSize: 130,
      maxSize: 160
    }
  ];
}
