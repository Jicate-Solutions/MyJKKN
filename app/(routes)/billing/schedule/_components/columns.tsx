'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { StudentBill } from '@/types/billing-schedule';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { DataTableRowActions } from './row-actions';
import Link from 'next/link';
import { User, Building, Calendar, DollarSign, RefreshCw } from 'lucide-react';

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
    enableHiding: false
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
                {`${bill.student?.first_name || ''} ${bill.student?.last_name || ''}`.trim()}
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
      const nameA = `${rowA.original.student?.first_name || ''} ${rowA.original.student?.last_name || ''}`.trim();
      const nameB = `${rowB.original.student?.first_name || ''} ${rowB.original.student?.last_name || ''}`.trim();
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
    accessorKey: 'bill_description',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Description' />
    ),
    size: 200,
    minSize: 150,
    maxSize: 300,
    cell: ({ row }) => {
      const bill = row.original;
      return (
        <div className='font-medium hover:text-primary hover:underline'>
          <Link href={`/billing/schedule/${bill.id}`}>
            <div className='max-w-[200px] truncate' title={bill.bill_description}>
              {bill.bill_description}
            </div>
          </Link>
        </div>
      );
    }
  },
  {
    accessorKey: 'item_category.item_category_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Category' />
    ),
    size: 180,
    minSize: 150,
    maxSize: 200,
    cell: ({ row }) => {
      const bill = row.original;
      return (
        <div>
          <div className='font-medium'>
            {bill.item_category?.item_category_name || 'N/A'}
          </div>
          {bill.item_category?.parent_category && (
            <div className='text-sm text-muted-foreground'>
              {bill.item_category.parent_category.parent_category_name}
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
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR'
        }).format(amount);
      };

      return (
        <div className='flex items-center gap-2'>
          <DollarSign className='h-4 w-4 text-muted-foreground' />
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
        partially_paid: { label: 'Partially Paid', variant: 'outline' as const },
        overdue: { label: 'Overdue', variant: 'destructive' as const },
        cancelled: { label: 'Cancelled', variant: 'secondary' as const },
        refunded: { label: 'Refunded', variant: 'outline' as const }
      };

      const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.unpaid;

      return <Badge variant={config.variant}>{config.label}</Badge>;
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    }
  },
  {
    accessorKey: 'is_recurring',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Recurring' />
    ),
    size: 120,
    minSize: 100,
    maxSize: 150,
    cell: ({ row }) => {
      const bill = row.original;
      return (
        <div className='flex items-center gap-2'>
          {bill.is_recurring && (
            <>
              <RefreshCw className='h-4 w-4 text-muted-foreground' />
              <span className='text-sm'>
                {bill.recurrence_pattern}
              </span>
            </>
          )}
          {!bill.is_recurring && <span className='text-sm text-muted-foreground'>One-time</span>}
        </div>
      );
    }
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
    size: 60,
    minSize: 60,
    maxSize: 80
  }
];