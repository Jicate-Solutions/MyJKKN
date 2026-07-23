'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { StudentBill } from '@/types/billing-schedule';
import { Badge } from '@/components/ui/badge';
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';
import type { LifecycleStatus } from '@/types/learner-profile';
import { format } from 'date-fns';
import { DataTableRowActions } from './row-actions';
import Link from 'next/link';
import { formatCurrency as utilFormatCurrency } from '@/lib/utils';
import {
  User,
  Building,
  Calendar,
  IndianRupee,
  RefreshCw,
  GraduationCap,
  BookOpen
} from 'lucide-react';

export const columns: ColumnDef<StudentBill>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
      />
    ),
    size: 50,
    minSize: 50,
    maxSize: 50,
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
      />
    ),
    enableSorting: false,
    enableHiding: false,
    enableResizing: false
  },
  {
    accessorKey: 'student',
    id: 'student_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Student' />
    ),
    size: 200,
    minSize: 180,
    maxSize: 250,
    cell: ({ row }) => {
      const bill = row.original;
      return (
        <div className='flex items-center gap-2'>
          <User className='h-4 w-4 text-muted-foreground' />
          <div>
            <div className='font-medium hover:text-primary hover:underline'>
              <Link href={`/billing/schedule/students/${bill.student_id}`}>
                {`${bill.student?.first_name || ''} ${
                  bill.student?.last_name || ''
                }`.trim()}
              </Link>
            </div>
            <div className='text-sm text-muted-foreground'>
              {bill.student?.roll_number || 'N/A'}
            </div>
          </div>
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      const nameA = `${rowA.original.student?.first_name || ''} ${
        rowA.original.student?.last_name || ''
      }`.trim();
      const nameB = `${rowB.original.student?.first_name || ''} ${
        rowB.original.student?.last_name || ''
      }`.trim();
      return nameA.localeCompare(nameB);
    }
  },
  {
    accessorKey: 'institution.name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution' />
    ),
    size: 200,
    minSize: 180,
    maxSize: 250,
    cell: ({ row }) => {
      const bill = row.original;
      return (
        <div className='flex items-center gap-2'>
          <Building className='h-4 w-4 text-muted-foreground' />
          <div>
            <div className='font-medium'>{bill.institution?.name || 'N/A'}</div>
            <div className='text-sm text-muted-foreground'>
              {bill.institution?.counselling_code || ''}
            </div>
          </div>
        </div>
      );
    }
  },
  {
    accessorKey: 'department_semester',
    id: 'department_semester',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Department / Semester' />
    ),
    size: 200,
    minSize: 180,
    maxSize: 250,
    cell: ({ row }) => {
      const bill = row.original;
      return (
        <div className='flex items-center gap-2'>
          <GraduationCap className='h-4 w-4 text-muted-foreground' />
          <div>
            <div className='font-medium'>
              {bill.student?.department?.department_name || 'N/A'}
            </div>
            <div className='text-sm text-muted-foreground flex items-center gap-1'>
              <BookOpen className='h-3 w-3' />
              {bill.student?.semester?.semester_name || 'N/A'}
            </div>
          </div>
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      const deptA = rowA.original.student?.department?.department_name || '';
      const deptB = rowB.original.student?.department?.department_name || '';
      return deptA.localeCompare(deptB);
    }
  },
  {
    accessorKey: 'item_category.category_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Category' />
    ),
    size: 180,
    minSize: 150,
    maxSize: 200,
    cell: ({ row }) => {
      const bill = row.original;
      // Category-upgrade bills all sit under the generic "Hostel/Mess Upgrade Fee"
      // category, so surface the from→to detail (stored in bill_description, e.g.
      // "Classic Room → Deluxe Room") for the accounts team.
      const isUpgradeBill =
        bill.item_category?.category_name === 'Hostel Upgrade Fee' ||
        bill.item_category?.category_name === 'Mess Upgrade Fee';
      const isGovernment =
        (bill.item_category as { collection_type?: string } | undefined)
          ?.collection_type === 'government';
      return (
        <div>
          <div className='flex items-center gap-1.5'>
            <span className='font-medium'>
              {bill.item_category?.category_name || 'N/A'}
            </span>
            {isGovernment && (
              <span
                className='shrink-0 rounded border border-amber-500 px-1 text-[10px] leading-4 text-amber-700 dark:text-amber-400'
                title='Collected on behalf of a government body — not management revenue.'
              >
                Govt
              </span>
            )}
          </div>
          {isUpgradeBill && bill.bill_description && (
            <div className='text-sm text-muted-foreground'>
              {bill.bill_description}
            </div>
          )}
          {bill.item_category?.frequency && (
            <div className='text-sm text-muted-foreground capitalize'>
              {bill.item_category.frequency}
            </div>
          )}
        </div>
      );
    }
  },
  {
    accessorKey: 'due_date',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Due Date' />
    ),
    size: 120,
    minSize: 100,
    maxSize: 150,
    cell: ({ row }) => {
      const dueDate = row.getValue('due_date') as string;
      return (
        <div className='flex items-center gap-2'>
          <Calendar className='h-4 w-4 text-muted-foreground' />
          <span>
            {dueDate ? format(new Date(dueDate), 'dd MMM yyyy') : 'N/A'}
          </span>
        </div>
      );
    }
  },
  {
    accessorKey: 'academic_year',
    id: 'academic_year',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Academic Year' />
    ),
    size: 140,
    minSize: 120,
    maxSize: 160,
    cell: ({ row }) => (
      <span className='text-sm'>
        {row.original.academic_year?.academic_year_name ?? 'Unspecified'}
      </span>
    ),
    enableSorting: false
  },
  {
    accessorKey: 'final_amount',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Amount' />
    ),
    size: 120,
    minSize: 100,
    maxSize: 150,
    cell: ({ row }) => {
      const bill = row.original;
      const formatCurrency = (amount: number) => {
        return utilFormatCurrency(amount, { showDecimals: true });
      };

      return (
        <div className='flex items-center gap-2'>
          <IndianRupee className='h-4 w-4 text-muted-foreground' />
          <div>
            <div className='font-medium'>
              {formatCurrency(bill.final_amount)}
            </div>
            {bill.status === 'partially_paid' && (
              <div className='text-sm text-muted-foreground'>
                Balance: {formatCurrency(bill.balance_amount)}
              </div>
            )}
          </div>
        </div>
      );
    }
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    size: 120,
    minSize: 100,
    maxSize: 150,
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      const statusConfig = {
        paid: { label: 'Paid', variant: 'default' as const },
        unpaid: { label: 'Unpaid', variant: 'secondary' as const },
        partially_paid: {
          label: 'Partially Paid',
          variant: 'outline' as const
        },
        overdue: { label: 'Overdue', variant: 'destructive' as const },
        cancelled: { label: 'Cancelled', variant: 'secondary' as const },
        refunded: { label: 'Refunded', variant: 'outline' as const }
      };

      const config =
        statusConfig[status as keyof typeof statusConfig] ||
        statusConfig.unpaid;

      return <Badge variant={config.variant}>{config.label}</Badge>;
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    }
  },
  {
    accessorKey: 'lifecycle_status',
    id: 'lifecycle_status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Learner Status' />
    ),
    size: 140,
    minSize: 120,
    maxSize: 170,
    cell: ({ row }) => {
      const status = row.original.student?.lifecycle_status;
      if (!status) {
        return <span className='text-sm text-muted-foreground'>—</span>;
      }
      return <LifecycleStatusBadge status={status as LifecycleStatus} />;
    },
    // lifecycle_status lives on the embedded learner, not on the bill row, so
    // server-side ordering by it isn't wired — keep it unsortable.
    enableSorting: false
  },

  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created At' />
    ),
    size: 120,
    minSize: 100,
    maxSize: 150,
    cell: ({ row }) => {
      const date = row.getValue('created_at') as string;
      return date ? format(new Date(date), 'dd MMM yyyy') : 'N/A';
    }
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <DataTableRowActions row={row} />,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    size: 60,
    minSize: 60,
    maxSize: 80
  }
];
