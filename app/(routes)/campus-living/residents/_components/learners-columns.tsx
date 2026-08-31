'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Pencil, Eye, MoreHorizontal } from 'lucide-react';
import type { LearnerHostelite } from '@/types/campus-living';
import { formatCurrency } from '@/lib/utils';

function fullName(l: LearnerHostelite): string {
  const parts = [l.first_name, l.last_name].filter(Boolean).map((s) => s!.trim());
  return parts.join(' ') || '(unnamed)';
}

// 2026-07-06: row actions are View + Edit only. Allocation actions (allocate /
// change bed / remove-reset) live in the Allocations module — duplicating them
// here caused two competing entry points for the same operations.
export interface LearnerColumnHandlers {
  canEdit: boolean;
  isSuperAdmin: boolean;
  instName: (id: string) => string;
  onView: (learner: LearnerHostelite) => void;
  onEdit: (learner: LearnerHostelite) => void;
}

// Column order: Roll, Name, Institution (super-admin only), Program,
// Semester, Academic Year, Block, Status, Bills, Action.
export function getLearnerColumns(
  h: LearnerColumnHandlers,
): ColumnDef<LearnerHostelite>[] {
  const rollCol: ColumnDef<LearnerHostelite> = {
    accessorKey: 'roll_number',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Roll' />,
    cell: ({ row }) => (
      <span className='font-mono text-xs'>{row.original.roll_number ?? '—'}</span>
    ),
    size: 120,
  };

  const nameCol: ColumnDef<LearnerHostelite> = {
    accessorKey: 'first_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Name' />,
    cell: ({ row }) => (
      <button
        type='button'
        onClick={() => h.onView(row.original)}
        className='font-medium text-primary hover:underline text-left'
      >
        {fullName(row.original)}
      </button>
    ),
    size: 200,
  };

  const institutionCol: ColumnDef<LearnerHostelite> = {
    id: 'institution',
    accessorFn: (r) => r.institution_id,
    header: ({ column }) => <DataTableColumnHeader column={column} title='Institution' />,
    cell: ({ row }) => (
      <span className='text-xs text-muted-foreground'>
        {h.instName(row.original.institution_id)}
      </span>
    ),
    enableSorting: false,
    size: 200,
  };

  const programCol: ColumnDef<LearnerHostelite> = {
    accessorKey: 'program_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Program' />,
    cell: ({ row }) => (
      <span className='text-sm'>{row.original.program_name ?? 'Not specified'}</span>
    ),
    size: 180,
  };

  const semesterCol: ColumnDef<LearnerHostelite> = {
    accessorKey: 'semester_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Semester' />,
    cell: ({ row }) => (
      <span className='text-sm'>{row.original.semester_name ?? '—'}</span>
    ),
    size: 120,
  };

  // Academic Year — the current term label (learners_profiles.academic_year_id),
  // surfaced as academic_year_name by v_learner_hostelites. Not in the service's
  // SORTABLE set, so sorting is disabled to avoid a no-op sort affordance.
  const academicYearCol: ColumnDef<LearnerHostelite> = {
    id: 'academic_year_name',
    accessorFn: (r) => r.academic_year_name,
    header: ({ column }) => <DataTableColumnHeader column={column} title='Academic Year' />,
    cell: ({ row }) => (
      <span className='text-sm'>{row.original.academic_year_name ?? '—'}</span>
    ),
    enableSorting: false,
    size: 140,
  };

  // Admission Year — the intake cohort (v_learner_hostelites.program_start_year,
  // computed from admission_years.year). Sits next to Academic Year because the
  // two differ for every learner past their first year, and the Admission Year
  // filter narrows on THIS one. Sortable: program_start_year is in the service's
  // SORTABLE set.
  const admissionYearCol: ColumnDef<LearnerHostelite> = {
    id: 'program_start_year',
    accessorFn: (r) => r.program_start_year,
    header: ({ column }) => <DataTableColumnHeader column={column} title='Admission Year' />,
    cell: ({ row }) => (
      <span className='text-sm tabular-nums'>
        {row.original.program_start_year ?? '—'}
      </span>
    ),
    size: 130,
  };

  const blockCol: ColumnDef<LearnerHostelite> = {
    accessorKey: 'current_block_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Block' />,
    cell: ({ row }) => {
      const name = row.original.current_block_name;
      if (!name) return <Badge variant='outline'>Unassigned</Badge>;
      const code = row.original.current_block_code;
      return <span className='text-sm'>{name}{code ? ` (${code})` : ''}</span>;
    },
    size: 160,
  };

  const currentRoomCol: ColumnDef<LearnerHostelite> = {
    id: 'current_room',
    header: 'Current Room',
    cell: ({ row }) => {
      const r = row.original.current_room_number;
      if (!r) return <span className="text-sm text-muted-foreground">—</span>;
      const bed = row.original.current_bed_number;
      return <span className="text-sm">{r}{bed ? ` · Bed ${bed}` : ''}</span>;
    },
    enableSorting: false,
    size: 130,
  };

  const messCategoryCol: ColumnDef<LearnerHostelite> = {
    id: 'mess_category',
    accessorFn: (r) => r.mess_category_name,
    header: 'Mess Category',
    cell: ({ row }) =>
      row.original.mess_category_name
        ? <span className="text-sm">{row.original.mess_category_name}</span>
        : <span className="text-sm text-muted-foreground">—</span>,
    enableSorting: false,
    size: 140,
  };

  // Current room category (learners_profiles.hostel_category_id → name via
  // v_learner_hostelites). '—' when not yet assigned.
  const roomCategoryCol: ColumnDef<LearnerHostelite> = {
    id: 'room_category',
    accessorFn: (r) => r.hostel_category_name,
    header: ({ column }) => <DataTableColumnHeader column={column} title='Room Category' />,
    cell: ({ row }) =>
      row.original.hostel_category_name ? (
        <span className='text-sm'>{row.original.hostel_category_name}</span>
      ) : (
        <span className='text-sm text-muted-foreground'>—</span>
      ),
    enableSorting: false,
    size: 140,
  };

  // Lifecycle status — the view is filtered to active/reserved/admitted, so only
  // those three appear, but the column makes the distinction explicit.
  const statusCol: ColumnDef<LearnerHostelite> = {
    id: 'lifecycle_status',
    accessorFn: (r) => r.lifecycle_status,
    header: ({ column }) => <DataTableColumnHeader column={column} title='Status' />,
    cell: ({ row }) => {
      const s = row.original.lifecycle_status;
      if (!s) return <span className='text-sm text-muted-foreground'>—</span>;
      const cls: Record<string, string> = {
        active: 'bg-green-100 text-green-800 hover:bg-green-100',
        reserved: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
        admitted: 'bg-violet-100 text-violet-800 hover:bg-violet-100',
      };
      return (
        <Badge className={`w-fit border-transparent ${cls[s] ?? ''}`}>
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </Badge>
      );
    },
    enableSorting: false,
    size: 120,
  };

  const billsCol: ColumnDef<LearnerHostelite> = {
    id: 'current_year_bills',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Current-Year Bills' />
    ),
    cell: ({ row }) => {
      const s = row.original.bill_status;
      if (!s) return <span className='text-sm text-muted-foreground'>—</span>;
      const generated = s.bill_count > 0;
      return (
        <div className='flex flex-col gap-0.5'>
          {generated ? (
            <Badge className='w-fit border-transparent bg-green-100 text-green-800 hover:bg-green-100'>
              Generated ({s.bill_count})
            </Badge>
          ) : (
            <Badge variant='secondary' className='w-fit'>
              Not generated
            </Badge>
          )}
          {generated && (
            <span className='text-xs text-muted-foreground'>
              Billed {formatCurrency(s.total_billed)}
            </span>
          )}
        </div>
      );
    },
    enableSorting: false,
    size: 170,
  };

  const actionsCol: ColumnDef<LearnerHostelite> = {
    id: 'actions',
    header: () => <div className='text-right'>Actions</div>,
    cell: ({ row }) => (
      <div className='flex justify-end'>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='sm' className='h-8 w-8 p-0'>
              <span className='sr-only'>Open actions menu</span>
              <MoreHorizontal className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onClick={() => h.onView(row.original)}>
              <Eye className='mr-2 h-4 w-4' /> View details
            </DropdownMenuItem>
            {h.canEdit && (
              <DropdownMenuItem onClick={() => h.onEdit(row.original)}>
                <Pencil className='mr-2 h-4 w-4' /> Edit hostel details
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    size: 90,
  };

  return [
    rollCol,
    nameCol,
    ...(h.isSuperAdmin ? [institutionCol] : []),
    programCol,
    semesterCol,
    academicYearCol,
    admissionYearCol,
    blockCol,
    currentRoomCol,
    messCategoryCol,
    roomCategoryCol,
    statusCol,
    billsCol,
    actionsCol,
  ];
}
