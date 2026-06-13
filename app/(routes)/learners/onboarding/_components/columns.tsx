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
import type { OnboardingProfileRow } from '@/types/learner-onboarding';
import { MissingFieldsCell } from './missing-fields-cell';
import { CompletionProgressCell } from './completion-progress-cell';
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
