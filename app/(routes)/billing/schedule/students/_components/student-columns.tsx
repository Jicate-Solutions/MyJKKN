'use client';

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
   * Opens the student popup for this row. Replaces the old two-navigation
   * path (list → student detail page → /billing/schedule/new?student_id=…),
   * which threw away the search results and re-fetched the learner both times.
   *
   * `tab` picks which face of the popup opens: 'bills' to read the learner's
   * existing bills and dues (the default landing tab), 'new' to go straight to
   * the bill form. NOTHING in this table navigates any more — the search
   * results always stay put.
   */
  onQuickBill: (student: StudentForBilling, tab?: 'new' | 'bills') => void;
  /** Whether the current user may create bills at all. */
  canCreateBills: boolean;
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
  canCreateBills
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
        const student = row.original;
        const fullName =
          [student.first_name, student.last_name].filter(Boolean).join(' ') ||
          'N/A';
        return (
          <div className='space-y-1'>
            {/* The name opens the popup in place, on Existing Bills — the
                same "who is this and what do they owe" the old detail-page
                redirect answered. Raising a bill is the explicit Bill button.
                It stays a button (not a link) because there is no navigation —
                screen readers should not announce it as one. */}
            <button
              type='button'
              onClick={() => onQuickBill(student, 'bills')}
              className='text-left font-medium text-primary hover:underline'
            >
              {fullName}
            </button>
            <div className='flex items-center gap-1 text-xs text-muted-foreground'>
              <Phone className='h-3 w-3' />
              {student.mobile_number || '—'}
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
                  {/* Opens the SAME popup on its Bills tab. This used to be a
                      <Link> to /billing/schedule/students/[id]; even in a new
                      tab it made the clerk leave the result they were on. */}
                  <Button
                    variant='outline'
                    size='icon'
                    className='h-8 w-8'
                    onClick={() => onQuickBill(student, 'bills')}
                    aria-label='View bills and dues'
                  >
                    <Eye className='h-4 w-4' />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>View bills &amp; dues</p>
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
