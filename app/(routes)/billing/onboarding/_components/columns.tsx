'use client';

import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';
import type { OnboardingLearner } from '@/lib/services/billing/onboarding/onboarding-service';
import { OnboardingRowActions } from './row-actions';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Factory function for the onboarding columns. Takes the parent component's
 * selection state so the checkbox column can drive a Set<string> of selected
 * learner IDs (used by the bulk-generate toolbar) without going through
 * TanStack's internal row-selection state.
 */
export function getOnboardingColumns(opts: {
  selectedIds: Set<string>;
  toggleSelected: (id: string, value: boolean) => void;
  toggleAllOnPage: (ids: string[], value: boolean) => void;
  pageRowIds: string[];
  generatingIds: Set<string>;
}): ColumnDef<OnboardingLearner>[] {
  const { selectedIds, toggleSelected, toggleAllOnPage, pageRowIds, generatingIds } = opts;
  const allOnPageSelected =
    pageRowIds.length > 0 && pageRowIds.every((id) => selectedIds.has(id));
  const someOnPageSelected =
    !allOnPageSelected && pageRowIds.some((id) => selectedIds.has(id));

  return [
    {
      id: 'select',
      header: () => (
        <Checkbox
          checked={
            allOnPageSelected ? true : someOnPageSelected ? 'indeterminate' : false
          }
          onCheckedChange={(value) => toggleAllOnPage(pageRowIds, !!value)}
          aria-label="Select all on page"
        />
      ),
      cell: ({ row }) => {
        const id = row.original.id;
        return (
          <Checkbox
            checked={selectedIds.has(id)}
            onCheckedChange={(value) => toggleSelected(id, !!value)}
            aria-label="Select row"
          />
        );
      },
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
            {/* Name links to the learner detail page. Using next/link gives
                prefetching + ctrl-click new-tab for free. */}
            <Link
              href={`/learners/profiles/${learner.id}`}
              className="font-medium text-green-600 hover:underline dark:text-green-400"
            >
              {learner.first_name} {learner.last_name || ''}
            </Link>
            <div className="text-xs text-muted-foreground">{learner.application_id || ''}</div>
          </div>
        );
      },
    },
    {
      id: 'contact',
      header: 'Contact',
      size: 200,
      cell: ({ row }) => (
        <div>
          <div className="text-sm">{row.original.college_email || row.original.student_email}</div>
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
      id: 'bill_status',
      header: 'Bill Status',
      size: 150,
      cell: ({ row }) => {
        const id = row.original.id;
        const billCount = row.original.bills.length;
        if (generatingIds.has(id)) {
          return (
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              Generating…
            </Badge>
          );
        }
        if (billCount === 0) {
          return (
            <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300">
              Not Generated
            </Badge>
          );
        }
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            Generated · {billCount} {billCount === 1 ? 'bill' : 'bills'}
          </Badge>
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
      accessorKey: 'lifecycle_status',
      header: 'Learner Status',
      size: 140,
      cell: ({ row }) => (
        <LifecycleStatusBadge status={row.original.lifecycle_status} />
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      size: 60,
      cell: ({ row }) => <OnboardingRowActions learner={row.original} />,
    },
  ];
}

// Backwards-compat: a no-op default array kept so any older import path still
// type-checks. Prefer getOnboardingColumns() above for the live UI.
export const onboardingColumns: ColumnDef<OnboardingLearner>[] = getOnboardingColumns({
  selectedIds: new Set(),
  toggleSelected: () => {},
  toggleAllOnPage: () => {},
  pageRowIds: [],
  generatingIds: new Set(),
});
