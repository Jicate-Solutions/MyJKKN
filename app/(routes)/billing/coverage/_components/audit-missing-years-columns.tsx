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
import type { MissingYearAuditRow } from '@/types/billing-coverage';

// ── Column ids MUST match the RPC's sort whitelist ─────────────────────────
// get_billing_audit_missing_years sorts on a fixed set of names; a column whose
// id is outside it would send a sort_by the RPC ignores, showing a sort arrow
// over default-ordered rows. Whitelist: full_name, roll_number,
// register_number, institution_name, program_name, semester_section,
// lifecycle_status, gender, first_missing_year, audit_state, admission_year,
// expected_years, billed_years, missing_years, tuition_bill_count,
// total_billed, total_paid.
//
// missing_year_names is NOT sortable — sorting learners by a comma list is
// meaningless; first_missing_year is the sortable form of the same fact.

function stateBadge(row: MissingYearAuditRow) {
  if (row.audit_state === 'cannot_evaluate') {
    return (
      <Badge className='border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'>
        Cannot evaluate
      </Badge>
    );
  }
  if (row.audit_state === 'complete') {
    return (
      <Badge className='border-transparent bg-emerald-600 text-white hover:bg-emerald-700'>
        Complete
      </Badge>
    );
  }
  return (
    <div className='space-y-0.5'>
      <Badge className='border-transparent bg-orange-500 text-white hover:bg-orange-600'>
        {row.missing_years} missing
      </Badge>
      {/* The distinguishing detail: this learner's LATEST EXPECTED year is
          billed, so the gap is a backlog rather than a learner nobody has
          billed at all. For a finished cohort that year is their course's last
          year, not the institution's current one. */}
      {row.has_current_year && (
        <div className='text-[11px] text-muted-foreground'>
          latest year billed
        </div>
      )}
      {/* The window could not be capped, so the tail of the Missing Years list
          is unproven rather than confirmed. Said on the row, not just in a KPI
          — whoever works this queue reads rows, not tiles. */}
      {!row.duration_configured && (
        <div className='text-[11px] text-amber-600 dark:text-amber-500'>
          duration not set
        </div>
      )}
    </div>
  );
}

export const missingYearColumns: ColumnDef<MissingYearAuditRow>[] = [
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
    accessorKey: 'audit_state',
    id: 'audit_state',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Result' />
    ),
    size: 150,
    minSize: 130,
    maxSize: 200,
    cell: ({ row }) => stateBadge(row.original)
  },
  {
    // The column this tab exists for: the years to actually raise bills for.
    // Widest in the grid — a learner can be missing six years, and truncating
    // the list would turn the one actionable cell into a lookup.
    accessorKey: 'missing_year_names',
    id: 'missing_year_names',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Missing Years' />
    ),
    size: 320,
    minSize: 200,
    maxSize: 520,
    enableSorting: false,
    cell: ({ row }) => {
      const names = row.original.missing_year_names;
      if (!names) return <span className='text-muted-foreground'>—</span>;
      return (
        <div className='flex flex-wrap gap-1 py-0.5'>
          {names.split(', ').map((y) => (
            <Badge
              key={y}
              variant='outline'
              className='border-orange-300 bg-orange-50 font-normal tabular-nums text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300'
            >
              {y}
            </Badge>
          ))}
        </div>
      );
    }
  },
  {
    // Billed / expected read as a fraction so the shape of the gap is visible
    // at a glance: 0/4 is a learner nobody billed, 3/4 is one missed year.
    accessorKey: 'billed_years',
    id: 'billed_years',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Billed / Expected' />
    ),
    size: 150,
    minSize: 130,
    maxSize: 190,
    cell: ({ row }) => {
      const r = row.original;
      if (r.audit_state === 'cannot_evaluate') {
        return <span className='text-muted-foreground'>—</span>;
      }
      return (
        <div className='text-right tabular-nums'>
          <span
            className={
              r.missing_years > 0 ? 'font-medium text-orange-600 dark:text-orange-500' : 'font-medium'
            }
          >
            {r.billed_years}
          </span>
          <span className='text-muted-foreground'> / {r.expected_years}</span>
        </div>
      );
    }
  },
  {
    accessorKey: 'admission_year',
    id: 'admission_year',
    // The audit's lower bound. Shown next to the missing years because the two
    // together are the whole argument: cohort 2024 with 2024-2025 missing is a
    // gap from day one, not a mid-programme lapse.
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
    accessorKey: 'first_missing_year',
    id: 'first_missing_year',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='First Missing' />
    ),
    size: 140,
    minSize: 120,
    maxSize: 180,
    cell: ({ row }) => (
      <span className='whitespace-nowrap tabular-nums'>
        {row.original.first_missing_year ?? '—'}
      </span>
    )
  },
  {
    // The upper bound of the audited window, next to Admission Year which is
    // its lower bound. Together they are the whole rule, so a reader can check
    // the Missing Years list rather than take it on trust.
    accessorKey: 'programme_end_year',
    id: 'programme_end_year',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Programme Ends' />
    ),
    size: 155,
    minSize: 130,
    maxSize: 200,
    cell: ({ row }) => {
      const r = row.original;
      if (!r.duration_configured) {
        return (
          <Badge
            variant='outline'
            className='border-amber-300 bg-amber-50 font-normal text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
            title='Set Programme Duration (Yrs) on this programme to bound the audited window'
          >
            No duration set
          </Badge>
        );
      }
      return (
        <span className='whitespace-nowrap tabular-nums'>
          {r.programme_end_year ?? '—'}
          {r.program_duration_yrs != null && (
            <span className='text-muted-foreground'>
              {' '}
              ({r.program_duration_yrs}y)
            </span>
          )}
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
    accessorKey: 'tuition_bill_count',
    id: 'tuition_bill_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Tuition Bills' />
    ),
    size: 130,
    minSize: 110,
    maxSize: 170,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className='flex items-center justify-end gap-1 tabular-nums'>
          {/* A tuition bill with no academic year satisfies no year check, so a
              learner can read as a clean gap while the bill exists. Flagged on
              the row rather than left to be discovered in the bill list. */}
          {r.unassigned_tuition_bills > 0 && (
            <span
              title={`${r.unassigned_tuition_bills} tuition bill(s) carry no academic year and cannot count toward any year`}
            >
              <AlertTriangle className='h-3.5 w-3.5 text-amber-500' />
            </span>
          )}
          {r.tuition_bill_count > 0 ? (
            <span className='font-medium'>{r.tuition_bill_count}</span>
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
      <DataTableColumnHeader column={column} title='Tuition Billed' />
    ),
    size: 145,
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
  },
  {
    accessorKey: 'total_paid',
    id: 'total_paid',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Tuition Paid' />
    ),
    size: 145,
    minSize: 120,
    maxSize: 190,
    cell: ({ row }) => (
      <div className='text-right font-medium tabular-nums'>
        {row.original.tuition_bill_count > 0 ? (
          formatCurrency(row.original.total_paid)
        ) : (
          <span className='font-normal text-muted-foreground'>—</span>
        )}
      </div>
    )
  }
];
