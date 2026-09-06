'use client';
/**
 * Column definitions for the Learner Onboarding DataTable.
 *
 * Largely mirrors profiles/_components/columns.tsx so admins switching between
 * the two pages don't get visual whiplash. Differences:
 *   - Adds "Missing Fields" column with red pill badges.
 *   - Adds "Completion" column with a mini progress bar (N/4).
 *   - Roll Number, Admission Year are likely "N/A" for early-pipeline learners
 *     (admitted/pending/approved), so we render an em-dash placeholder rather
 *     than alarm-looking text.
 *
 * COLUMNS VARY BY TIER (see `getOnboardingColumns`). On `awaiting_payment` the
 * two triage columns above are structurally dead — that tier is defined as 4/4
 * fields filled, so "Missing Fields" is always blank and "Completion" always
 * 4/4 — and are swapped for the fee columns that explain the real blocker.
 */

import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';
import { Copy, Check, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { formatAdmissionYear } from '@/lib/utils/admission-year-format';
import type { OnboardingProfileRow, OnboardingTier } from '@/types/learner-onboarding';
import { MissingFieldsCell } from './missing-fields-cell';
import { CompletionProgressCell } from './completion-progress-cell';
import {
  PaymentProgressCell,
  PaymentAmountCell,
  AmountToThresholdCell,
  basisHint,
  NextInstalmentCell
} from './payment-progress-cell';
import { OnboardingRowActions } from './row-actions';

function isPersonalEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const personalDomains = [
    '@gmail.com',
    '@yahoo.com',
    '@hotmail.com',
    '@outlook.com',
    '@rediffmail.com',
    '@live.com',
    '@mail.com'
  ];
  return personalDomains.some((d) => email.toLowerCase().includes(d));
}

function CollegeEmailCell({ email }: { email: string | null | undefined }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      toast.success('Email copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy email');
    }
  };

  if (!email) {
    return (
      <span className="text-xs italic text-red-600 dark:text-red-400">Not set</span>
    );
  }

  if (isPersonalEmail(email)) {
    return (
      <div className="flex items-center gap-2 w-full bg-red-600 text-white px-2 py-1.5 rounded-md -mx-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-medium whitespace-normal break-all" title={`Personal email: ${email}`}>
          {email}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0 hover:bg-red-700 text-white"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 w-full">
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex-shrink-0" onClick={handleCopy}>
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
      <span className="text-sm whitespace-normal break-all" title={email}>
        {email}
      </span>
    </div>
  );
}

export const onboardingColumns: ColumnDef<OnboardingProfileRow>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: boolean) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    size: 60,
    minSize: 60,
    maxSize: 60
  },
  {
    accessorKey: 'roll_number',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Roll Number" />,
    cell: ({ row }) => (
      <div className="font-mono text-sm">
        {row.original.roll_number || (
          <span className="text-muted-foreground italic">—</span>
        )}
      </div>
    ),
    size: 120
  },
  {
    accessorKey: 'first_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Learner Name" />,
    cell: ({ row }) => {
      const learner = row.original;
      const name = `${learner.first_name} ${learner.last_name || ''}`.trim();
      return (
        <Link
          href={`/learners/profiles/${learner.id}/edit?focus=missing`}
          className="font-medium text-primary hover:underline"
          title="Open edit form focused on missing fields"
        >
          {name}
        </Link>
      );
    },
    size: 180
  },
  {
    accessorKey: 'college_email',
    header: ({ column }) => <DataTableColumnHeader column={column} title="College Email" />,
    cell: ({ row }) => <CollegeEmailCell email={row.original.college_email} />,
    size: 260
  },
  {
    accessorKey: 'institution.name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
    cell: ({ row }) => (
      <div className="text-sm">{row.original.institution?.name || 'N/A'}</div>
    ),
    size: 180
  },
  {
    accessorKey: 'program.program_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Program" />,
    cell: ({ row }) => (
      <div className="text-sm">{row.original.program?.program_name || '—'}</div>
    ),
    size: 140
  },
  {
    id: 'admission_year',
    accessorFn: (row) =>
      (row as any).admission_year_obj?.year ?? (row as any).admission_year ?? null,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Admission Year" />,
    cell: ({ row }) => (
      <div className="text-sm">{formatAdmissionYear(row.original as any) || '—'}</div>
    ),
    size: 150
  },
  {
    id: 'missing_fields',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Missing Fields" />,
    cell: ({ row }) => <MissingFieldsCell fields={row.original.missing_fields} />,
    size: 260,
    enableSorting: false
  },
  {
    id: 'completion',
    accessorFn: (row) => row.filled_count,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Completion" />,
    cell: ({ row }) => (
      <CompletionProgressCell
        filled={row.original.filled_count}
        percent={row.original.completion_percent}
      />
    ),
    size: 110
  },
  {
    accessorKey: 'lifecycle_status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <LifecycleStatusBadge status={row.original.lifecycle_status} />,
    size: 120
  },
  {
    id: 'actions',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Actions" />,
    cell: ({ row }) => <OnboardingRowActions row={row} />,
    size: 60,
    minSize: 60,
    maxSize: 60
  }
];

