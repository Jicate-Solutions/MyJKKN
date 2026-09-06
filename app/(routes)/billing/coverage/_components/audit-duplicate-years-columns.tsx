'use client';

import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';
import type { LifecycleStatus } from '@/types/learner-profile';
import { formatCurrency } from '@/lib/utils';
import { AlertTriangle, Building, GraduationCap } from 'lucide-react';
import type { DuplicateYearAuditRow } from '@/types/billing-coverage';

// ── Column ids MUST match the RPC's sort whitelist ─────────────────────────
// Whitelist: full_name, roll_number, register_number, institution_name,
// program_name, semester_section, lifecycle_status, academic_year_name,
// category_names, admission_year, bill_count, total_billed, total_paid,
// outstanding. Anything outside it is enableSorting: false.

export const duplicateYearColumns: ColumnDef<DuplicateYearAuditRow>[] = [
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
    size: 300,
    minSize: 200,
    maxSize: 420,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className='min-w-0 py-0.5'>
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
      );
    }
  },
  {
    // The grain of this table: a learner appears once per offending year, so
    // this column is half the row's identity rather than a detail.
    accessorKey: 'academic_year_name',
    id: 'academic_year_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Academic Year' />
    ),
    size: 150,
    minSize: 125,
    maxSize: 200,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className='space-y-0.5'>
          <span className='whitespace-nowrap font-medium tabular-nums'>
            {r.academic_year_name}
          </span>
          {/* The inverse finding, flagged where it is discovered rather than
              only in a KPI: tuition raised for a year this learner's course no
              longer runs. */}
          {r.is_past_programme_end && (
            <div
              className='flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-500'
              title={`This learner's programme ended in ${r.programme_end_year}`}
            >
              <AlertTriangle className='h-3 w-3 shrink-0' />
              past course end
            </div>
          )}
        </div>
      );
    }
  },
  {
    accessorKey: 'bill_count',
    id: 'bill_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Bills' />
    ),
    size: 130,
    minSize: 110,
    maxSize: 170,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className='space-y-0.5'>
          <Badge className='border-transparent bg-orange-500 text-white hover:bg-orange-600'>
            {r.bill_count} bills
          </Badge>
          <div className='text-[11px] text-muted-foreground'>
            {r.bill_count - 1} extra
          </div>
        </div>
      );
    }
  },
  {
    // Two different year-of-study categories inside one academic year is the
    // signature once_per_learner cannot catch: that trigger matches on
    // (student, category) with no academic-year predicate, so it stops a second
    // "3 Year Tuition Fee" forever but never "1 Year" and "2 Year" in one year.
    accessorKey: 'category_names',
    id: 'category_names',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Categories' />
    ),
    size: 320,
    minSize: 200,
    maxSize: 520,
    cell: ({ row }) => {
      const names = row.original.category_names;
      if (!names) return <span className='text-muted-foreground'>—</span>;
      return (
        <div className='flex flex-wrap gap-1 py-0.5'>
          {names.split(', ').map((c) => (
            <Badge key={c} variant='outline' className='font-normal'>
              {c}
            </Badge>
          ))}
        </div>
      );
    }
  },
  {
    // Not sortable: a derived label, not an RPC sort key. Reading it saves
    // opening every bill to work out whether one run created them all.
    id: 'signature',
    header: 'Likely Cause',
    size: 190,
    minSize: 150,
    maxSize: 260,
    enableSorting: false,
    cell: ({ row }) => {
      const r = row.original;
      if (r.created_same_day && r.due_year_span > 1) {
        return (
          <div className='space-y-0.5'>
            <Badge
              variant='outline'
              className='border-violet-300 bg-violet-50 font-normal text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300'
            >
              Multi-year plan
            </Badge>
            <div className='text-[11px] text-muted-foreground'>
              one run · due dates {r.due_year_span} years apart
            </div>
          </div>
        );
      }
      return (
        <div className='space-y-0.5'>
          <Badge variant='outline' className='font-normal'>
            Needs review
          </Badge>
          <div className='text-[11px] text-muted-foreground'>
            {r.created_same_day ? 'one run' : 'separate runs'} · due dates in{' '}
            {r.due_year_span} year{r.due_year_span === 1 ? '' : 's'}
          </div>
        </div>
      );
    }
  },
  {
    accessorKey: 'admission_year',
    id: 'admission_year',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Admission Year' />
    ),
    size: 140,
    minSize: 120,
    maxSize: 180,
    cell: ({ row }) => (
      <span className='whitespace-nowrap tabular-nums'>
        {row.original.admission_year ?? '—'}
      </span>
    )
  },
  {
    accessorKey: 'programme_end_year',
    id: 'programme_end_year',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Programme Ends' />
    ),
    size: 150,
    minSize: 125,
    maxSize: 190,
    enableSorting: false,
    cell: ({ row }) => {
      const r = row.original;
      if (!r.programme_end_year) {
        return (
          <span
            className='text-xs text-muted-foreground'
            title='programs.program_duration_yrs is not set, so the course end year cannot be derived'
          >
            No duration set
          </span>
        );
      }
      return (
        <span
          className={`whitespace-nowrap tabular-nums ${
            r.is_past_programme_end
              ? 'font-medium text-orange-600 dark:text-orange-500'
              : ''
          }`}
        >
          {r.programme_end_year}
        </span>
      );
    }
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
    accessorKey: 'lifecycle_status',
    id: 'lifecycle_status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    size: 150,
    minSize: 130,
    maxSize: 200,
    cell: ({ row }) => (
      <LifecycleStatusBadge
        status={row.original.lifecycle_status as LifecycleStatus}
      />
    )
  },
  {
    accessorKey: 'total_billed',
    id: 'total_billed',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Billed (Year)' />
    ),
    size: 150,
    minSize: 120,
    maxSize: 190,
    cell: ({ row }) => (
      <div className='text-right font-medium tabular-nums'>
        {formatCurrency(row.original.total_billed)}
      </div>
    )
  },
  {
    accessorKey: 'total_paid',
    id: 'total_paid',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Paid' />
    ),
    size: 140,
    minSize: 120,
    maxSize: 190,
    cell: ({ row }) => (
      <div className='text-right font-medium tabular-nums'>
        {formatCurrency(row.original.total_paid)}
      </div>
    )
  },
  {
    accessorKey: 'outstanding',
    id: 'outstanding',
    // Decides how a duplicate can be unwound: an unpaid extra bill can simply be
    // cancelled, a settled one needs a refund or an adjustment.
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Outstanding' />
    ),
    size: 150,
    minSize: 120,
    maxSize: 190,
    cell: ({ row }) => (
      <div className='text-right font-medium tabular-nums'>
        {row.original.outstanding > 0 ? (
          <span className='text-orange-600 dark:text-orange-500'>
            {formatCurrency(row.original.outstanding)}
          </span>
        ) : (
          <span className='font-normal text-muted-foreground'>
            {formatCurrency(0)}
          </span>
        )}
      </div>
    )
  }
];
