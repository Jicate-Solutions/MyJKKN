'use client';

import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';
import type { LifecycleStatus } from '@/types/learner-profile';
import { formatCurrency } from '@/lib/utils';
import { Building, Bus, GraduationCap, User } from 'lucide-react';
import type { BillCoverageRow } from '@/types/billing-coverage';

// ── Column ids MUST match the RPC's sort whitelist ─────────────────────────
// get_billing_coverage_learners sorts on a fixed set of column names. A column
// whose id is not in that whitelist would send a sort_by the RPC ignores,
// silently returning default-ordered rows while the header shows a sort arrow.
// Any column outside the whitelist is therefore enableSorting: false.
// Whitelist: full_name, roll_number, register_number, institution_name,
// program_name, semester_section, academic_year_name, accommodation_type,
// lifecycle_status, gender, coverage_state, bill_count, total_billed.

// ── Sizing ─────────────────────────────────────────────────────────────────
// Widths are set per column rather than left to auto so the grid is readable
// before the user resizes anything. Learner and Coverage are the two columns
// people actually scan, so they get the most room; identifiers and counts are
// kept narrow to buy that space back. All remain resizable.

/** Coverage is the column the page exists for — highest-contrast treatment. */
function coverageBadge(state: BillCoverageRow['coverage_state']) {
  if (state === 'generated') {
    return (
      <Badge className='border-transparent bg-emerald-600 text-white hover:bg-emerald-700'>
        Generated
      </Badge>
    );
  }
  if (state === 'cannot_evaluate') {
    return (
      <Badge className='border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'>
        Cannot evaluate
      </Badge>
    );
  }
  return (
    <Badge className='border-transparent bg-orange-500 text-white hover:bg-orange-600'>
      Not generated
    </Badge>
  );
}

/** Accommodation colours keyed on the accommodation_types.name values. */
const ACCOMMODATION_STYLES: Record<string, string> = {
  Hostel:
    'border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'Day Scholar':
    'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'Paying Guest':
    'border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300',
  'Not Applicable':
    'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400'
};

const GENDER_STYLES: Record<string, string> = {
  MALE: 'border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-300',
  FEMALE:
    'border-pink-300 bg-pink-100 text-pink-800 dark:border-pink-700 dark:bg-pink-950 dark:text-pink-300'
};

