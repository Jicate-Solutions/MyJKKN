'use client';

import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { formatCurrency } from '@/lib/utils';
import { User, Building, GraduationCap, Bus } from 'lucide-react';
import type { BillCoverageRow } from '@/types/billing-coverage';

// ── Column ids MUST match the RPC's sort whitelist ─────────────────────────
// get_billing_coverage_learners sorts on a fixed set of column names; a column
// whose id is not in that whitelist would send a sort_by the RPC ignores,
// silently returning default-ordered rows while the header shows a sort arrow.
// Any column not in the whitelist is therefore marked enableSorting: false.
// Whitelist: full_name, roll_number, register_number, institution_name,
// program_name, semester_section, academic_year_name, accommodation_type,
// lifecycle_status, gender, coverage_state, bill_count, total_billed.

function coverageBadge(state: BillCoverageRow['coverage_state']) {
  if (state === 'generated') {
    return (
      <Badge className='border-green-200 bg-green-100 text-green-800'>
        Generated
      </Badge>
    );
  }
  if (state === 'cannot_evaluate') {
    return <Badge variant='outline'>Cannot evaluate</Badge>;
  }
  return (
    <Badge className='border-orange-200 bg-orange-100 text-orange-800'>
      Not generated
    </Badge>
  );
}

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
    accessorKey: 'roll_number',
    id: 'roll_number',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Roll Number' />
    ),
    size: 130,
    minSize: 110,
    cell: ({ row }) => (
      <span className='font-medium'>{row.original.roll_number ?? '—'}</span>
    )
  },
  {
    accessorKey: 'full_name',
    id: 'full_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Learner' />
    ),
    size: 220,
    minSize: 180,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className='flex items-center gap-2'>
          <User className='h-4 w-4 shrink-0 text-muted-foreground' />
          <div className='min-w-0'>
            <Link
              href={`/billing/schedule/students/${r.learner_id}`}
              className='block truncate font-medium hover:text-primary hover:underline'
            >
              {r.full_name || 'Unnamed'}
            </Link>
            {r.register_number && (
              <div className='truncate text-sm text-muted-foreground'>
                {r.register_number}
              </div>
            )}
          </div>
        </div>
      );
    }
  },
  {
    accessorKey: 'institution_name',
    id: 'institution_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution' />
    ),
    size: 230,
    minSize: 180,
    cell: ({ row }) => (
      <div className='flex items-center gap-2'>
        <Building className='h-4 w-4 shrink-0 text-muted-foreground' />
        <span className='truncate'>{row.original.institution_name ?? '—'}</span>
      </div>
    )
  },
  {
    accessorKey: 'program_name',
    id: 'program_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Programme' />
    ),
    size: 200,
    minSize: 150,
    cell: ({ row }) => (
      <div className='flex items-center gap-2'>
        <GraduationCap className='h-4 w-4 shrink-0 text-muted-foreground' />
        <span className='truncate'>{row.original.program_name ?? '—'}</span>
      </div>
    )
  },
  {
    accessorKey: 'semester_section',
    id: 'semester_section',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Semester · Section' />
    ),
    size: 160,
    minSize: 130,
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
    size: 130,
    minSize: 110,
    cell: ({ row }) => (
      <span className='whitespace-nowrap'>
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
    size: 140,
    minSize: 120,
    cell: ({ row }) => (
      <span className='whitespace-nowrap'>
        {row.original.accommodation_type ?? '—'}
      </span>
    )
  },
  {
    // Derived boolean — not in the RPC's sort whitelist, so sorting is off.
    accessorKey: 'uses_transport',
    id: 'uses_transport',
    header: 'Transport',
    size: 110,
    minSize: 90,
    enableSorting: false,
    cell: ({ row }) =>
      row.original.uses_transport ? (
        <Badge variant='outline' className='gap-1'>
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
    size: 110,
    minSize: 90,
    cell: ({ row }) => (
      <span className='capitalize'>
        {row.original.gender ? row.original.gender.toLowerCase() : '—'}
      </span>
    )
  },
  {
    accessorKey: 'lifecycle_status',
    id: 'lifecycle_status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    size: 120,
    minSize: 100,
    cell: ({ row }) => (
      <span className='capitalize'>{row.original.lifecycle_status}</span>
    )
  },
  {
    accessorKey: 'bill_count',
    id: 'bill_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Bills' />
    ),
    size: 90,
    minSize: 70,
    cell: ({ row }) => (
      <div className='text-right tabular-nums'>{row.original.bill_count}</div>
    )
  },
  {
    accessorKey: 'total_billed',
    id: 'total_billed',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Total Billed' />
    ),
    size: 130,
    minSize: 110,
    cell: ({ row }) => (
      <div className='text-right tabular-nums'>
        {row.original.total_billed > 0
          ? formatCurrency(row.original.total_billed)
          : '—'}
      </div>
    )
  },
  {
    accessorKey: 'coverage_state',
    id: 'coverage_state',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Coverage' />
    ),
    size: 150,
    minSize: 130,
    cell: ({ row }) => coverageBadge(row.original.coverage_state)
  }
];
