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
 * The Awaiting Payment fee details are NOT columns — they open from the row's
 * "View Progress" action (payment-progress-dialog.tsx).
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
import { OnboardingRowActions } from './row-actions';
import { LearnerProgressNameCell } from './learner-progress-name-cell';

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
    // Name + roll number in one cell. Sorts by name; roll-number sorting stays
    // available from the toolbar's Sort dropdown.
    accessorKey: 'first_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
    cell: ({ row }) => {
      const learner = row.original;
      const name = `${learner.first_name} ${learner.last_name || ''}`.trim();
      return (
        <div className="space-y-0.5 whitespace-normal break-words">
          <Link
            href={`/learners/profiles/${learner.id}/edit?focus=missing`}
            className="font-medium text-primary hover:underline"
            title="Open edit form focused on missing fields"
          >
            {name}
          </Link>
          <div className="font-mono text-xs text-muted-foreground">
            {learner.roll_number || <span className="italic">No roll no.</span>}
          </div>
        </div>
      );
    },
    size: 230
  },
  {
    accessorKey: 'college_email',
    header: ({ column }) => <DataTableColumnHeader column={column} title="College Email" />,
    cell: ({ row }) => <CollegeEmailCell email={row.original.college_email} />,
    size: 260
  },
  {
    id: 'institution_program',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Institution / Program" />
    ),
    cell: ({ row }) => (
      <div className="space-y-0.5 whitespace-normal break-words">
        <div className="text-sm">{row.original.institution?.name || 'N/A'}</div>
        <div className="text-xs text-muted-foreground">
          {row.original.program?.program_name || '—'}
        </div>
      </div>
    ),
    size: 300,
    enableSorting: false
  },
  {
    id: 'admission_year',
    accessorFn: (row) =>
      (row as any).admission_year_obj?.year ?? (row as any).admission_year ?? null,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Admission Year" />,
    cell: ({ row }) => (
      <div className="text-sm whitespace-normal">{formatAdmissionYear(row.original as any) || '—'}</div>
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
    size: 130
  },
  {
    accessorKey: 'lifecycle_status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <LifecycleStatusBadge status={row.original.lifecycle_status} />,
    size: 130
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
 * The column set for one tier.
 *
 * Every tier, Awaiting Payment included, uses the same columns. The fee
 * position (Blocked At, progress, billed / paid / balance, next instalment,
 * need to admit) moved out of the table into the row's "View Progress" dialog
 * (payment-progress-dialog.tsx) on 2026-09-25 — seven extra columns made the
 * table unreadable.
 */
export function getOnboardingColumns(tier: OnboardingTier): ColumnDef<OnboardingProfileRow>[] {
  // Missing fields are worked from the All / Critical tabs. Ready to Activate is
  // complete by definition, and Awaiting Payment is about fees, so the column
  // is dropped there to keep those tables lean.
  // Awaiting Payment also moves Admission Year into the View Progress dialog.
  if (tier === 'awaiting_payment') {
    return onboardingColumns
      .filter((c) => c.id !== 'missing_fields' && c.id !== 'admission_year')
      .map((c) =>
        // The name opens View Progress here, not the profile edit form.
        (c as { accessorKey?: string }).accessorKey === 'first_name'
          ? { ...c, cell: ({ row }) => <LearnerProgressNameCell learner={row.original} /> }
          : c
      );
  }
  if (tier === 'ready_to_activate') {
    return onboardingColumns.filter((c) => c.id !== 'missing_fields');
  }
  return onboardingColumns;
}