/**
 * Fee columns, shown only on the Awaiting Payment tier.
 *
 * `enableSorting: false` on all five is deliberate. The DataTable's header sort
 * writes ?sort_by= and the server puts that in an ORDER BY, but these values
 * come from an RPC, not from a learners_profiles column — a header click would
 * silently order by nothing. Fee sorting is offered through the toolbar's Sort
 * dropdown instead, which routes to the JS comparator that can actually honour
 * it (see PAYMENT_SORT_COLUMNS in _data/get-onboarding-learners.ts).
 *
 * Headers are plain spans rather than DataTableColumnHeader: that component
 * renders a bare `<div>{title}</div>` once sorting is off and forwards nothing
 * else, so it cannot carry the `title` tooltip these need. "Fees Due" without
 * the basis spelled out is genuinely ambiguous — a reader who assumes "the
 * whole year" concludes the percentages are wrong when they are simply measured
 * against a different denominator.
 *
 * `basis` only labels the tooltips; every cell reads its own row's basis, so a
 * mixed page could never mislabel an individual figure.
 */
function paymentColumns(basis: Parameters<typeof basisHint>[0]): ColumnDef<OnboardingProfileRow>[] {
  const hint = basisHint(basis);

  const moneyHeader = (label: string, tooltip: string) => (
    <div className="text-right" title={tooltip}>
      {label}
    </div>
  );

  return [
    {
      id: 'payment_progress',
      header: () => <span title={hint}>Progress to Threshold</span>,
      cell: ({ row }) => <PaymentProgressCell payment={row.original.payment} />,
      size: 160,
      enableSorting: false
    },
    {
      id: 'fees_due',
      header: () => moneyHeader('Fees Due', hint),
      cell: ({ row }) => <PaymentAmountCell payment={row.original.payment} field="basis_billed" />,
      size: 120,
      enableSorting: false
    },
    {
      id: 'fees_paid',
      header: () => moneyHeader('Paid', `Received against those bills. ${hint}`),
      cell: ({ row }) => <PaymentAmountCell payment={row.original.payment} field="basis_paid" />,
      size: 120,
      enableSorting: false
    },
    {
      id: 'fees_balance',
      header: () => moneyHeader('Balance', `Outstanding on those bills. ${hint}`),
      cell: ({ row }) => <PaymentAmountCell payment={row.original.payment} field="basis_balance" />,
      size: 120,
      enableSorting: false
    },
    {
      // Placed before 'Need to Admit' deliberately: how much and by when read
      // as one thought, and a caller works down the row left to right.
      id: 'next_instalment',
      header: () => (
        <span title="The earliest instalment this learner still owes. Blank when their fees are not split into instalments.">
          Next Instalment
        </span>
      ),
      cell: ({ row }) => <NextInstalmentCell payment={row.original.payment} />,
      size: 140,
      enableSorting: false
    },
    {
      id: 'amount_to_threshold',
      header: () =>
        moneyHeader(
          'Need to Admit',
          'Further payment required before the status engine promotes this learner.'
        ),
      cell: ({ row }) => <AmountToThresholdCell payment={row.original.payment} />,
      size: 130,
      enableSorting: false
    }
  ];
}

/**
 * The column set for one tier.
 *
 * Only `awaiting_payment` differs: its two triage columns carry no information
 * (that tier is *defined* as 4/4 fields filled) and are replaced by the fee
 * columns. Every other tier keeps the original layout exactly.
 */
export function getOnboardingColumns(
  tier: OnboardingTier,
  basis: Parameters<typeof basisHint>[0] = 'due_to_date'
): ColumnDef<OnboardingProfileRow>[] {
  if (tier !== 'awaiting_payment') return onboardingColumns;

  const swapAt = onboardingColumns.findIndex((c) => c.id === 'missing_fields');
  // If that column is ever renamed, slice(0, -1) would quietly drop the last
  // column instead of failing. Fall back to the base set: a tier missing its
  // fee columns is obvious, a table missing Actions is not.
  if (swapAt < 0) return onboardingColumns;

  const before = onboardingColumns.slice(0, swapAt);
  const after = onboardingColumns.filter(
    (c) => c.id !== 'missing_fields' && c.id !== 'completion' && !before.includes(c)
  );

  return [...before, ...paymentColumns(basis), ...after];
}
