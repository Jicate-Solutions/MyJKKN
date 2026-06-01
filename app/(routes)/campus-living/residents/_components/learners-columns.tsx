'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Eye } from 'lucide-react';
import type { LearnerHostelite } from '@/types/campus-living';

function fullName(l: LearnerHostelite): string {
  const parts = [l.first_name, l.last_name].filter(Boolean).map((s) => s!.trim());
  return parts.join(' ') || '(unnamed)';
}

export interface LearnerColumnHandlers {
  canEdit: boolean;
  isSuperAdmin: boolean;
  instName: (id: string) => string;
  onView: (learner: LearnerHostelite) => void;
  onEdit: (learner: LearnerHostelite) => void;
  onRemove: (learner: LearnerHostelite) => void;
}

// Column order: Roll, Name, Institution (super-admin only), Degree, Program,
// Semester, Gender, Block, Action.
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

  const degreeCol: ColumnDef<LearnerHostelite> = {
    accessorKey: 'degree_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Degree' />,
    cell: ({ row }) => (
      <span className='text-sm'>{row.original.degree_name ?? 'Not specified'}</span>
    ),
    size: 160,
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

  const genderCol: ColumnDef<LearnerHostelite> = {
    accessorKey: 'gender',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Gender' />,
    cell: ({ row }) => (
      <span className='text-xs capitalize'>{row.original.gender?.toLowerCase() ?? '—'}</span>
    ),
    size: 90,
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

  const actionsCol: ColumnDef<LearnerHostelite> = {
    id: 'actions',
    header: () => <span className='sr-only'>Actions</span>,
    cell: ({ row }) => (
      <div className='flex justify-end gap-1'>
        <Button variant='ghost' size='sm' onClick={() => h.onView(row.original)} title='View details'>
          <Eye className='h-4 w-4' />
        </Button>
        {h.canEdit && (
          <Button variant='ghost' size='sm' onClick={() => h.onEdit(row.original)} title='Edit hostel details'>
            <Pencil className='h-4 w-4' />
          </Button>
        )}
        <Button
          variant='ghost'
          size='sm'
          onClick={() => h.onRemove(row.original)}
          title='Remove from hostel (mark as day scholar)'
        >
          <Trash2 className='h-4 w-4 text-destructive' />
        </Button>
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    size: 120,
  };

  return [
    rollCol,
    nameCol,
    ...(h.isSuperAdmin ? [institutionCol] : []),
    degreeCol,
    programCol,
    semesterCol,
    genderCol,
    blockCol,
    actionsCol,
  ];
}
