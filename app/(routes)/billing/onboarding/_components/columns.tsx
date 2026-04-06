'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { OnboardingLearner } from '@/lib/services/billing/onboarding/onboarding-service';
import { OnboardingRowActions } from './row-actions';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export const onboardingColumns: ColumnDef<OnboardingLearner>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    size: 50,
    enableSorting: false,
  },
  {
    accessorKey: 'first_name',
    header: 'Student Name',
    size: 200,
    cell: ({ row }) => {
      const learner = row.original;
      return (
        <div>
          <div className="font-medium">{learner.first_name} {learner.last_name || ''}</div>
          <div className="text-xs text-muted-foreground">{learner.application_id || ''}</div>
        </div>
      );
    },
  },
  {
    accessorKey: 'student_email',
    header: 'Contact',
    size: 200,
    cell: ({ row }) => (
      <div>
        <div className="text-sm">{row.original.student_email}</div>
        <div className="text-xs text-muted-foreground">{row.original.student_mobile}</div>
      </div>
    ),
  },
  {
    id: 'program',
    header: 'Program',
    size: 180,
    cell: ({ row }) => {
      const learner = row.original;
      return (
        <div>
          <div className="text-sm">{(learner as any).program?.program_name || '-'}</div>
          <div className="text-xs text-muted-foreground">
            {(learner as any).degree?.degree_name || ''}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'total_fees',
    header: 'Total Fees',
    size: 120,
    cell: ({ row }) => (
      <div className="font-medium">{formatCurrency(row.original.total_fees)}</div>
    ),
  },
  {
    accessorKey: 'total_paid',
    header: 'Paid',
    size: 120,
    cell: ({ row }) => (
      <div className="text-green-600 dark:text-green-400">{formatCurrency(row.original.total_paid)}</div>
    ),
  },
  {
    accessorKey: 'total_balance',
    header: 'Balance',
    size: 120,
    cell: ({ row }) => {
      const balance = row.original.total_balance;
      return (
        <div className={balance > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-green-600 dark:text-green-400 font-medium'}>
          {formatCurrency(balance)}
        </div>
      );
    },
  },
  {
    id: 'payment_status',
    header: 'Payment Status',
    size: 140,
    cell: ({ row }) => {
      const { total_fees, total_paid, total_balance } = row.original;
      if (total_fees === 0) return <Badge variant="outline">No Bills</Badge>;
      if (total_balance === 0) return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Fully Paid</Badge>;
      if (total_paid > 0) return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Partial</Badge>;
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Unpaid</Badge>;
    },
  },
  {
    accessorKey: 'days_pending',
    header: 'Days',
    size: 80,
    cell: ({ row }) => {
      const days = row.original.days_pending;
      return (
        <span className={days > 14 ? 'text-red-600 font-medium' : days > 7 ? 'text-yellow-600' : ''}>
          {days}d
        </span>
      );
    },
  },
  {
    id: 'actions',
    header: '',
    size: 60,
    cell: ({ row }) => <OnboardingRowActions learner={row.original} />,
  },
];
