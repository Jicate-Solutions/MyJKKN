'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Timetable } from '@/types/academics';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { DataTableRowActions } from './row-actions';
import Link from 'next/link';

/**
 * Status for the list badge, DERIVED — never the stored `is_active` alone.
 *
 * 2026-08-31: a timetable whose end_date had passed still read "Active". The
 * nightly `fn_deactivate_ended_timetables` cron is not at fault — it runs at
 * 00:15 IST and has succeeded every day — but the boolean it maintains is only
 * ever a snapshot, and this cell printed the snapshot:
 *
 *   - templates are DELIBERATELY skipped by that job (`is_template = false` in
 *     its WHERE), so an expired template keeps `is_active = true` forever and
 *     is precisely the row that was reported;
 *   - between midnight IST and the job there is a real, if brief, stale window;
 *   - nothing at all deactivates a timetable whose start_date is still ahead.
 *
 * Deriving instead of writing keeps the fix read-only: the job stays the single
 * writer of `is_active`, and no screen can disagree with the dates on the row.
 *
 * Dates are compared as plain ISO strings in IST — NOT `new Date(...)`, which
 * parses a bare 'YYYY-MM-DD' as UTC midnight and renders a day early at any
 * negative offset.
 */
function timetableStatus({
  isActive,
  isTemplate,
  startDate,
  endDate
}: {
  isActive: boolean;
  isTemplate: boolean;
  startDate: string | null;
  endDate: string | null;
}): { label: string; className: string } {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  // A template is a shape to copy, not a schedule that runs; its dates carry no
  // meaning and it is exempt from expiry by design.
  if (isTemplate) {
    return {
      label: 'Template',
      className: 'bg-purple-50 text-purple-700 border-purple-200'
    };
  }
  if (!isActive) {
    return {
      label: 'Inactive',
      className: 'bg-gray-50 text-gray-700 border-gray-200'
    };
  }
  if (endDate && endDate.slice(0, 10) < today) {
    return {
      label: 'Expired',
      className: 'bg-amber-50 text-amber-700 border-amber-200'
    };
  }
  if (startDate && startDate.slice(0, 10) > today) {
    return {
      label: 'Scheduled',
      className: 'bg-blue-50 text-blue-700 border-blue-200'
    };
  }
  return {
    label: 'Active',
    className: 'bg-green-50 text-green-700 border-green-200'
  };
}

export const getColumns = (adaptLabel?: (label: string) => string): ColumnDef<Timetable>[] => {
  const adapt = adaptLabel || ((label) => label);
  return [
  {
    id: 'select',
    enableResizing: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
      />
    ),
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
    accessorKey: 'timetable_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Timetable Name' />
    ),
    cell: ({ row }) => {
      const timetable = row.original;
      // FIX: 2026-02-03 - Validate timetable ID before creating link
      // Next.js DRP (Dynamic Route Parameter) placeholders (%%drp:id:xxxx%%) can appear
      // during client-side navigation with cacheComponents enabled
      const isValidId = timetable.id && !timetable.id.includes('%%drp:');

      if (!isValidId) {
        // If invalid ID, show name without link
        return (
          <div className='font-medium text-muted-foreground' title='Loading... Please refresh the page'>
            {timetable.timetable_name}
          </div>
        );
      }

      return (
        <Link href={`/academic/timetables/${timetable.id}`}>
          <div className='font-medium hover:text-primary hover:underline'>
            {timetable.timetable_name}
          </div>
        </Link>
      );
    }
  },
  {
    accessorKey: 'academic_year.academic_year_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Academic Year' />
    ),
    cell: ({ row }) => {
      const timetable = row.original;
      return timetable.academic_year?.academic_year_name || '-';
    }
  },
  {
    accessorKey: 'program.program_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={adapt('Program')} />
    ),
    cell: ({ row }) => {
      const timetable = row.original;
      return timetable.program?.program_name || '-';
    }
  },
  {
    accessorKey: 'department.department_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={adapt('Department')} />
    ),
    cell: ({ row }) => {
      const timetable = row.original;
      return timetable.department?.department_name || '-';
    }
  },
  {
    accessorFn: (row) => row.semesters?.semester_name || adapt('Semester'),
    id: 'semester',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={`${adapt('Semester')} / ${adapt('Section')}`} />
    ),
    cell: ({ row }) => {
      const timetable = row.original;
      return `${timetable.semesters?.semester_name || ''}${
        timetable.sections?.section_name
          ? ` / ${timetable.sections.section_name}`
          : ''
      }`;
    }
  },
  {
    accessorKey: 'timetable_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Timetable Type' />
    ),
    cell: ({ row }) => {
      const timetableType = row.getValue('timetable_type') as string;
      return (
        <Badge
          variant={timetableType === 'semester' ? 'default' : 'secondary'}
          className={
            timetableType === 'semester'
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-purple-50 text-purple-700 border-purple-200'
          }
        >
          {timetableType === 'semester' ? adapt('Semester') : adapt('Section')}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'is_active',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => {
      const isActive = row.getValue('is_active') as boolean;
      const { label, className } = timetableStatus({
        isActive,
        isTemplate: (row.original as any)?.is_template === true,
        startDate: (row.original as any)?.start_date ?? null,
        endDate: (row.original as any)?.end_date ?? null
      });
      return (
        <Badge
          variant={label === 'Active' ? 'default' : 'secondary'}
          className={className}
        >
          {label}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'institution.name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution' />
    ),
    cell: ({ row }) => {
      const timetable = row.original;
      return timetable.institution?.name || '-';
    }
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created At' />
    ),
    cell: ({ row }) => {
      const date = row.getValue('created_at') as string;
      return date ? format(new Date(date), 'MMM dd, yyyy') : '-';
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
};