export const columns: ColumnDef<BillCoverageRow>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
      />
    ),
    size: 44,
    minSize: 44,
    maxSize: 44,
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
    accessorKey: 'full_name',
    id: 'full_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Learner' />
    ),
    // Widest column: the name is what people scan for, and roll/register
    // number ride underneath it so the identifier columns can stay narrow.
    size: 280,
    minSize: 220,
    maxSize: 420,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className='flex items-center gap-2 py-0.5'>
          <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted'>
            <User className='h-3.5 w-3.5 text-muted-foreground' />
          </span>
          <div className='min-w-0'>
            <Link
              href={`/billing/schedule/students/${r.learner_id}`}
              className='block truncate font-semibold leading-tight hover:text-primary hover:underline'
              title={r.full_name || 'Unnamed'}
            >
              {r.full_name || 'Unnamed'}
            </Link>
            <div className='truncate text-xs text-muted-foreground'>
              {r.roll_number ?? r.register_number ?? 'No roll number'}
            </div>
          </div>
        </div>
      );
    }
  },
  {
    accessorKey: 'lifecycle_status',
    id: 'lifecycle_status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    // Colours come from the admission_statuses settings table via
    // LifecycleStatusBadge, so they stay consistent with every other learner
    // screen and follow Settings edits without a code change.
    size: 150,
    minSize: 130,
    maxSize: 200,
    cell: ({ row }) => (
      <LifecycleStatusBadge
        status={row.original.lifecycle_status as LifecycleStatus}
        showIcon
      />
    )
  },
  {
    accessorKey: 'coverage_state',
    id: 'coverage_state',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Coverage' />
    ),
    size: 165,
    minSize: 145,
    maxSize: 220,
    cell: ({ row }) => coverageBadge(row.original.coverage_state)
  },
  {
    accessorKey: 'roll_number',
    id: 'roll_number',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Roll Number' />
    ),
    size: 130,
    minSize: 110,
    maxSize: 180,
    cell: ({ row }) => (
      <span className='font-medium tabular-nums'>
        {row.original.roll_number ?? '—'}
      </span>
    )
  },
  {
    accessorKey: 'institution_name',
    id: 'institution_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution' />
    ),
    size: 240,
    minSize: 180,
    maxSize: 380,
    cell: ({ row }) => (
      <div className='flex items-center gap-2'>
        <Building className='h-4 w-4 shrink-0 text-muted-foreground' />
        <span className='truncate' title={row.original.institution_name ?? ''}>
          {row.original.institution_name ?? '—'}
        </span>
      </div>
    )
  },
  {
    accessorKey: 'program_name',
    id: 'program_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Programme' />
    ),
    size: 215,
    minSize: 160,
    maxSize: 340,
    cell: ({ row }) => (
      <div className='flex items-center gap-2'>
        <GraduationCap className='h-4 w-4 shrink-0 text-muted-foreground' />
        <span className='truncate' title={row.original.program_name ?? ''}>
          {row.original.program_name ?? '—'}
        </span>
      </div>
    )
  },
  {
    accessorKey: 'semester_section',
    id: 'semester_section',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Semester · Section' />
    ),
    size: 170,
    minSize: 140,
    maxSize: 240,
    cell: ({ row }) => (
      <span className='whitespace-nowrap'>
        {row.original.semester_section ?? '—'}
      </span>
    )
  },
  {
    accessorKey: 'academic_year_name',
    id: 'academic_year_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Academic Year' />
    ),
    size: 135,
    minSize: 115,
    maxSize: 180,
    cell: ({ row }) => (
      <span className='whitespace-nowrap tabular-nums'>
        {row.original.academic_year_name ?? '—'}
      </span>
    )
  },
  {
    accessorKey: 'accommodation_type',
    id: 'accommodation_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Accommodation' />
    ),
    size: 150,
    minSize: 130,
    maxSize: 200,
    cell: ({ row }) => {
      const value = row.original.accommodation_type;
      if (!value) return <span className='text-muted-foreground'>—</span>;
      return (
        <Badge
          variant='outline'
          className={
            ACCOMMODATION_STYLES[value] ??
            'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }
        >
          {value}
        </Badge>
      );
    }
  },
  {
    // Derived boolean — not in the RPC's sort whitelist, so sorting is off.
    accessorKey: 'uses_transport',
    id: 'uses_transport',
    header: 'Transport',
    size: 115,
    minSize: 95,
    maxSize: 150,
    enableSorting: false,
    cell: ({ row }) =>
      row.original.uses_transport ? (
        <Badge
          variant='outline'
          className='gap-1 border-indigo-300 bg-indigo-100 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
        >
          <Bus className='h-3 w-3' />
          Bus
        </Badge>
      ) : (
        <span className='text-muted-foreground'>—</span>
      )
  },
  {
    accessorKey: 'gender',
    id: 'gender',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Gender' />
    ),
    size: 115,
    minSize: 95,
    maxSize: 150,
    cell: ({ row }) => {
      const g = row.original.gender;
      if (!g) return <span className='text-muted-foreground'>—</span>;
      return (
        <Badge
          variant='outline'
          className={
            GENDER_STYLES[g.toUpperCase()] ??
            'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }
        >
          {g.charAt(0) + g.slice(1).toLowerCase()}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'bill_count',
    id: 'bill_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Bills' />
    ),
    size: 90,
    minSize: 75,
    maxSize: 120,
    cell: ({ row }) => {
      const n = row.original.bill_count;
      return (
        <div className='text-right tabular-nums'>
          {n > 0 ? (
            <span className='font-medium'>{n}</span>
          ) : (
            <span className='text-muted-foreground'>0</span>
          )}
        </div>
      );
    }
  },
  {
    accessorKey: 'total_billed',
    id: 'total_billed',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Total Billed' />
    ),
    size: 140,
    minSize: 120,
    maxSize: 190,
    cell: ({ row }) => (
      <div className='text-right font-medium tabular-nums'>
        {row.original.total_billed > 0 ? (
          formatCurrency(row.original.total_billed)
        ) : (
          <span className='font-normal text-muted-foreground'>—</span>
        )}
      </div>
    )
  }
];
